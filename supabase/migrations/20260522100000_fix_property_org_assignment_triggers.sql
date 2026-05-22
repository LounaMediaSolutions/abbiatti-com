-- Fix property/org assignment helpers that still reference the legacy
-- `organization_id` column on `properties`. The live schema uses `org_id`,
-- and these stale trigger/function bodies crash when a property is inserted
-- or reassigned from the super-admin UI.

-- Generic org-lock trigger: support both `organization_id` and `org_id`
-- depending on the table being written.
CREATE OR REPLACE FUNCTION public.enforce_org_not_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_data jsonb;
  target_org uuid;
BEGIN
  IF public.is_super_admin(auth.uid()) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  row_data := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  target_org := COALESCE(
    NULLIF(row_data->>'organization_id', '')::uuid,
    NULLIF(row_data->>'org_id', '')::uuid
  );

  IF target_org IS NOT NULL AND public.is_org_locked(target_org) THEN
    RAISE EXCEPTION 'Agence en lecture seule (essai expiré ou suspendue). Contactez le support.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Property manager helper: use the live property org column and modern role
-- resolution so super-admin/admin/co-admin checks work consistently.
CREATE OR REPLACE FUNCTION public.can_manage_property(_user_id uuid, _property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id = _property_id
      AND (
        public.has_role(_user_id, p.org_id, 'admin'::app_role)
        OR public.has_role(_user_id, p.org_id, 'co_admin'::app_role)
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.property_members pm
    WHERE pm.user_id = _user_id
      AND pm.property_id = _property_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.property_cohosts pc
    WHERE pc.user_id = _user_id
      AND pc.property_id = _property_id
  );
$$;

-- Pending-property submissions should evaluate roles against properties.org_id.
CREATE OR REPLACE FUNCTION public.handle_cohost_property_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.submitted_by IS NOT NULL
     AND has_role(NEW.submitted_by, NEW.org_id, 'cohost'::app_role)
     AND NOT has_role(NEW.submitted_by, NEW.org_id, 'admin'::app_role)
     AND NOT has_role(NEW.submitted_by, NEW.org_id, 'co_admin'::app_role)
  THEN
    NEW.approval_status := 'pending';
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.after_property_pending_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient record;
BEGIN
  IF NEW.approval_status = 'pending' AND NEW.submitted_by IS NOT NULL THEN
    INSERT INTO public.property_members (property_id, user_id, organization_id, role, assigned_by)
    VALUES (NEW.id, NEW.submitted_by, NEW.org_id, 'cohost'::app_role, NEW.submitted_by)
    ON CONFLICT DO NOTHING;

    FOR recipient IN
      SELECT DISTINCT user_id
      FROM public.user_roles
      WHERE organization_id = NEW.org_id
        AND role IN ('admin', 'co_admin')
    LOOP
      INSERT INTO public.notifications (organization_id, recipient_id, type, title, body, link)
      VALUES (
        NEW.org_id,
        recipient.user_id,
        'property_pending',
        '🏠 Nouvelle propriété à valider',
        'Le cohost a soumis « ' || NEW.name || ' » pour validation.',
        '/properties'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_property_approval_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    IF NOT (
      public.is_super_admin(auth.uid())
      OR has_role(auth.uid(), NEW.org_id, 'admin'::app_role)
      OR has_role(auth.uid(), NEW.org_id, 'co_admin'::app_role)
    ) THEN
      RAISE EXCEPTION 'Seul un admin ou co-admin peut valider/rejeter une propriété';
    END IF;
    IF NEW.approval_status = 'approved' AND OLD.approval_status <> 'approved' THEN
      NEW.approved_by := auth.uid();
      NEW.approved_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_pending_property_edits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.approval_status = 'pending' THEN
    IF NOT (
      public.is_super_admin(auth.uid())
      OR has_role(auth.uid(), OLD.org_id, 'admin'::app_role)
      OR has_role(auth.uid(), OLD.org_id, 'co_admin'::app_role)
    ) THEN
      RAISE EXCEPTION 'Cette propriété est en attente de validation. Vous ne pouvez pas la modifier tant qu''un admin ou co-admin ne l''a pas validée ou rejetée.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_property_submission_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approval_status = 'pending' THEN
    INSERT INTO public.property_approval_events (property_id, organization_id, event, actor_id)
    VALUES (NEW.id, NEW.org_id, 'submitted', NEW.submitted_by);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_property_status_change_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    IF NEW.approval_status = 'approved' THEN
      INSERT INTO public.property_approval_events (property_id, organization_id, event, actor_id)
      VALUES (NEW.id, NEW.org_id, 'approved', auth.uid());
    ELSIF NEW.approval_status = 'rejected' THEN
      INSERT INTO public.property_approval_events (property_id, organization_id, event, actor_id, reason)
      VALUES (NEW.id, NEW.org_id, 'rejected', auth.uid(), NEW.rejection_reason);
    ELSIF NEW.approval_status = 'pending' THEN
      INSERT INTO public.property_approval_events (property_id, organization_id, event, actor_id)
      VALUES (NEW.id, NEW.org_id, 'resubmitted', auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
