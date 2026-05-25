-- Allow cohosts to manage EMPLOYEES on the properties they are assigned to.
--
-- Background: `property_members` write policies (migration 20260517130000) only
-- let super-admins and org admins/co-admins insert/update/delete. The product
-- now also lets a cohost assign employees (cleaner / driver / decorator /
-- maintenance / staff) to the properties they manage, from the property's
-- Team tab. This migration widens the INSERT / UPDATE / DELETE policies with a
-- cohost clause that is scoped to:
--   * rows whose role is an employee role (never admin/co_admin/cohost), and
--   * properties the caller is actually a cohost of (a matching
--     `property_cohosts` row).
--
-- Reads are unchanged — the existing "Org members view property_members"
-- SELECT policy already lets same-org members (cohosts included) see the rows.

DROP POLICY IF EXISTS "Managers insert property_members" ON public.property_members;
CREATE POLICY "Managers insert property_members"
  ON public.property_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = property_members.organization_id
             OR p.pending_org_id = property_members.organization_id)
        AND p.role IN ('admin', 'co_admin', 'super_admin')
    )
    OR (
      property_members.role IN ('cleaner', 'driver', 'decorator', 'maintenance', 'staff')
      AND EXISTS (
        SELECT 1 FROM public.property_cohosts pc
        WHERE pc.property_id = property_members.property_id
          AND pc.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Managers update property_members" ON public.property_members;
CREATE POLICY "Managers update property_members"
  ON public.property_members
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = property_members.organization_id
             OR p.pending_org_id = property_members.organization_id)
        AND p.role IN ('admin', 'co_admin', 'super_admin')
    )
    OR (
      property_members.role IN ('cleaner', 'driver', 'decorator', 'maintenance', 'staff')
      AND EXISTS (
        SELECT 1 FROM public.property_cohosts pc
        WHERE pc.property_id = property_members.property_id
          AND pc.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = property_members.organization_id
             OR p.pending_org_id = property_members.organization_id)
        AND p.role IN ('admin', 'co_admin', 'super_admin')
    )
    OR (
      property_members.role IN ('cleaner', 'driver', 'decorator', 'maintenance', 'staff')
      AND EXISTS (
        SELECT 1 FROM public.property_cohosts pc
        WHERE pc.property_id = property_members.property_id
          AND pc.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Managers delete property_members" ON public.property_members;
CREATE POLICY "Managers delete property_members"
  ON public.property_members
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = property_members.organization_id
             OR p.pending_org_id = property_members.organization_id)
        AND p.role IN ('admin', 'co_admin', 'super_admin')
    )
    OR (
      property_members.role IN ('cleaner', 'driver', 'decorator', 'maintenance', 'staff')
      AND EXISTS (
        SELECT 1 FROM public.property_cohosts pc
        WHERE pc.property_id = property_members.property_id
          AND pc.user_id = auth.uid()
      )
    )
  );

-- Refresh the PostgREST schema cache so the new policies take effect.
NOTIFY pgrst, 'reload schema';
