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
  | "user"
  | "guest"
  | string;

export const ADMIN_ROLES = ["super_admin", "admin", "co_admin"] as const;
export const EMPLOYEE_ROLES = ["cleaner", "driver", "decorator", "maintenance", "staff"] as const;
export const ORG_ADMIN_ROLES = ["admin", "co_admin"] as const;
// Every real workspace role — used as the assignable-member set for tasks and
// any other assignee dropdown. Excludes "user" (pending signup, not yet
// promoted) and "guest" (booking party, never an actor). Keeping cohosts and
// admins in the set ensures historical assignments still resolve a name in
// `members.find(...)` lookups, and lets admins delegate tasks to cohosts.
export const ASSIGNABLE_ROLES = [
  ...EMPLOYEE_ROLES,
  ...ADMIN_ROLES,
  "cohost",
] as const;

export const isAdminRole = (role: string | null | undefined) =>
  !!role && ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]);

export const isSuperAdminRole = (role: string | null | undefined) =>
  role === "super_admin";

export const isOrgAdminRole = (role: string | null | undefined) =>
  !!role && ORG_ADMIN_ROLES.includes(role as (typeof ORG_ADMIN_ROLES)[number]);

export const isEmployeeRole = (role: string | null | undefined) =>
  !!role && EMPLOYEE_ROLES.includes(role as (typeof EMPLOYEE_ROLES)[number]);

/** Public signups land as `user` until a super-admin promotes them to admin. */
export const isPendingUserRole = (role: string | null | undefined) =>
  role === "user";

export const getDashboardPathForRole = (
  role: string | null | undefined,
  hasCohostAssignments = false,
) => {
  if (isSuperAdminRole(role)) return "/super-admin";
  if (!!role && ORG_ADMIN_ROLES.includes(role as (typeof ORG_ADMIN_ROLES)[number])) {
    return "/admin/dashboard";
  }
  if (role === "cohost" || hasCohostAssignments) return "/cohost/dashboard";
  if (isPendingUserRole(role)) return "/user";
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

export async function isSuperAdminUser(userId: string) {
  // `profiles.role` is the canonical source. Check it FIRST and short-circuit:
  // a profile-based super-admin must never depend on the legacy table being
  // reachable. (Querying both in parallel was a regression — a transient
  // failure on `user_roles` would reject the whole check and lock out a real
  // super-admin whose profile already proves their role.)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (isSuperAdminRole(profile?.role)) return true;

  // Legacy fallback only: some deployments stored super-admins in `user_roles`
  // and never backfilled `profiles.role`. Any failure here (table missing,
  // network blip) is treated as "not a super-admin" rather than allowed to
  // throw — the canonical path above has already returned for real ones.
  try {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function getPropertyPermissions(userId: string, propertyId: string) {
  // Admins get the full permission set without a second query. Check the role
  // first and short-circuit — only non-admins need the per-property cohost
  // lookup, so we never pay for it on the admin path.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (isAdminRole(profile?.role)) {
    return [
      "manage_properties",
      "manage_reservations",
      "manage_tasks",
      "manage_staff",
      "view_financials",
      "manage_settings",
    ];
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
  // Profile lookup and cohost-assignment probe are independent — run them in
  // parallel so the worst-case latency is one round-trip, not two.
  const [profileRes, cohostsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("role, org_id")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("property_cohosts")
      .select("property_id")
      .eq("user_id", userId)
      .limit(1),
  ]);

  const profile = profileRes.data;
  const cohosts = cohostsRes.data;

  const role = (profile?.role ?? null) as AppRole | null;
  const isSuperAdmin = isSuperAdminRole(role);
  const isAdmin = isAdminRole(role);
  const isPendingUser = isPendingUserRole(role);

  const hasCohostAssignments = !!(cohosts && cohosts.length > 0);
  const isCohost = !isAdmin && (role === "cohost" || hasCohostAssignments);
  const isManager = isAdmin || isCohost;
  const dashboardPath = getDashboardPathForRole(role, hasCohostAssignments);

  return {
    orgId: profile?.org_id ?? null,
    role,
    dashboardPath,
    isManager,
    isSuperAdmin,
    isAdmin,
    isCohost,
    isPendingUser,
    // A 'user' role isn't staff — they're pending admin access. Excluding them
    // here keeps them from accidentally landing on the staff dashboard.
    isStaff: !isManager && !isPendingUser,
  };
}
