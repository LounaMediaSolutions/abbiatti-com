GRANT EXECUTE ON FUNCTION public.get_user_org(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_property_cohost(uuid, uuid) TO anon, authenticated;