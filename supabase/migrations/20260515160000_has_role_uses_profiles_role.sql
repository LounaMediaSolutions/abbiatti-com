-- RLS fix: has_role() now consults profiles.role in addition to user_roles.
--
-- Same motivation as 20260514130000_is_super_admin_uses_profiles_role.sql:
-- profiles.role is the source of truth in this deployment, while user_roles
-- is sparsely populated (legacy installs only). has_role() previously only
-- consulted user_roles, which meant policies like "Managers insert
-- properties" / "Managers insert tasks" silently rejected admins and
-- super_admins whose role lives on profiles. Updating the helper here lets
-- every existing policy that already calls has_role() Just Work without
-- having to touch each individual policy.
--
-- Rules implemented:
--   1. Original user_roles match (backwards compat).
--   2. Super-admin passthrough: anyone with profiles.role = 'super_admin'
--      satisfies every role check (super_admin is a global ops role).
--   3. profiles.role match: if the user's profiles.role equals the requested
--      role AND their profiles.org_id either matches the requested org_id or
--      is NULL (orphaned admins/cohosts who haven't been linked to an org
--      yet — the application then attaches them to an effective org on first
--      action), allow it. profiles.pending_org_id is also accepted so an
--      invited-but-not-yet-accepted admin can still operate against the
--      target org.
CREATE OR REPLACE FUNCTION public.has_role(
  _user_id uuid,
  _org_id uuid,
  _role public.app_role
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Legacy / explicit user_roles entry.
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND organization_id = _org_id
        AND role = _role
    )
    -- Super-admins satisfy every has_role() check.
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = _user_id AND role = 'super_admin'
    )
    -- profiles.role mirrors the requested role for the target org (or the
    -- user hasn't been linked to an org yet, in which case the application
    -- supplies an effective org_id and we trust the profile role).
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _user_id
        AND p.role::text = _role::text
        AND (
          p.org_id = _org_id
          OR p.org_id IS NULL
          OR p.pending_org_id = _org_id
        )
    );
$$;

-- Reload PostgREST schema cache so the updated function is picked up
-- without a redeploy.
NOTIFY pgrst, 'reload schema';
