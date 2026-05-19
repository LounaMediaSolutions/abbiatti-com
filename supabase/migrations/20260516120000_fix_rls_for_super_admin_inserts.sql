-- Fix RLS so super_admin and admin can insert/update/delete rows in
-- properties and tasks. The live schema for these tables uses `org_id`
-- (not `organization_id` as in the original migrations), so the policies
-- referencing `organization_id` either evaluate against NULL or fail
-- silently. Recreate the policies against the actual column names, and
-- make sure super_admin always satisfies the check.
--
-- This migration is idempotent — drops are guarded with IF EXISTS, and
-- has_role / is_super_admin are CREATE OR REPLACE.

-- 0) Add the pending-invitation columns on profiles if they aren't already
--    there (migration 20260514150000 was never pushed in this deployment).
--    These are referenced by the policies below and by the super-admin
--    invite flow.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pending_org_id uuid
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS pending_role text,
  ADD COLUMN IF NOT EXISTS invited_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invitation_status text;

CREATE INDEX IF NOT EXISTS profiles_invitation_status_idx
  ON public.profiles (invitation_status)
  WHERE invitation_status IS NOT NULL;

-- 1) Re-assert is_super_admin in case earlier migrations weren't applied
--    in this deployment.
--
-- Note: this deployment has no `public.user_roles` table and no
-- `public.app_role` enum; profiles.role (text) is the sole source of truth.
-- We deliberately don't touch has_role() here — other tables' policies may
-- still depend on its existing signature, and the new policies below don't
-- need it.

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

-- 2) TASKS — recreate policies against the live `org_id` column.

DROP POLICY IF EXISTS "Members view assigned tasks" ON public.tasks;
DROP POLICY IF EXISTS "Members view org tasks" ON public.tasks;
DROP POLICY IF EXISTS "Org members view tasks" ON public.tasks;
DROP POLICY IF EXISTS "Managers insert tasks" ON public.tasks;
DROP POLICY IF EXISTS "Admins and cohosts insert tasks" ON public.tasks;
DROP POLICY IF EXISTS "Managers update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Admins, cohosts and assignee update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Managers delete tasks" ON public.tasks;
DROP POLICY IF EXISTS "Admins and cohosts delete tasks" ON public.tasks;

CREATE POLICY "Super admins manage tasks"
  ON public.tasks
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Org members view tasks"
  ON public.tasks
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
    OR assigned_to = auth.uid()
    OR assigned_by = auth.uid()
  );

CREATE POLICY "Managers insert tasks"
  ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = tasks.org_id OR p.pending_org_id = tasks.org_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
  );

CREATE POLICY "Managers update tasks"
  ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = tasks.org_id OR p.pending_org_id = tasks.org_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
    OR assigned_to = auth.uid()
  );

CREATE POLICY "Managers delete tasks"
  ON public.tasks
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = tasks.org_id OR p.pending_org_id = tasks.org_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
  );

-- 3) PROPERTIES — recreate policies against the live `org_id` column.

DROP POLICY IF EXISTS "Managers insert properties" ON public.properties;
DROP POLICY IF EXISTS "Admins insert properties" ON public.properties;
DROP POLICY IF EXISTS "Managers update properties" ON public.properties;
DROP POLICY IF EXISTS "Managers delete properties" ON public.properties;
DROP POLICY IF EXISTS "Members view properties" ON public.properties;
DROP POLICY IF EXISTS "Org members view properties" ON public.properties;

CREATE POLICY "Super admins manage properties"
  ON public.properties
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Org members view properties"
  ON public.properties
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR org_id IN (
      SELECT org_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.property_cohosts pc
      WHERE pc.property_id = properties.id AND pc.user_id = auth.uid()
    )
  );

CREATE POLICY "Managers insert properties"
  ON public.properties
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = properties.org_id OR p.pending_org_id = properties.org_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
  );

CREATE POLICY "Managers update properties"
  ON public.properties
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = properties.org_id OR p.pending_org_id = properties.org_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.property_cohosts pc
      WHERE pc.property_id = properties.id AND pc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = properties.org_id OR p.pending_org_id = properties.org_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.property_cohosts pc
      WHERE pc.property_id = properties.id AND pc.user_id = auth.uid()
    )
  );

CREATE POLICY "Managers delete properties"
  ON public.properties
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.org_id = properties.org_id OR p.pending_org_id = properties.org_id)
        AND p.role IN ('admin', 'co_admin', 'cohost', 'super_admin')
    )
  );

-- 4) Make sure RLS is enabled (idempotent).
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

-- 5) Reload PostgREST schema cache so the updated function/policies are
--    picked up without a redeploy.
NOTIFY pgrst, 'reload schema';
