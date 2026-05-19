-- Restrict profiles visibility: only super_admin can see every profile.
-- Admins, co_admins, cohosts, and staff can only see profiles in their own
-- organization. Every user always sees their own row.
--
-- Background: earlier migrations created broad policies (e.g.
-- "Users view profiles in their org" against a non-existent `organization_id`
-- column, or "Super admins view all profiles" that previously only matched
-- super_admins). This migration recreates the SELECT/UPDATE policies cleanly
-- against the live `org_id` column and removes any residual over-broad
-- entries.

-- 1) Drop every prior SELECT / UPDATE / ALL policy on profiles we know
--    about. IF EXISTS makes this safe even if the live DB never had them.
DROP POLICY IF EXISTS "Users view profiles in their org" ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Org members view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super admins view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "View profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles select" ON public.profiles;

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins update org profiles" ON public.profiles;
DROP POLICY IF EXISTS "Managers update org member avatars" ON public.profiles;
DROP POLICY IF EXISTS "Admins and cohosts update org member avatars" ON public.profiles;
DROP POLICY IF EXISTS "Super admins update all profiles" ON public.profiles;

-- 2) Re-assert is_super_admin so the policies have a stable definition.
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role = 'super_admin'
  );
$$;

-- 3) SELECT policies — additive (any policy passing grants visibility).

-- Anyone can read their own profile row.
CREATE POLICY "Users view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Super-admins see everything.
CREATE POLICY "Super admins view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Org members see other profiles in their own org. Admins / co_admins /
-- cohosts / staff who belong to an organization can see other members of
-- that organization — but not profiles outside it.
CREATE POLICY "Org members view profiles in their org"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id IN (
      SELECT p.org_id
      FROM public.profiles p
      WHERE p.id = auth.uid() AND p.org_id IS NOT NULL
    )
  );

-- Super-admins targeting a pending-invitation profile should also see it
-- (covered already by "Super admins view all profiles"). Admins/cohosts get
-- no implicit visibility into pending invitations to other orgs.

-- 4) UPDATE policies.

-- Anyone can update their own profile row.
CREATE POLICY "Users update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Super-admins can update any profile.
CREATE POLICY "Super admins update all profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Org admins / co_admins can update profiles inside their own org (e.g. to
-- adjust roles or fix details), but never on super_admin rows.
CREATE POLICY "Org admins update org profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    role IS DISTINCT FROM 'super_admin'
    AND org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles caller
      WHERE caller.id = auth.uid()
        AND caller.org_id = public.profiles.org_id
        AND caller.role IN ('admin', 'co_admin')
    )
  )
  WITH CHECK (
    role IS DISTINCT FROM 'super_admin'
    AND org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles caller
      WHERE caller.id = auth.uid()
        AND caller.org_id = public.profiles.org_id
        AND caller.role IN ('admin', 'co_admin')
    )
  );

-- 5) RLS already enabled (idempotent guard).
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 6) Refresh the PostgREST schema cache so the new policies take effect
--    without a redeploy.
NOTIFY pgrst, 'reload schema';
