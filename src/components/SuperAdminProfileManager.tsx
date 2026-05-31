import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Shield,
  ShieldOff,
  ShieldCheck,
  Loader2,
  UserPlus,
  Trash2,
  RefreshCw,
  Users,
  UserCheck,
  UserX,
  Globe,
  SlidersHorizontal,
  Mail,
  Phone,
  MapPin,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isSuperAdminUser, isEmployeeRole } from "@/lib/access";
import { MagicLinkQR } from "@/components/MagicLinkQR";
import { Unauthorized } from "@/components/Unauthorized";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  COUNTRIES,
  getStatesForCountry,
  isStateInCountry,
  type CountryCode,
} from "@/lib/locations";

// Generate a reasonable temporary password for newly created accounts.
const generateTempPassword = () => {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${out}#9`;
};

// Shared, role-aware profile management list used by the super-admin
// Admins / Cohosts / Employees sections. It mirrors the behaviour of the
// combined SuperAdminProfiles page (search, status filter, pagination, role
// change, org reassignment, ban/unban) but narrows the listing to a given set
// of roles via `allowedRoles`. When `allowedRoles` is omitted, every profile
// is shown (parity with the original combined page).

const getErrorMessage = (error: unknown): string | undefined => {
  if (!error) return undefined;
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return undefined;
};

const ORG_ROLE_OPTIONS = [
  "admin",
  "co_admin",
  "cohost",
  "cleaner",
  "driver",
  "decorator",
  "maintenance",
  "staff",
  "guest",
] as const;

const GLOBAL_ROLE_OPTIONS = [
  "super_admin",
  "technician",
  "developer",
  "accountant",
  "support",
] as const;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

type Scope = "org" | "global";
type StatusFilter = "all" | "active" | "banned";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  org_id: string | null;
  role: string | null;
  active: boolean | null;
  country: string | null;
  state: string | null;
};

const COUNTRY_ALL = "__all__";
const STATE_ALL = "__all__";
const COUNTRY_NONE = "__none__";
const STATE_NONE = "__none__";

type ProfileItem = ProfileRow & {
  effectiveRole: string | null;
  organizationName: string | null;
  scope: Scope;
  banned: boolean;
};

export type SuperAdminProfileManagerProps = {
  /** Title shown at the top of the page. */
  title: string;
  /** Short description shown under the title. */
  subtitle: string;
  /** Optional header icon. Defaults to a shield. */
  icon?: ComponentType<{ className?: string }>;
  /**
   * Roles to include in the listing. When omitted, every role is shown.
   * Example: ["admin", "co_admin"] for the Admins section.
   */
  allowedRoles?: readonly string[];
  /**
   * Roles to EXCLUDE from the listing. Profiles whose role is NULL or not in
   * this set are shown — used by the catch-all "Profiles" section to surface
   * everyone who isn't an admin, cohost, or employee.
   */
  excludedRoles?: readonly string[];
  /**
   * Roles offered in the per-profile role dropdown. Defaults to the org/global
   * option set based on the profile's scope.
   */
  roleDropdownOptions?: readonly string[];
};

const getInitials = (name: string | null, email: string | null) => {
  const source = (name || email || "").trim();
  if (!source) return "U";
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
};

const isGlobalRole = (role: string) =>
  GLOBAL_ROLE_OPTIONS.includes(role as (typeof GLOBAL_ROLE_OPTIONS)[number]);

const getRoleOptions = (scope: Scope) =>
  scope === "global" ? GLOBAL_ROLE_OPTIONS : ORG_ROLE_OPTIONS;

const getRoleLabelKey = (role: string) =>
  isGlobalRole(role) ? `superAdminStaff.roles.${role}` : `team.roles.${role}`;

// Soft tinted chips — matches the data-dense dashboard convention. Same
// palette as OrgProfileManager so the role chip means the same thing on
// every screen regardless of who's looking at it.
const getRoleBadgeClass = (role: string | null) => {
  switch (role) {
    case "super_admin":
      return "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200";
    case "admin":
    case "co_admin":
      return "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200";
    case "cohost":
      return "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200";
    case "cleaner":
    case "driver":
    case "decorator":
    case "maintenance":
    case "staff":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200";
    case "guest":
      return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200";
    case null:
    case undefined:
      return "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200";
  }
};

// Small KPI tile shared with OrgProfileManager — kept inline rather than
// hoisted because the file is already self-contained. Don't extract until
// a third caller actually needs it.
type KpiTone = "primary" | "emerald" | "rose" | "blue" | "indigo";

const KPI_TONE_MAP: Record<KpiTone, string> = {
  primary: "bg-primary/10 text-primary",
  emerald: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-600",
  blue: "bg-blue-50 text-blue-600",
  indigo: "bg-indigo-50 text-indigo-600",
};

const KpiTile = ({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: KpiTone;
  hint?: string;
}) => (
  <div className="rounded-xl border border-border/60 bg-background/50 p-3 sm:p-4">
    <div className="flex items-center gap-2.5">
      <span
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${KPI_TONE_MAP[tone]}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <p className="text-xl font-bold tabular-nums text-secondary">{value}</p>
      </div>
    </div>
    {hint && (
      <p className="mt-1.5 text-[10px] text-muted-foreground/80 truncate">{hint}</p>
    )}
  </div>
);

export default function SuperAdminProfileManager({
  title,
  subtitle,
  icon: HeaderIcon = Shield,
  allowedRoles,
  excludedRoles,
  roleDropdownOptions,
}: SuperAdminProfileManagerProps) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [isSuper, setIsSuper] = useState<boolean | null>(null);

  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [fetching, setFetching] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [countryFilter, setCountryFilter] = useState<string>(COUNTRY_ALL);
  const [stateFilter, setStateFilter] = useState<string>(STATE_ALL);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const [savingId, setSavingId] = useState<string | null>(null);
  const [banningId, setBanningId] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState<ProfileItem | null>(null);
  // Full organization list so a super-admin can move a user to any org.
  const [allOrgs, setAllOrgs] = useState<{ id: string; name: string }[]>([]);

  // ---- Create ("Add member") dialog state --------------------------------
  // Roles offered when creating someone. Use the section's roles when it is
  // narrowed (Cohosts / Employees / Admins); fall back to the full org set on
  // the catch-all Profiles page. Global roles (super_admin, technician, …) are
  // created from the dedicated Platform Staff page, not here.
  const createRoleOptions =
    allowedRoles && allowedRoles.length > 0
      ? allowedRoles.filter((r) => !isGlobalRole(r))
      : ORG_ROLE_OPTIONS;
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addRole, setAddRole] = useState<string>(createRoleOptions[0] ?? "cohost");
  const [addOrgId, setAddOrgId] = useState<string>("");
  const [addCountry, setAddCountry] = useState<string>("");
  const [addState, setAddState] = useState<string>("");
  const [addPassword, setAddPassword] = useState<string>(generateTempPassword());
  const [creating, setCreating] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);

  // ---- Remove-from-org state ---------------------------------------------
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ProfileItem | null>(null);
  // The id of the profile whose edit sheet is open. Derived back to the
  // live ProfileItem each render so updates inside the sheet stay in sync
  // with refreshes of the underlying list.
  const [editingId, setEditingId] = useState<string | null>(null);

  // Stable dependency key so the listing refetches when the role set changes
  // (different page mounts pass different allowedRoles / excludedRoles).
  const roleKey = `${allowedRoles ? allowedRoles.join(",") : ""}|${
    excludedRoles ? excludedRoles.join(",") : ""
  }`;

  // Keep state filter coherent with country filter. Changing country always
  // resets state — a Dubai value left selected after switching to Algeria
  // would silently filter to zero rows.
  useEffect(() => {
    setStateFilter(STATE_ALL);
  }, [countryFilter]);

  // Debounce the search input — wait 300ms after typing stops before re-querying.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setIsSuper(false);
      return;
    }
    isSuperAdminUser(user.id).then(setIsSuper).catch(() => setIsSuper(false));
  }, [user?.id, loading]);

  // Load every organization in parallel with the role check, so the
  // per-profile org picker is populated by the time the profile rows render.
  // RLS still gates the response: non-super-admins get back zero rows, so
  // running this eagerly leaks nothing.
  useEffect(() => {
    if (loading || !user) return;
    supabase
      .from("organizations")
      .select("id, name")
      .order("name")
      .then(({ data }) => setAllOrgs((data ?? []) as { id: string; name: string }[]));
  }, [user?.id, loading]);

  const loadProfiles = async () => {
    setFetching(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("profiles")
        .select(
          "id, full_name, email, phone, avatar_url, org_id, role, active, country, state",
          // `exact` keeps the page count and "X of Y" total correct. The
          // planner's `estimated` count was noticeably wrong for filtered
          // subsets (by country / role), which produced a wrong page count and
          // a last page with the wrong number of rows. Accuracy wins here: this
          // is an admin-only, paginated tool, not a hot path.
          { count: "exact" },
        )
        .order("created_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true });

      if (countryFilter !== COUNTRY_ALL) {
        query = query.eq("country", countryFilter);
      }
      if (stateFilter !== STATE_ALL) {
        query = query.eq("state", stateFilter);
      }

      // Narrow to the section's roles (Admins / Cohosts / Employees).
      if (allowedRoles && allowedRoles.length > 0) {
        query = query.in("role", allowedRoles as string[]);
      }

      // Catch-all "Profiles" section: everyone who is NOT one of the excluded
      // roles. `role.is.null` keeps unassigned profiles in the list, since a
      // plain `NOT IN (...)` would drop NULL roles.
      if (excludedRoles && excludedRoles.length > 0) {
        query = query.or(
          `role.is.null,role.not.in.(${excludedRoles.join(",")})`,
        );
      }

      if (statusFilter === "active") {
        // Treat NULL as active (legacy rows where the flag was never set).
        query = query.or("active.is.null,active.eq.true");
      } else if (statusFilter === "banned") {
        query = query.eq("active", false);
      }

      if (searchQuery) {
        const escaped = searchQuery.replace(/[%,]/g, " ").trim();
        if (escaped) {
          const term = `%${escaped}%`;
          query = query.or(
            `full_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`,
          );
        }
      }

      const { data: profileRows, count, error: profilesError } = await query.range(
        from,
        to,
      );
      if (profilesError) throw profilesError;

      const rows = (profileRows ?? []) as ProfileRow[];
      const orgIds = Array.from(
        new Set(rows.map((p) => p.org_id).filter(Boolean) as string[]),
      );

      // `profiles.role` is the single source of truth in this deployment.
      // `user_roles` may not exist in every Supabase project — don't depend on it.
      let organizations: { id: string; name: string }[] = [];
      if (orgIds.length > 0) {
        const { data, error: orgsError } = await supabase
          .from("organizations")
          .select("id, name")
          .in("id", orgIds);
        if (orgsError) throw orgsError;
        organizations = data ?? [];
      }
      const orgNameMap = new Map<string, string>();
      organizations.forEach((o) => orgNameMap.set(o.id, o.name));

      const items: ProfileItem[] = rows.map((profile) => {
        const effectiveRole = profile.role ?? null;
        const scope: Scope =
          effectiveRole && isGlobalRole(effectiveRole)
            ? "global"
            : profile.org_id
              ? "org"
              : "global";

        return {
          ...profile,
          effectiveRole,
          organizationName: profile.org_id ? orgNameMap.get(profile.org_id) ?? null : null,
          scope,
          banned: profile.active === false,
        };
      });

      setProfiles(items);
      setTotalCount(count ?? items.length);
    } catch (error: unknown) {
      toast({
        title: t("common.error"),
        description: getErrorMessage(error) ?? "Failed to load profiles",
        variant: "destructive",
      });
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (!isSuper) return;
    void loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuper, page, pageSize, statusFilter, searchQuery, roleKey, countryFilter, stateFilter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  useEffect(() => {
    // Clamp only when the count is settled and the gap is real. With
    // `count: "estimated"` the planner can return a value lower than the
    // actual row total mid-fetch, which would otherwise bounce the user back
    // to an earlier page and re-fire the query, flickering the table. Waiting
    // for `!fetching` lets the count stabilize before we adjust the page.
    if (fetching) return;
    if (safePage !== page) setPage(safePage);
  }, [safePage, page, fetching]);

  const updateOrg = async (profile: ProfileItem, nextOrgId: string) => {
    if (!nextOrgId || nextOrgId === profile.org_id) return;
    setSavingId(profile.id);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ org_id: nextOrgId } as never)
        .eq("id", profile.id);
      if (error) throw error;
      toast({ title: t("superAdminProfiles.orgUpdated", { defaultValue: "Organisation mise à jour" }) });
      await loadProfiles();
    } catch (error: unknown) {
      toast({
        title: t("common.error"),
        description: getErrorMessage(error) ?? "Failed to update organization",
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  /** Update country and/or state on a profile. Pass undefined to leave a
   *  field unchanged; pass null to explicitly clear it. */
  const updateLocation = async (
    profile: ProfileItem,
    patch: { country?: string | null; state?: string | null },
  ) => {
    const payload: Record<string, string | null> = {};
    if (patch.country !== undefined) payload.country = patch.country;
    if (patch.state !== undefined) payload.state = patch.state;
    if (Object.keys(payload).length === 0) return;

    // If switching country, drop any state that doesn't belong to the new
    // country so we don't leave the row in an inconsistent state.
    if (
      patch.country !== undefined &&
      profile.state &&
      !isStateInCountry(profile.state, patch.country)
    ) {
      payload.state = null;
    }

    setSavingId(profile.id);
    try {
      const { error } = await supabase
        .from("profiles")
        .update(payload as never)
        .eq("id", profile.id);
      if (error) throw error;
      await loadProfiles();
    } catch (error: unknown) {
      toast({
        title: t("common.error"),
        description:
          getErrorMessage(error) ?? "Failed to update location",
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const updateRole = async (profile: ProfileItem, nextRole: string) => {
    if (profile.id === user?.id) {
      toast({
        title: t("superAdminProfiles.selfRoleLocked"),
        variant: "destructive",
      });
      return;
    }

    const targetScope: Scope = isGlobalRole(nextRole) ? "global" : "org";
    if (targetScope !== profile.scope) {
      toast({
        title: t("superAdminProfiles.scopeMismatchTitle"),
        description: t("superAdminProfiles.scopeMismatchBody"),
        variant: "destructive",
      });
      return;
    }

    setSavingId(profile.id);
    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ role: nextRole })
        .eq("id", profile.id);
      if (profileError) throw profileError;

      toast({ title: t("superAdminProfiles.roleUpdated") });
      await loadProfiles();
    } catch (error: unknown) {
      toast({
        title: t("common.error"),
        description:
          getErrorMessage(error) ?? t("superAdminProfiles.roleUpdateFailed"),
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const toggleBan = async (profile: ProfileItem, shouldBan: boolean) => {
    if (profile.id === user?.id) {
      toast({
        title: t("superAdminProfiles.selfBanLocked"),
        variant: "destructive",
      });
      return;
    }
    if (shouldBan && profile.effectiveRole === "super_admin") {
      toast({
        title: t("superAdminProfiles.cannotBanSuperAdmin"),
        variant: "destructive",
      });
      return;
    }

    setBanningId(profile.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("set-user-banned", {
        body: { user_id: profile.id, banned: shouldBan },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });

      // If the edge function isn't deployed yet, fall back to flipping
      // profiles.active so super-admins still have a workable kill switch.
      const dataError =
        data && typeof data === "object" && "error" in data
          ? (data as { error?: unknown }).error
          : undefined;
      if (error || dataError) {
        const message =
          (typeof dataError === "string" ? dataError : undefined) ??
          getErrorMessage(error) ??
          "Edge function unavailable";
        // Only fall back when the function itself is missing — not for auth errors.
        const isMissing = /not.?found|does not exist|404/i.test(String(message));
        if (!isMissing) throw new Error(message);

        const { error: profErr } = await supabase
          .from("profiles")
          .update({ active: !shouldBan })
          .eq("id", profile.id);
        if (profErr) throw profErr;
      }

      toast({
        title: shouldBan
          ? t("superAdminProfiles.userBanned")
          : t("superAdminProfiles.userUnbanned"),
        description: profile.full_name || profile.email || profile.id,
      });
      await loadProfiles();
    } catch (error: unknown) {
      toast({
        title: t("common.error"),
        description:
          getErrorMessage(error) ?? t("superAdminProfiles.banFailed"),
        variant: "destructive",
      });
    } finally {
      setBanningId(null);
    }
  };

  const resetAddForm = () => {
    setAddName("");
    setAddEmail("");
    setAddPhone("");
    setAddRole(createRoleOptions[0] ?? "cohost");
    setAddOrgId("");
    setAddCountry("");
    setAddState("");
    setAddPassword(generateTempPassword());
    setCreatedCreds(null);
  };

  const createMember = async () => {
    const email = addEmail.trim();
    if (!email) {
      toast({
        title: t("team.fillRequired", { defaultValue: "Email is required" }),
        variant: "destructive",
      });
      return;
    }
    if (!addOrgId) {
      toast({
        title: t("superAdminProfiles.orgRequired", {
          defaultValue: "Please choose an organization",
        }),
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("create-team-member", {
        body: {
          email,
          password: addPassword.trim() ? addPassword.trim() : undefined,
          full_name: addName.trim(),
          phone: addPhone.trim(),
          role: addRole,
          target_org_id: addOrgId,
        },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });

      const dataError =
        data && typeof data === "object" && "error" in data
          ? (data as { error?: unknown }).error
          : undefined;
      if (error || dataError) {
        const message =
          (typeof dataError === "string" ? dataError : undefined) ??
          getErrorMessage(error) ??
          t("common.error");
        throw new Error(message);
      }

      const reusedExisting =
        (data as { existing_user?: boolean } | null)?.existing_user === true;
      const newUserId =
        (data as { user_id?: string } | null)?.user_id ?? null;

      // If the form had a country/state, attach it to the new (or attached)
      // profile via a follow-up update. The edge function doesn't accept
      // these fields directly so we do it client-side — RLS lets super-admin
      // update any profile, and we wait for the function to have created
      // the row before patching.
      if (newUserId && (addCountry || addState)) {
        const locationPayload: Record<string, string | null> = {};
        if (addCountry) locationPayload.country = addCountry;
        if (addState && isStateInCountry(addState, addCountry || null))
          locationPayload.state = addState;
        if (Object.keys(locationPayload).length > 0) {
          await supabase
            .from("profiles")
            .update(locationPayload as never)
            .eq("id", newUserId);
        }
      }

      toast({
        title: reusedExisting
          ? t("superAdminProfiles.memberAttached", {
              defaultValue: "Existing user added to the organization",
            })
          : t("team.created", { defaultValue: "Team member created" }),
        description: email,
      });
      // Surface the temp credentials for a brand-new account so the super-admin
      // can share them; for an attached existing user there's nothing to share.
      setCreatedCreds(reusedExisting ? null : { email, password: addPassword });
      if (reusedExisting) setAddOpen(false);
      await loadProfiles();
    } catch (error: unknown) {
      toast({
        title: t("common.error"),
        description: getErrorMessage(error) ?? t("common.error"),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  // "Remove from org": detaches the person from the organization (clears role +
  // org and deletes their property assignments) while keeping their login.
  const removeFromOrg = async (profile: ProfileItem) => {
    if (profile.id === user?.id) {
      toast({
        title: t("superAdminProfiles.selfRoleLocked", {
          defaultValue: "You can't remove your own account.",
        }),
        variant: "destructive",
      });
      return;
    }
    if (profile.effectiveRole === "super_admin") {
      toast({
        title: t("superAdminProfiles.cannotRemoveSuperAdmin", {
          defaultValue: "Super admins can't be removed here.",
        }),
        variant: "destructive",
      });
      return;
    }

    setRemovingId(profile.id);
    try {
      // Only remove the person's property assignments. We deliberately DO NOT
      // touch the profiles row — never null out role or org_id, as that makes
      // the profile vanish from every list and look deleted. The account, its
      // role, and its organization are always preserved.
      const [membersDel, cohostsDel] = await Promise.all([
        supabase.from("property_members").delete().eq("user_id", profile.id),
        supabase.from("property_cohosts").delete().eq("user_id", profile.id),
      ]);
      if (membersDel.error) throw membersDel.error;
      if (cohostsDel.error) throw cohostsDel.error;

      toast({
        title: t("superAdminProfiles.assignmentsCleared", {
          defaultValue: "Property assignments removed",
        }),
        description: profile.full_name || profile.email || profile.id,
      });
      await loadProfiles();
    } catch (error: unknown) {
      toast({
        title: t("common.error"),
        description:
          getErrorMessage(error) ??
          t("superAdminProfiles.removeFailed", {
            defaultValue: "Failed to remove member",
          }),
        variant: "destructive",
      });
    } finally {
      setRemovingId(null);
    }
  };

  const rangeStart = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, totalCount);

  const paginationLabel = useMemo(() => {
    if (totalCount === 0) return t("superAdminProfiles.empty");
    return t("superAdminProfiles.paginationRange", {
      from: rangeStart,
      to: rangeEnd,
      total: totalCount,
      defaultValue: `${rangeStart}–${rangeEnd} of ${totalCount}`,
    });
  }, [rangeEnd, rangeStart, t, totalCount]);

  // Re-derive the currently-edited profile from the live list so updates
  // performed inside the sheet (which trigger loadProfiles) reflect back
  // into the sheet without us juggling separate state. Declared BEFORE the
  // early returns below so the hook order stays stable across renders
  // (Rules of Hooks — never call a hook after a conditional return).
  const editing = editingId
    ? profiles.find((p) => p.id === editingId) ?? null
    : null;
  useEffect(() => {
    if (editingId && !editing) setEditingId(null);
  }, [editingId, editing]);

  if (loading || isSuper === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuper) return <Unauthorized />;

  // KPI strip derived from the *currently loaded* page rather than from
  // server-side aggregates. Cheap, no extra round trip.
  const activeCount = profiles.filter((p) => !p.banned).length;
  const deactivatedCount = profiles.filter((p) => p.banned).length;
  const globalCount = profiles.filter((p) => p.scope === "global").length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* ─── Page header card ─── title + CTA + KPI strip */}
      <Card className="border-border/60 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t("superAdminProfiles.eyebrow", { defaultValue: "Platform administration" })}
            </p>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <HeaderIcon className="h-5 w-5" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-secondary md:text-3xl">
                {title}
              </h1>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <Button
            onClick={() => {
              resetAddForm();
              setAddOpen(true);
            }}
            data-testid="add-member-button"
            className="cursor-pointer shrink-0"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {t("superAdminProfiles.addMember", { defaultValue: "Add member" })}
          </Button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile
            icon={Users}
            label={t("superAdminProfiles.kpiTotal", { defaultValue: "Total" })}
            value={totalCount}
            tone="primary"
          />
          <KpiTile
            icon={UserCheck}
            label={t("superAdminProfiles.kpiActive", { defaultValue: "Active" })}
            value={activeCount}
            tone="emerald"
            hint={totalCount > pageSize ? t("superAdminProfiles.kpiThisPage", { defaultValue: "this page" }) : undefined}
          />
          <KpiTile
            icon={UserX}
            label={t("superAdminProfiles.kpiDeactivated", { defaultValue: "Deactivated" })}
            value={deactivatedCount}
            tone="rose"
            hint={totalCount > pageSize ? t("superAdminProfiles.kpiThisPage", { defaultValue: "this page" }) : undefined}
          />
          <KpiTile
            icon={Globe}
            label={t("superAdminProfiles.kpiPlatform", { defaultValue: "Platform" })}
            value={globalCount}
            tone="indigo"
            hint={totalCount > pageSize ? t("superAdminProfiles.kpiThisPage", { defaultValue: "this page" }) : undefined}
          />
        </div>
      </Card>

      {/* ─── Toolbar card ─── search + filters grouped + clearly labeled */}
      <Card className="border-border/60 p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t("superAdminProfiles.toolbar", { defaultValue: "Filters" })}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="profiles-search" className="text-xs font-medium text-muted-foreground">
              {t("superAdminProfiles.searchLabel")}
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="profiles-search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t("superAdminProfiles.searchPlaceholder")}
                className="h-10 pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("superAdminProfiles.statusFilterLabel")}
            </Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as StatusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-10 cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("superAdminProfiles.statusAll")}
                </SelectItem>
                <SelectItem value="active">
                  {t("superAdminProfiles.statusActive")}
                </SelectItem>
                <SelectItem value="banned">
                  {t("superAdminProfiles.statusBanned")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("locations.country", { defaultValue: "Country" })}
            </Label>
            <Select
              value={countryFilter}
              onValueChange={(value) => {
                setCountryFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-10 cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={COUNTRY_ALL}>
                  {t("locations.allCountries", { defaultValue: "All countries" })}
                </SelectItem>
                {COUNTRIES.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    {t(`locations.country_${country.code}`, {
                      defaultValue: country.labelEn,
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("locations.state", { defaultValue: "State / Region" })}
            </Label>
            <Select
              value={stateFilter}
              onValueChange={(value) => {
                setStateFilter(value);
                setPage(1);
              }}
              disabled={countryFilter === COUNTRY_ALL}
            >
              <SelectTrigger className="h-10 cursor-pointer">
                <SelectValue
                  placeholder={t("locations.statePickCountryFirst", {
                    defaultValue: "Pick a country first",
                  })}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={STATE_ALL}>
                  {t("locations.allStates", { defaultValue: "All states" })}
                </SelectItem>
                {getStatesForCountry(
                  countryFilter === COUNTRY_ALL ? null : (countryFilter as CountryCode),
                ).map((state) => (
                  <SelectItem key={state.code} value={state.code}>
                    {state.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("superAdminProfiles.pageSizeLabel")}
            </Label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-10 cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
        <span className="tabular-nums">{paginationLabel}</span>
        {fetching && (
          <span className="flex items-center gap-1.5 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("common.loading")}
          </span>
        )}
      </div>

      <div className="grid gap-3">
        {fetching && profiles.length === 0 && (
          <>
            {[0, 1, 2].map((i) => (
              <Card key={`skeleton-${i}`} className="border-border/60 p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-36" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </Card>
            ))}
          </>
        )}

        {!fetching && profiles.length === 0 && (
          <Card className="border-dashed border-border/60 p-10 text-center shadow-sm">
            <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Users className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-secondary">
              {t("superAdminProfiles.emptyTitle", { defaultValue: "No profiles found" })}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("superAdminProfiles.emptyHint", {
                defaultValue: "Try clearing your filters or adjusting the search.",
              })}
            </p>
          </Card>
        )}

        {profiles.length > 0 && (
          <Card className="border-border/60 shadow-sm overflow-hidden">
            <ul className="divide-y divide-border/60">
              {profiles.map((profile) => {
                const isSelf = profile.id === user.id;
                return (
                  <li key={profile.id}>
                    <button
                      type="button"
                      onClick={() => setEditingId(profile.id)}
                      className={cn(
                        "group flex w-full items-center gap-4 px-4 py-3 text-left transition-colors duration-200",
                        "hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                        "cursor-pointer",
                        profile.banned && "bg-destructive/[0.02]",
                      )}
                    >
                      <Avatar className="h-10 w-10 shrink-0 ring-2 ring-border/40">
                        <AvatarImage
                          src={profile.avatar_url ?? undefined}
                          alt={profile.full_name ?? profile.email ?? "Profile"}
                        />
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                          {getInitials(profile.full_name, profile.email)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-secondary">
                            {profile.full_name || t("superAdminProfiles.unnamed")}
                          </p>
                          {isSelf && (
                            <Badge className="bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200 text-[10px] font-medium px-1.5 py-0">
                              {t("superAdminProfiles.youBadge", { defaultValue: "You" })}
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {profile.email || "—"}
                        </p>
                      </div>

                      <Badge
                        className={cn(
                          "hidden sm:inline-flex shrink-0 font-medium",
                          getRoleBadgeClass(profile.effectiveRole),
                        )}
                        data-testid="profile-role-badge"
                      >
                        {profile.effectiveRole
                          ? t(getRoleLabelKey(profile.effectiveRole), {
                              defaultValue: profile.effectiveRole,
                            })
                          : t("superAdminProfiles.noRole")}
                      </Badge>

                      <div className="hidden md:flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground w-[120px]">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            profile.banned ? "bg-rose-500" : "bg-emerald-500",
                          )}
                          aria-hidden="true"
                        />
                        {profile.banned
                          ? t("superAdminProfiles.bannedBadge")
                          : t("superAdminProfiles.statusActive")}
                      </div>

                      <div className="hidden lg:flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground w-[140px]">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {profile.organizationName ||
                            (profile.scope === "global"
                              ? t("superAdminProfiles.globalScope")
                              : t("superAdminProfiles.noOrg", { defaultValue: "No org" }))}
                        </span>
                      </div>

                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>

      <Card className="border-border/60 p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground tabular-nums">{paginationLabel}</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1 || fetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="cursor-pointer"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              {t("superAdminProfiles.prev")}
            </Button>
            <span className="rounded-md bg-muted px-3 py-1 text-sm font-medium tabular-nums text-secondary">
              {t("superAdminProfiles.pageOf", {
                page: safePage,
                total: totalPages,
                defaultValue: `${safePage} / ${totalPages}`,
              })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages || fetching}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="cursor-pointer"
            >
              {t("superAdminProfiles.next")}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* ─── Edit sheet ─── slides in from the right with the full edit
          panel. Triggered by clicking a row. */}
      <Sheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditingId(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {editing && (() => {
            const isSelf = editing.id === user.id;
            const isBusy =
              savingId === editing.id ||
              banningId === editing.id ||
              removingId === editing.id;
            const dropdownRoles =
              roleDropdownOptions ?? getRoleOptions(editing.scope);
            const locationText = [editing.state, editing.country]
              .filter(Boolean)
              .join(", ");
            return (
              <>
                <SheetHeader className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-14 w-14 ring-2 ring-border/40">
                      <AvatarImage
                        src={editing.avatar_url ?? undefined}
                        alt={editing.full_name ?? editing.email ?? "Profile"}
                      />
                      <AvatarFallback className="bg-primary/10 text-primary text-lg font-medium">
                        {getInitials(editing.full_name, editing.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 text-left">
                      <SheetTitle className="truncate text-base font-semibold text-secondary">
                        {editing.full_name || t("superAdminProfiles.unnamed")}
                      </SheetTitle>
                      <SheetDescription className="truncate text-xs text-muted-foreground">
                        {editing.email || "—"}
                      </SheetDescription>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge
                      className={cn("font-medium", getRoleBadgeClass(editing.effectiveRole))}
                    >
                      {editing.effectiveRole
                        ? t(getRoleLabelKey(editing.effectiveRole), {
                            defaultValue: editing.effectiveRole,
                          })
                        : t("superAdminProfiles.noRole")}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-border/60 bg-background text-[11px] font-medium text-muted-foreground"
                    >
                      {editing.scope === "global"
                        ? t("superAdminProfiles.globalScope")
                        : t("superAdminProfiles.orgScope")}
                    </Badge>
                    <Badge
                      className={cn(
                        "font-medium",
                        editing.banned
                          ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
                          : "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
                      )}
                    >
                      {editing.banned
                        ? t("superAdminProfiles.bannedBadge")
                        : t("superAdminProfiles.statusActive")}
                    </Badge>
                    {isSelf && (
                      <Badge className="bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200 font-medium">
                        {t("superAdminProfiles.youBadge", { defaultValue: "You" })}
                      </Badge>
                    )}
                  </div>
                </SheetHeader>

                {/* Quick-glance contact + location summary */}
                <div className="mt-5 space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{editing.email || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{editing.phone || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {editing.organizationName ||
                        (editing.scope === "global"
                          ? t("superAdminProfiles.globalScope")
                          : t("superAdminProfiles.noOrg", { defaultValue: "No org" }))}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{locationText || "—"}</span>
                  </div>
                </div>

                {/* Editable fields */}
                <div className="mt-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      {t("team.role")}
                    </Label>
                    <Select
                      value={editing.effectiveRole ?? ""}
                      onValueChange={(value) => updateRole(editing, value)}
                      disabled={isBusy || isSelf}
                    >
                      <SelectTrigger className="h-10 cursor-pointer">
                        <SelectValue
                          placeholder={t("superAdminProfiles.noRole")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {dropdownRoles.map((role) => (
                          <SelectItem key={role} value={role}>
                            {t(getRoleLabelKey(role))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {editing.scope === "org" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        {t("superAdminProfiles.organization", {
                          defaultValue: "Organisation",
                        })}
                      </Label>
                      <Select
                        value={editing.org_id ?? ""}
                        onValueChange={(value) => updateOrg(editing, value)}
                        disabled={isBusy || isSelf}
                      >
                        <SelectTrigger className="h-10 cursor-pointer">
                          <SelectValue
                            placeholder={t("superAdminProfiles.noOrg", {
                              defaultValue: "Aucune organisation",
                            })}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {allOrgs.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        {t("locations.country", { defaultValue: "Country" })}
                      </Label>
                      <Select
                        value={editing.country ?? COUNTRY_NONE}
                        onValueChange={(value) =>
                          updateLocation(editing, {
                            country: value === COUNTRY_NONE ? null : value,
                          })
                        }
                        disabled={isBusy}
                      >
                        <SelectTrigger className="h-10 cursor-pointer">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={COUNTRY_NONE}>
                            {t("locations.unset", { defaultValue: "—" })}
                          </SelectItem>
                          {COUNTRIES.map((country) => (
                            <SelectItem key={country.code} value={country.code}>
                              {t(`locations.country_${country.code}`, {
                                defaultValue: country.labelEn,
                              })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        {t("locations.state", { defaultValue: "State / Region" })}
                      </Label>
                      <Select
                        value={editing.state ?? STATE_NONE}
                        onValueChange={(value) =>
                          updateLocation(editing, {
                            state: value === STATE_NONE ? null : value,
                          })
                        }
                        disabled={isBusy || !editing.country}
                      >
                        <SelectTrigger className="h-10 cursor-pointer">
                          <SelectValue
                            placeholder={t("locations.statePickCountryFirst", {
                              defaultValue: "Pick a country first",
                            })}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={STATE_NONE}>
                            {t("locations.unset", { defaultValue: "—" })}
                          </SelectItem>
                          {getStatesForCountry(editing.country).map((state) => (
                            <SelectItem key={state.code} value={state.code}>
                              {state.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* QR sign-in — only for employee roles. Super-admins can
                    always issue (the Edge function short-circuits on
                    super_admin), so showing the control here is safe. */}
                {isEmployeeRole(editing.effectiveRole) && (
                  <div className="mt-5 space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                      {t("team.qrCode", { defaultValue: "QR sign-in" })}
                    </Label>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">
                        {t("team.qrInlineHint", {
                          defaultValue:
                            "Generate a scannable QR so this employee can sign in without typing.",
                        })}
                      </p>
                      <MagicLinkQR
                        userId={editing.id}
                        userName={editing.full_name || editing.email || "—"}
                        avatarUrl={editing.avatar_url}
                        roleLabel={
                          editing.effectiveRole
                            ? t(`team.roles.${editing.effectiveRole}`, {
                                defaultValue: editing.effectiveRole,
                              })
                            : undefined
                        }
                      />
                    </div>
                  </div>
                )}

                {/* Danger zone */}
                <div className="mt-6 space-y-2 border-t border-border/60 pt-5">
                  {editing.banned ? (
                    <Button
                      variant="outline"
                      onClick={() => toggleBan(editing, false)}
                      disabled={isBusy || isSelf}
                      className="w-full cursor-pointer h-10"
                    >
                      {banningId === editing.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="mr-2 h-4 w-4" />
                      )}
                      {t("superAdminProfiles.unbanAction")}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => setConfirmBan(editing)}
                      disabled={
                        isBusy || isSelf || editing.effectiveRole === "super_admin"
                      }
                      className="w-full cursor-pointer h-10 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
                    >
                      {banningId === editing.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldOff className="mr-2 h-4 w-4" />
                      )}
                      {t("superAdminProfiles.banAction")}
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    onClick={() => setConfirmRemove(editing)}
                    disabled={
                      isBusy || isSelf || editing.effectiveRole === "super_admin"
                    }
                    className="w-full cursor-pointer h-10 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    data-testid="remove-member-button"
                  >
                    {removingId === editing.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    {t("superAdminProfiles.removeAction", {
                      defaultValue: "Unassign from all properties",
                    })}
                  </Button>

                  {isSelf && (
                    <p className="text-xs text-muted-foreground text-center pt-1">
                      {t("superAdminProfiles.selfRoleHint")}
                    </p>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!confirmBan}
        onOpenChange={(open) => !open && setConfirmBan(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("superAdminProfiles.confirmBanTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("superAdminProfiles.confirmBanBody", {
                name:
                  confirmBan?.full_name ||
                  confirmBan?.email ||
                  confirmBan?.id ||
                  "",
                defaultValue:
                  "This will revoke access for {{name}}. They will be logged out and unable to sign back in until unbanned.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const target = confirmBan;
                setConfirmBan(null);
                if (target) await toggleBan(target, true);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("superAdminProfiles.banAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create ("Add member") dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) resetAddForm();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("superAdminProfiles.addMember", { defaultValue: "Add member" })}
            </DialogTitle>
            <DialogDescription>
              {t("superAdminProfiles.addMemberHint", {
                defaultValue:
                  "Create a new account (or attach an existing email) to an organization.",
              })}
            </DialogDescription>
          </DialogHeader>

          {createdCreds ? (
            <div className="space-y-3">
              <p className="text-sm">
                {t("team.shareCreds", {
                  defaultValue: "Share these sign-in details with the new member:",
                })}
              </p>
              <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
                <div>
                  <strong>{t("auth.email", { defaultValue: "Email" })}:</strong>{" "}
                  {createdCreds.email}
                </div>
                <div>
                  <strong>{t("auth.password", { defaultValue: "Password" })}:</strong>{" "}
                  {createdCreds.password}
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    resetAddForm();
                  }}
                >
                  {t("superAdminProfiles.addAnother", { defaultValue: "Add another" })}
                </Button>
                <Button onClick={() => setAddOpen(false)}>
                  {t("common.done", { defaultValue: "Done" })}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>
                  {t("superAdminProfiles.organization", {
                    defaultValue: "Organisation",
                  })}
                </Label>
                <Select value={addOrgId} onValueChange={setAddOrgId}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t("superAdminProfiles.chooseOrg", {
                        defaultValue: "Choose an organization",
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {allOrgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t("team.role", { defaultValue: "Role" })}</Label>
                <Select value={addRole} onValueChange={setAddRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {createRoleOptions.map((role) => (
                      <SelectItem key={role} value={role}>
                        {t(getRoleLabelKey(role), { defaultValue: role })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t("auth.fullName", { defaultValue: "Full name" })}</Label>
                <Input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("auth.email", { defaultValue: "Email" })} *</Label>
                <Input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("auth.phone", { defaultValue: "Phone" })}</Label>
                <Input
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>{t("locations.country", { defaultValue: "Country" })}</Label>
                  <Select
                    value={addCountry || COUNTRY_NONE}
                    onValueChange={(value) => {
                      const next = value === COUNTRY_NONE ? "" : value;
                      setAddCountry(next);
                      // Clear state when country changes so we never carry a
                      // mismatched code through to the create call.
                      if (next !== addCountry) setAddState("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={COUNTRY_NONE}>
                        {t("locations.unset", { defaultValue: "—" })}
                      </SelectItem>
                      {COUNTRIES.map((country) => (
                        <SelectItem key={country.code} value={country.code}>
                          {t(`locations.country_${country.code}`, {
                            defaultValue: country.labelEn,
                          })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("locations.state", { defaultValue: "State / Region" })}</Label>
                  <Select
                    value={addState || STATE_NONE}
                    onValueChange={(value) =>
                      setAddState(value === STATE_NONE ? "" : value)
                    }
                    disabled={!addCountry}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("locations.statePickCountryFirst", {
                          defaultValue: "Pick a country first",
                        })}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={STATE_NONE}>
                        {t("locations.unset", { defaultValue: "—" })}
                      </SelectItem>
                      {getStatesForCountry(addCountry || null).map((state) => (
                        <SelectItem key={state.code} value={state.code}>
                          {state.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>
                  {t("team.tempPassword", { defaultValue: "Temporary password" })}
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={addPassword}
                    onChange={(e) => setAddPassword(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setAddPassword(generateTempPassword())}
                    aria-label={t("team.regenerate", {
                      defaultValue: "Regenerate password",
                    })}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("superAdminProfiles.passwordHint", {
                    defaultValue:
                      "Only used for brand-new accounts. Existing emails are attached without changing their password.",
                  })}
                </p>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAddOpen(false)}
                  disabled={creating}
                >
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Button>
                <Button onClick={createMember} disabled={creating}>
                  {creating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="mr-2 h-4 w-4" />
                  )}
                  {t("superAdminProfiles.create", { defaultValue: "Create" })}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Remove-from-org confirmation */}
      <AlertDialog
        open={!!confirmRemove}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("superAdminProfiles.confirmRemoveTitle", {
                defaultValue: "Unassign from all properties?",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("superAdminProfiles.confirmRemoveBody", {
                name:
                  confirmRemove?.full_name ||
                  confirmRemove?.email ||
                  confirmRemove?.id ||
                  "",
                defaultValue:
                  "This removes {{name}} from every property they're assigned to. Their account, role and organization are kept unchanged — only the property assignments are cleared.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const target = confirmRemove;
                setConfirmRemove(null);
                if (target) await removeFromOrg(target);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("superAdminProfiles.removeAction", {
                defaultValue: "Unassign from all properties",
              })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
