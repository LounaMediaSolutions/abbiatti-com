-- Cohosts can now create properties (pending approval) and invite their own staff
-- Admin/co-admin must approve before the property goes live

-- 1. Add approval columns to properties
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Constraint via trigger (avoid CHECK on text for flexibility)
CREATE OR REPLACE FUNCTION public.validate_property_approval_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.approval_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid approval_status: %', NEW.approval_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_property_approval_status ON public.properties;
CREATE TRIGGER trg_validate_property_approval_status
BEFORE INSERT OR UPDATE OF approval_status ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.validate_property_approval_status();

-- 2. Allow cohosts (and co_admin) to INSERT properties
DROP POLICY IF EXISTS "Admins insert properties" ON public.properties;

CREATE POLICY "Managers insert properties"
ON public.properties
FOR INSERT
TO authenticated
WITH CHECK (
  -- Admin / co_admin can insert directly (status free)
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR has_role(auth.uid(), organization_id, 'co_admin'::app_role)
  -- Cohosts can insert ONLY in pending state, in their own org
  OR (
    has_role(auth.uid(), organization_id, 'cohost'::app_role)
    AND approval_status = 'pending'
    AND submitted_by = auth.uid()
  )
);

-- 3. Auto-mark cohost-submitted properties as pending + auto-assign cohost as member
CREATE OR REPLACE FUNCTION public.handle_cohost_property_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If submitter is a plain cohost (not admin/co_admin), force pending
  IF NEW.submitted_by IS NOT NULL
     AND has_role(NEW.submitted_by, NEW.organization_id, 'cohost'::app_role)
     AND NOT has_role(NEW.submitted_by, NEW.organization_id, 'admin'::app_role)
     AND NOT has_role(NEW.submitted_by, NEW.organization_id, 'co_admin'::app_role)
  THEN
    NEW.approval_status := 'pending';
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_cohost_property_submission ON public.properties;
CREATE TRIGGER trg_handle_cohost_property_submission
BEFORE INSERT ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.handle_cohost_property_submission();

-- 4. After insert: if cohost submitted, auto-add them as cohost member + notify admins/co-admins
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
    -- Auto-link the submitting cohost so they can manage the pending property
    INSERT INTO public.property_members (property_id, user_id, organization_id, role, assigned_by)
    VALUES (NEW.id, NEW.submitted_by, NEW.organization_id, 'cohost'::app_role, NEW.submitted_by)
    ON CONFLICT DO NOTHING;

    -- Notify admins + co-admins
    FOR recipient IN
      SELECT DISTINCT user_id FROM public.user_roles
      WHERE organization_id = NEW.organization_id AND role IN ('admin', 'co_admin')
    LOOP
      INSERT INTO public.notifications (organization_id, recipient_id, type, title, body, link)
      VALUES (
        NEW.organization_id, recipient.user_id, 'property_pending',
        '🏠 Nouvelle propriété à valider',
        'Le cohost a soumis « ' || NEW.name || ' » pour validation.',
        '/properties'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_property_pending_insert ON public.properties;
CREATE TRIGGER trg_after_property_pending_insert
AFTER INSERT ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.after_property_pending_insert();

-- 5. Approval policy: only admin/co_admin can change approval_status to approved/rejected
CREATE OR REPLACE FUNCTION public.guard_property_approval_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    IF NOT (
      has_role(auth.uid(), NEW.organization_id, 'admin'::app_role)
      OR has_role(auth.uid(), NEW.organization_id, 'co_admin'::app_role)
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

DROP TRIGGER IF EXISTS trg_guard_property_approval_change ON public.properties;
CREATE TRIGGER trg_guard_property_approval_change
BEFORE UPDATE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.guard_property_approval_change();