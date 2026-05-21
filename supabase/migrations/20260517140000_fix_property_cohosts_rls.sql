-- Reset RLS on property_cohosts to the same idiomatic 4-policy shape used by
-- tasks + properties in 20260516120000_fix_rls_for_super_admin_inserts.sql.
--
-- Symptom this fixes:
--   "new row violates row-level security policy for table property_cohosts"
--   when an admin assigns a cohost to a property via Properties.tsx.
--
-- Root cause: the live property_cohosts table either had no INSERT policy at
-- all, or had one that joined to `properties.organization_id` (which doesn't
-- exist — the live column is `org_id`). Either way an admin INSERT failed
-- the WITH CHECK.
--
-- Important: property_cohosts has NO `org_id` / `organization_id` column of
-- its own. We derive the org via the parent property:
--   property_cohosts.property_id → properties.org_id

-- Drop any prior policies under any name we've ever used.
DROP POLICY IF EXISTS "Super admins manage property_cohosts" ON public.property_cohosts;
DROP POLICY IF EXISTS "Org members view property_cohosts"    ON public.property_cohosts;
DROP POLICY IF EXISTS "Members view property_cohosts"        ON public.property_cohosts;
DROP POLICY IF EXISTS "Members view assigned cohosts"        ON public.property_cohosts;
DROP POLICY IF EXISTS "Assigned cohost view"                 ON public.property_cohosts;
DROP POLICY IF EXISTS "Managers insert property_cohosts"     ON public.property_cohosts;
DROP POLICY IF EXISTS "Admins insert property_cohosts"       ON public.property_cohosts;
DROP POLICY IF EXISTS "Admins manage property_cohosts"       ON public.property_cohosts;
DROP POLICY IF EXISTS "Managers update property_cohosts"     ON public.property_cohosts;
DROP POLICY IF EXISTS "Managers delete property_cohosts"     ON public.property_cohosts;

-- Make sure RLS is on (idempotent).
ALTER TABLE public.property_cohosts ENABLE ROW LEVEL SECURITY;

-- ─── Policies ──────────────────────────────────────────────────────────

CREATE POLICY "Super admins manage property_cohosts"
  ON public.property_cohosts
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- SELECT: org members of the parent property's org, OR the cohost themselves.
CREATE POLICY "Org members view property_cohosts"
  ON public.property_cohosts
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1
        FROM public.properties pr
        JOIN public.profiles p ON p.id = auth.uid()
       WHERE pr.id = property_cohosts.property_id
         AND (p.org_id = pr.org_id OR p.pending_org_id = pr.org_id)
    )
  );

-- INSERT: only admin / co_admin / super_admin, scoped to the property's org.
-- (Cohosts can't grant themselves access to new properties; that requires an
-- admin.)
CREATE POLICY "Managers insert property_cohosts"
  ON public.property_cohosts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
        FROM public.properties pr
        JOIN public.profiles p ON p.id = auth.uid()
       WHERE pr.id = property_cohosts.property_id
         AND (p.org_id = pr.org_id OR p.pending_org_id = pr.org_id)
         AND p.role IN ('admin', 'co_admin', 'super_admin')
    )
  );

-- UPDATE: same gate as INSERT. (Permissions array can be tweaked by admin.)
CREATE POLICY "Managers update property_cohosts"
  ON public.property_cohosts
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
        FROM public.properties pr
        JOIN public.profiles p ON p.id = auth.uid()
       WHERE pr.id = property_cohosts.property_id
         AND (p.org_id = pr.org_id OR p.pending_org_id = pr.org_id)
         AND p.role IN ('admin', 'co_admin', 'super_admin')
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
        FROM public.properties pr
        JOIN public.profiles p ON p.id = auth.uid()
       WHERE pr.id = property_cohosts.property_id
         AND (p.org_id = pr.org_id OR p.pending_org_id = pr.org_id)
         AND p.role IN ('admin', 'co_admin', 'super_admin')
    )
  );

CREATE POLICY "Managers delete property_cohosts"
  ON public.property_cohosts
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
        FROM public.properties pr
        JOIN public.profiles p ON p.id = auth.uid()
       WHERE pr.id = property_cohosts.property_id
         AND (p.org_id = pr.org_id OR p.pending_org_id = pr.org_id)
         AND p.role IN ('admin', 'co_admin', 'super_admin')
    )
  );

NOTIFY pgrst, 'reload schema';
