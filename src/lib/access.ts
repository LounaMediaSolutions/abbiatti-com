import { supabase } from "@/integrations/supabase/client";

export async function getUserAccess(userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();

  const orgId = profile?.organization_id ?? null;

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role, organization_id")
    .eq("user_id", userId);

  const hasManagerRole = (roles ?? []).some(
    (r) =>
      (r.role === "admin" || r.role === "cohost") &&
      (!orgId || r.organization_id === orgId)
  );

  return {
    organizationId: orgId,
    isManager: hasManagerRole,
    isStaff: !hasManagerRole,
  };
}
