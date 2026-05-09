
-- Helper: is_super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

-- Organizations: super admin full access
CREATE POLICY "Super admins view all orgs" ON public.organizations
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE POLICY "Super admins update all orgs" ON public.organizations
  FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE POLICY "Super admins delete orgs" ON public.organizations
  FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE POLICY "Super admins insert orgs" ON public.organizations
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()));

-- Suspended flag
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;

-- user_roles: super admin manage everywhere
CREATE POLICY "Super admins manage all roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- profiles: super admin view/update all
CREATE POLICY "Super admins view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE POLICY "Super admins update all profiles" ON public.profiles
  FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid()));
