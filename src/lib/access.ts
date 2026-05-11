import { supabase } from "@/integrations/supabase/client";

export async function isGlobalAdmin(userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  return profile?.role === "admin" || profile?.role === "super_admin";
}

export async function getPropertyPermissions(userId: string, propertyId: string) {
  if (await isGlobalAdmin(userId)) {
    return ["manage_properties", "manage_reservations", "manage_tasks", "manage_staff", "view_financials", "manage_settings"];
  }

  const { data: cohost } = await supabase
    .from("property_cohosts")
    .select("permissions")
    .eq("user_id", userId)
    .eq("property_id", propertyId)
    .maybeSingle();

  return cohost?.permissions || [];
}

export async function hasPropertyPermission(userId: string, propertyId: string, permission: string) {
  const permissions = await getPropertyPermissions(userId, propertyId);
  return permissions.includes(permission);
}

export async function getUserAccess(userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin" || profile?.role === "co_admin";

  const { data: cohosts } = await supabase
    .from("property_cohosts")
    .select("property_id")
    .eq("user_id", userId)
    .limit(1);

  const isCohost = (cohosts && cohosts.length > 0) && !isAdmin;
  const isManager = isAdmin || isCohost;

  return {
    organizationId: null, // Legacy, removed
    isManager,
    isAdmin,
    isCohost,
    isStaff: !isManager,
  };
}
