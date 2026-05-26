-- Bookings RLS policies — explicit, role-aware.
--
-- The `bookings` table has RLS enabled in the live DB but no policies are
-- defined in this repo's migrations. Whatever policies are deployed on the
-- live DB filter by org membership in a way that excludes super-admins
-- whose `profiles.org_id` is NULL (the global scope, by design — they
-- aren't tied to any one org). So the sync-ical edge function writes rows
-- (service role bypasses RLS) but the super-admin can't read them back.
--
-- This migration creates the same four-policy shape used by `properties`
-- and `tasks`:
--   1. Super-admins do everything (FOR ALL).
--   2. Org members read their org's bookings, plus cohosts read bookings on
--      properties they're assigned to.
--   3. Managers (admin / co_admin / cohost / super_admin) insert bookings
--      for orgs they belong to.
--   4. Managers update / delete with the same scope.
--
-- Idempotent — drops existing same-name policies before recreating, and
-- doesn't touch any out-of-band policies (those keep their own names).

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- ─── 1. Super-admin: full access ────────────────────────────────────────
DROP POLICY IF EXISTS "Super admins manage bookings" ON public.bookings;
CREATE POLICY "Super admins manage bookings"
  ON public.bookings
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ─── 2. Org members + cohosts: SELECT ───────────────────────────────────
DROP POLICY IF EXISTS "Org members view bookings" ON public.bookings;
CREATE POLICY "Org members view bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.property_cohosts pc
      WHERE pc.property_id = bookings.property_id
        AND pc.user_id = auth.uid()
    )
  );

-- ─── 3. Managers insert ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Managers insert bookings" ON public.bookings;
CREATE POLICY "Managers insert bookings"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = bookings.org_id OR p.pending_org_id = bookings.org_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
  );

-- ─── 4. Managers update ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Managers update bookings" ON public.bookings;
CREATE POLICY "Managers update bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = bookings.org_id OR p.pending_org_id = bookings.org_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.property_cohosts pc
      WHERE pc.property_id = bookings.property_id
        AND pc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = bookings.org_id OR p.pending_org_id = bookings.org_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.property_cohosts pc
      WHERE pc.property_id = bookings.property_id
        AND pc.user_id = auth.uid()
    )
  );

-- ─── 5. Managers delete ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Managers delete bookings" ON public.bookings;
CREATE POLICY "Managers delete bookings"
  ON public.bookings
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = bookings.org_id OR p.pending_org_id = bookings.org_id)
        AND p.role IN ('admin', 'co_admin', 'super_admin')
    )
  );

NOTIFY pgrst, 'reload schema';
