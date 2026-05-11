import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "super_admin"
  | "admin"
  | "co_admin"
  | "cohost"
  | "cleaner"
  | "driver"
  | "decorator"
  | "maintenance"
  | "staff"
  | "guest"
  | string;

export const ADMIN_ROLES = ["super_admin", "admin", "co_admin"] as const;
export const EMPLOYEE_ROLES = ["cleaner", "driver", "decorator", "maintenance", "staff"] as const;

export const isAdminRole = (role: string | null | undefined) =>
  !!role && ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]);

export const isEmployeeRole = (role: string | null | undefined) =>
  !!role && EMPLOYEE_ROLES.includes(role as (typeof EMPLOYEE_ROLES)[number]);

export const getDashboardPathForRole = (
  role: string | null | undefined,
  hasCohostAssignments = false,
) => {
  if (isAdminRole(role)) return "/admin/dashboard";
  if (role === "cohost" || hasCohostAssignments) return "/cohost/dashboard";
  return "/employee";
};

export async function isGlobalAdmin(userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  return isAdminRole(profile?.role);
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
    .select("role, org_id")
    .eq("id", userId)
    .maybeSingle();

  const role = (profile?.role ?? null) as AppRole | null;
  const isAdmin = isAdminRole(role);

  const { data: cohosts } = await supabase
    .from("property_cohosts")
    .select("property_id")
    .eq("user_id", userId)
    .limit(1);

  const hasCohostAssignments = !!(cohosts && cohosts.length > 0);
  const isCohost = !isAdmin && (role === "cohost" || hasCohostAssignments);
  const isManager = isAdmin || isCohost;
  const dashboardPath = getDashboardPathForRole(role, hasCohostAssignments);

  return {
    orgId: profile?.org_id ?? null,
    role,
    dashboardPath,
    isManager,
    isAdmin,
    isCohost,
    isStaff: !isManager,
  };
}
