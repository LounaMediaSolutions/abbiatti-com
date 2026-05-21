-- Break the infinite-recursion loop between property_cohosts and properties
-- RLS policies.
--
-- The cycle, before this migration:
--   1. property_cohosts INSERT policy joins to public.properties
--      (`EXISTS (SELECT 1 FROM properties pr WHERE pr.id = …)`).
--   2. Evaluating that subquery applies properties' SELECT RLS.
--   3. The properties SELECT policy (added by 20260516120000) has
--      `EXISTS (SELECT 1 FROM property_cohosts pc WHERE pc.property_id = …)`
--      so cohosts can see properties they're assigned to.
--   4. Evaluating *that* subquery applies property_cohosts' RLS again.
--      → "infinite recursion detected in policy for relation property_cohosts"
--
-- Fix: a SECURITY DEFINER helper that returns the parent property's org_id
-- while bypassing RLS. The property_cohosts policies then check
-- profile.org_id against that returned value — no `properties` table query
-- in the policy at all, so the cycle is broken.

-- Helper -----------------------------------------------------------------
-- SECURITY DEFINER + STABLE + an explicit search_path are required so RLS on
-- public.properties is skipped when this function reads the row. The owner
-- of the function (typically `postgres`) is exempt from RLS by default.

CREATE OR REPLACE FUNCTION public.property_org_id(_property_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.properties WHERE id = _property_id;
$$;

GRANT EXECUTE ON FUNCTION public.property_org_id(uuid)
  TO authenticated, anon;

-- Reset property_cohosts policies ----------------------------------------
-- Drop every variant we may have shipped.
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

ALTER TABLE public.property_cohosts ENABLE ROW LEVEL SECURITY;

-- ─── Policies ──────────────────────────────────────────────────────────

CREATE POLICY "Super admins manage property_cohosts"
  ON public.property_cohosts
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- SELECT: anyone in the parent property's org, or the cohost themselves.
-- Uses property_org_id() to avoid a public.properties query in the policy.
CREATE POLICY "Org members view property_cohosts"
  ON public.property_cohosts
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.org_id = public.property_org_id(property_cohosts.property_id)
          OR p.pending_org_id = public.property_org_id(property_cohosts.property_id)
        )
    )
  );

-- INSERT: admin / co_admin / super_admin scoped to the property's org.
CREATE POLICY "Managers insert property_cohosts"
  ON public.property_cohosts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'co_admin', 'super_admin')
        AND (
          p.org_id = public.property_org_id(property_cohosts.property_id)
          OR p.pending_org_id = public.property_org_id(property_cohosts.property_id)
        )
    )
  );

CREATE POLICY "Managers update property_cohosts"
  ON public.property_cohosts
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'co_admin', 'super_admin')
        AND (
          p.org_id = public.property_org_id(property_cohosts.property_id)
          OR p.pending_org_id = public.property_org_id(property_cohosts.property_id)
        )
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'co_admin', 'super_admin')
        AND (
          p.org_id = public.property_org_id(property_cohosts.property_id)
          OR p.pending_org_id = public.property_org_id(property_cohosts.property_id)
        )
    )
  );

CREATE POLICY "Managers delete property_cohosts"
  ON public.property_cohosts
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'co_admin', 'super_admin')
        AND (
          p.org_id = public.property_org_id(property_cohosts.property_id)
          OR p.pending_org_id = public.property_org_id(property_cohosts.property_id)
        )
    )
  );

NOTIFY pgrst, 'reload schema';
