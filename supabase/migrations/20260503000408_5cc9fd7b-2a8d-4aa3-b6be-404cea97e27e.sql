-- Already SECURITY DEFINER with set search_path; revoke from anon/public
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, UUID, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_org(UUID) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_org_member(UUID, UUID) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, public, authenticated;