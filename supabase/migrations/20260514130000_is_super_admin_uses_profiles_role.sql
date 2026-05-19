-- RLS fix: super_admin is identified via `profiles.role` in this deployment.
-- The old is_super_admin() only checked the `user_roles` table, which is empty
-- (or absent from the schema cache) for this project. As a result, the
-- "Super admins view all profiles" policy never matched and super-admins
-- only saw their own row through the `id = auth.uid()` clause.
--
-- New definition: a user is a super_admin if EITHER profiles.role = 'super_admin'
-- OR user_roles has a corresponding row (for legacy installs). The OR keeps
-- backwards compatibility with the original migrations.
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = _user_id AND role = 'super_admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = 'super_admin'
    );
$$;

-- Make sure the super-admin SELECT policy on profiles exists (idempotent).
DROP POLICY IF EXISTS "Super admins view all profiles" ON public.profiles;
CREATE POLICY "Super admins view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins update all profiles" ON public.profiles;
CREATE POLICY "Super admins update all profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
