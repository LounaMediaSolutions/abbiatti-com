-- can_manage_property includes co_admin
CREATE OR REPLACE FUNCTION public.can_manage_property(_user_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.properties p
    JOIN public.user_roles ur ON ur.organization_id = p.organization_id
    WHERE p.id = _property_id AND ur.user_id = _user_id
      AND ur.role IN ('admin', 'co_admin')
  ) OR EXISTS (
    SELECT 1 FROM public.property_members pm
    WHERE pm.user_id = _user_id AND pm.property_id = _property_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_co_admin(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND organization_id = _org_id AND role IN ('admin', 'co_admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.enforce_role_limits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE org_max_cohosts int; org_max_employees int; current_count int;
BEGIN
  IF NEW.role = 'super_admin' OR public.is_super_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;
  SELECT max_cohosts, max_employees INTO org_max_cohosts, org_max_employees
    FROM public.organizations WHERE id = NEW.organization_id;
  IF NEW.role IN ('cohost', 'co_admin') THEN
    SELECT COUNT(*) INTO current_count FROM public.user_roles
      WHERE organization_id = NEW.organization_id AND role IN ('cohost', 'co_admin');
    IF current_count >= COALESCE(org_max_cohosts, 1) THEN
      RAISE EXCEPTION 'Limite atteinte: % co-host(s)/co-admin(s) max pour cette agence.', org_max_cohosts;
    END IF;
  ELSIF NEW.role IN ('cleaner','driver','decorator','maintenance','staff') THEN
    SELECT COUNT(*) INTO current_count FROM public.user_roles
      WHERE organization_id = NEW.organization_id
        AND role IN ('cleaner','driver','decorator','maintenance','staff');
    IF current_count >= COALESCE(org_max_employees, 2) THEN
      RAISE EXCEPTION 'Limite atteinte: % employé(s) max pour cette agence.', org_max_employees;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- RLS updates
DROP POLICY IF EXISTS "Admins/cohosts manage banners" ON public.ad_banners;
CREATE POLICY "Managers manage banners" ON public.ad_banners FOR ALL TO authenticated
  USING (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'))
  WITH CHECK (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'));

DROP POLICY IF EXISTS "Admins and cohosts delete booking requests" ON public.booking_requests;
DROP POLICY IF EXISTS "Admins and cohosts manage booking requests" ON public.booking_requests;
CREATE POLICY "Managers delete booking requests" ON public.booking_requests FOR DELETE TO authenticated
  USING (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'));
CREATE POLICY "Managers update booking requests" ON public.booking_requests FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'));

DROP POLICY IF EXISTS "Admins/cohosts manage partners" ON public.partner_services;
CREATE POLICY "Managers manage partners" ON public.partner_services FOR ALL TO authenticated
  USING (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'))
  WITH CHECK (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'));

DROP POLICY IF EXISTS "Admins/cohosts manage coupons" ON public.partner_coupons;
CREATE POLICY "Managers manage coupons" ON public.partner_coupons FOR ALL TO authenticated
  USING (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'))
  WITH CHECK (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'));

DROP POLICY IF EXISTS "Admins/cohosts manage redemptions" ON public.coupon_redemptions;
CREATE POLICY "Managers manage redemptions" ON public.coupon_redemptions FOR ALL TO authenticated
  USING (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'))
  WITH CHECK (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'));

DROP POLICY IF EXISTS "Admins/cohosts manage guest albums" ON public.guest_albums;
CREATE POLICY "Managers manage guest albums" ON public.guest_albums FOR ALL TO authenticated
  USING (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'))
  WITH CHECK (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'));

DROP POLICY IF EXISTS "Admins/cohosts manage guest uploads" ON public.guest_uploads;
CREATE POLICY "Managers manage guest uploads" ON public.guest_uploads FOR ALL TO authenticated
  USING (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'))
  WITH CHECK (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'));

DROP POLICY IF EXISTS "Admins and cohosts manage templates" ON public.message_templates;
CREATE POLICY "Managers manage templates" ON public.message_templates FOR ALL TO authenticated
  USING (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'))
  WITH CHECK (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'));

DROP POLICY IF EXISTS "Admins and cohosts manage rental items" ON public.rental_items;
CREATE POLICY "Managers manage rental items" ON public.rental_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'))
  WITH CHECK (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'));

DROP POLICY IF EXISTS "Host sends messages" ON public.guest_messages;
CREATE POLICY "Host sends messages" ON public.guest_messages FOR INSERT TO authenticated
  WITH CHECK ((sender_role = 'host') AND (sender_id = auth.uid()) AND (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin')));

DROP POLICY IF EXISTS "Admins and cohosts create notifications" ON public.notifications;
CREATE POLICY "Managers create notifications" ON public.notifications FOR INSERT
  WITH CHECK (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin'));

DROP POLICY IF EXISTS "Admins and cohosts update org member avatars" ON public.profiles;
CREATE POLICY "Managers update org member avatars" ON public.profiles FOR UPDATE TO authenticated
  USING ((organization_id IS NOT NULL) AND (has_role(auth.uid(), organization_id, 'admin') OR has_role(auth.uid(), organization_id, 'cohost') OR has_role(auth.uid(), organization_id, 'co_admin')));

DROP POLICY IF EXISTS "Admins or cohosts assign members" ON public.property_members;
DROP POLICY IF EXISTS "Admins or cohosts remove members" ON public.property_members;
CREATE POLICY "Managers assign members" ON public.property_members FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), organization_id, 'admin')
    OR has_role(auth.uid(), organization_id, 'co_admin')
    OR (is_property_cohost(auth.uid(), property_id) AND role = ANY (ARRAY['cleaner'::app_role, 'driver'::app_role, 'decorator'::app_role, 'maintenance'::app_role, 'staff'::app_role]))
  );
CREATE POLICY "Managers remove members" ON public.property_members FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), organization_id, 'admin')
    OR has_role(auth.uid(), organization_id, 'co_admin')
    OR (is_property_cohost(auth.uid(), property_id) AND role = ANY (ARRAY['cleaner'::app_role, 'driver'::app_role, 'decorator'::app_role, 'maintenance'::app_role, 'staff'::app_role]))
  );

CREATE OR REPLACE FUNCTION public.notify_task_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE recipient record; prop_name text; notif_title text; notif_type text;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('done', 'issue') THEN RETURN NEW; END IF;
  SELECT name INTO prop_name FROM properties WHERE id = NEW.property_id;
  IF NEW.status = 'done' THEN
    notif_type := 'task_done';
    notif_title := '✅ ' || NEW.title || COALESCE(' · ' || prop_name, '');
  ELSE
    notif_type := 'task_issue';
    notif_title := '⚠️ ' || NEW.title || COALESCE(' · ' || prop_name, '');
  END IF;
  FOR recipient IN
    SELECT DISTINCT user_id FROM user_roles
    WHERE organization_id = NEW.organization_id AND role IN ('admin', 'cohost', 'co_admin')
  LOOP
    INSERT INTO notifications (organization_id, recipient_id, type, title, body, link)
    VALUES (NEW.organization_id, recipient.user_id, notif_type, notif_title,
            COALESCE(NEW.issue_description, NEW.staff_notes), '/tasks');
  END LOOP;
  RETURN NEW;
END;
$$;