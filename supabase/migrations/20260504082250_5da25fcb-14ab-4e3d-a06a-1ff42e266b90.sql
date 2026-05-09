-- 1) Helper function: can the user manage this property?
CREATE OR REPLACE FUNCTION public.can_manage_property(_user_id uuid, _property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Admin of the org owning the property
    SELECT 1 FROM public.properties p
    JOIN public.user_roles ur ON ur.organization_id = p.organization_id
    WHERE p.id = _property_id
      AND ur.user_id = _user_id
      AND ur.role = 'admin'
  ) OR EXISTS (
    -- Direct property assignment (cohost or staff role on this property)
    SELECT 1 FROM public.property_members pm
    WHERE pm.user_id = _user_id
      AND pm.property_id = _property_id
  );
$$;

-- 2) RESERVATIONS
DROP POLICY IF EXISTS "Admins and cohosts delete reservations" ON public.reservations;
DROP POLICY IF EXISTS "Admins and cohosts update reservations" ON public.reservations;
DROP POLICY IF EXISTS "Admins and cohosts insert reservations" ON public.reservations;
DROP POLICY IF EXISTS "Members view org reservations" ON public.reservations;

CREATE POLICY "Members view assigned reservations"
ON public.reservations FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

CREATE POLICY "Managers insert reservations"
ON public.reservations FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

CREATE POLICY "Managers update reservations"
ON public.reservations FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

CREATE POLICY "Managers delete reservations"
ON public.reservations FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

-- 3) TASKS
DROP POLICY IF EXISTS "Admins and cohosts manage tasks" ON public.tasks;
DROP POLICY IF EXISTS "Admins and cohosts delete tasks" ON public.tasks;
DROP POLICY IF EXISTS "Admins and cohosts update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Admins and cohosts insert tasks" ON public.tasks;
DROP POLICY IF EXISTS "Members view org tasks" ON public.tasks;

CREATE POLICY "Members view assigned tasks"
ON public.tasks FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
  OR assigned_to = auth.uid()
);

CREATE POLICY "Managers insert tasks"
ON public.tasks FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

CREATE POLICY "Managers update tasks"
ON public.tasks FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
  OR assigned_to = auth.uid()
);

CREATE POLICY "Managers delete tasks"
ON public.tasks FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

-- 4) GUEST_BOOKS
DROP POLICY IF EXISTS "Admins and cohosts manage guest books" ON public.guest_books;
DROP POLICY IF EXISTS "Members view own org guest books" ON public.guest_books;

CREATE POLICY "Managers view guest books"
ON public.guest_books FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

CREATE POLICY "Managers insert guest books"
ON public.guest_books FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

CREATE POLICY "Managers update guest books"
ON public.guest_books FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

CREATE POLICY "Managers delete guest books"
ON public.guest_books FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

-- 5) GUEST_ACCOUNTS
DROP POLICY IF EXISTS "Admins/cohosts manage guest accounts" ON public.guest_accounts;
DROP POLICY IF EXISTS "Org members view guest accounts" ON public.guest_accounts;

CREATE POLICY "Managers view guest accounts"
ON public.guest_accounts FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR (property_id IS NOT NULL AND can_manage_property(auth.uid(), property_id))
);

CREATE POLICY "Managers insert guest accounts"
ON public.guest_accounts FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR (property_id IS NOT NULL AND can_manage_property(auth.uid(), property_id))
);

CREATE POLICY "Managers update guest accounts"
ON public.guest_accounts FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR (property_id IS NOT NULL AND can_manage_property(auth.uid(), property_id))
);

CREATE POLICY "Managers delete guest accounts"
ON public.guest_accounts FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR (property_id IS NOT NULL AND can_manage_property(auth.uid(), property_id))
);

-- 6) INVENTORY_ITEMS
DROP POLICY IF EXISTS "Admins and cohosts manage inventory items" ON public.inventory_items;
DROP POLICY IF EXISTS "Members view inventory items" ON public.inventory_items;

CREATE POLICY "Managers view inventory items"
ON public.inventory_items FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

CREATE POLICY "Managers insert inventory items"
ON public.inventory_items FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

CREATE POLICY "Managers update inventory items"
ON public.inventory_items FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

CREATE POLICY "Managers delete inventory items"
ON public.inventory_items FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

-- 7) PROPERTY_ICAL_FEEDS
DROP POLICY IF EXISTS "Admins and cohosts manage feeds" ON public.property_ical_feeds;
DROP POLICY IF EXISTS "Members view feeds" ON public.property_ical_feeds;

CREATE POLICY "Managers view ical feeds"
ON public.property_ical_feeds FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

CREATE POLICY "Managers insert ical feeds"
ON public.property_ical_feeds FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

CREATE POLICY "Managers update ical feeds"
ON public.property_ical_feeds FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

CREATE POLICY "Managers delete ical feeds"
ON public.property_ical_feeds FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

-- 8) MAINTENANCE_TICKETS
DROP POLICY IF EXISTS "Admins and cohosts delete tickets" ON public.maintenance_tickets;
DROP POLICY IF EXISTS "Admins and cohosts update tickets" ON public.maintenance_tickets;
DROP POLICY IF EXISTS "Members view org tickets" ON public.maintenance_tickets;

CREATE POLICY "Managers view tickets"
ON public.maintenance_tickets FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

CREATE POLICY "Managers update tickets"
ON public.maintenance_tickets FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

CREATE POLICY "Managers delete tickets"
ON public.maintenance_tickets FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), property_id)
);

-- 9) RESERVATION_RENTALS (linked via reservation -> property)
DROP POLICY IF EXISTS "Admins cohosts manage reservation rentals" ON public.reservation_rentals;
DROP POLICY IF EXISTS "Org members view reservation rentals" ON public.reservation_rentals;

CREATE POLICY "Managers view reservation rentals"
ON public.reservation_rentals FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.id = reservation_rentals.reservation_id
      AND can_manage_property(auth.uid(), r.property_id)
  )
);

CREATE POLICY "Managers insert reservation rentals"
ON public.reservation_rentals FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.id = reservation_rentals.reservation_id
      AND can_manage_property(auth.uid(), r.property_id)
  )
);

CREATE POLICY "Managers update reservation rentals"
ON public.reservation_rentals FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.id = reservation_rentals.reservation_id
      AND can_manage_property(auth.uid(), r.property_id)
  )
);

CREATE POLICY "Managers delete reservation rentals"
ON public.reservation_rentals FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.id = reservation_rentals.reservation_id
      AND can_manage_property(auth.uid(), r.property_id)
  )
);

-- 10) CLEANING_CHECKLISTS (via task -> property)
DROP POLICY IF EXISTS "Admins cohosts manage checklists" ON public.cleaning_checklists;
DROP POLICY IF EXISTS "Org members view checklists" ON public.cleaning_checklists;

CREATE POLICY "Managers view checklists"
ON public.cleaning_checklists FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = cleaning_checklists.task_id
      AND (can_manage_property(auth.uid(), t.property_id) OR t.assigned_to = auth.uid())
  )
);

CREATE POLICY "Managers insert checklists"
ON public.cleaning_checklists FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = cleaning_checklists.task_id
      AND can_manage_property(auth.uid(), t.property_id)
  )
);

CREATE POLICY "Managers update checklists"
ON public.cleaning_checklists FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = cleaning_checklists.task_id
      AND (can_manage_property(auth.uid(), t.property_id) OR t.assigned_to = auth.uid())
  )
);

CREATE POLICY "Managers delete checklists"
ON public.cleaning_checklists FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = cleaning_checklists.task_id
      AND can_manage_property(auth.uid(), t.property_id)
  )
);

-- 11) INVENTORY_MOVEMENTS (via item -> property)
DROP POLICY IF EXISTS "Admins and cohosts insert movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Admins and cohosts delete movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Members view movements" ON public.inventory_movements;

CREATE POLICY "Managers view movements"
ON public.inventory_movements FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.inventory_items it
    WHERE it.id = inventory_movements.item_id
      AND can_manage_property(auth.uid(), it.property_id)
  )
);

CREATE POLICY "Managers insert movements"
ON public.inventory_movements FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    has_role(auth.uid(), organization_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.inventory_items it
      WHERE it.id = inventory_movements.item_id
        AND can_manage_property(auth.uid(), it.property_id)
    )
  )
);

CREATE POLICY "Managers delete movements"
ON public.inventory_movements FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.inventory_items it
    WHERE it.id = inventory_movements.item_id
      AND can_manage_property(auth.uid(), it.property_id)
  )
);

-- 12) PROPERTIES — restrict cohost view to assigned properties
DROP POLICY IF EXISTS "Members view org properties" ON public.properties;
DROP POLICY IF EXISTS "Admins and cohosts update properties" ON public.properties;
DROP POLICY IF EXISTS "Admins and cohosts insert properties" ON public.properties;

CREATE POLICY "Members view assigned properties"
ON public.properties FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.property_members pm
    WHERE pm.property_id = properties.id AND pm.user_id = auth.uid()
  )
);

CREATE POLICY "Admins insert properties"
ON public.properties FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), organization_id, 'admin'::app_role));

CREATE POLICY "Managers update properties"
ON public.properties FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), organization_id, 'admin'::app_role)
  OR can_manage_property(auth.uid(), id)
);

-- 13) PROPERTY_MEMBERS — cohost can now also assign cohost role on their own properties? No: keep admin-only for cohost role.
-- Update INSERT policy so a property cohost can add staff (cleaner/driver/decorator/maintenance/staff) on their own property.
-- Already covered by existing policy "Admins or cohosts assign members" using is_property_cohost. No change needed.