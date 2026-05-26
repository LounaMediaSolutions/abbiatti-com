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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isSuperAdminUser } from "@/lib/access";
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

const getRoleBadgeClass = (role: string | null) => {
  switch (role) {
    case "super_admin":
      return "bg-primary text-primary-foreground";
    case "admin":
    case "co_admin":
      return "bg-secondary text-secondary-foreground";
    case "cohost":
      return "bg-amber-500 text-white";
    case "cleaner":
    case "driver":
    case "decorator":
    case "maintenance":
    case "staff":
      return "bg-emerald-500 text-white";
    case "guest":
      return "bg-muted text-foreground";
    case null:
    case undefined:
      return "bg-destructive/20 text-destructive";
    default:
      return "bg-muted text-foreground";
  }
};

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

  // Load every organization once the user is confirmed super-admin, so the
  // per-profile org picker can move a user to any organization.
  useEffect(() => {
    if (!isSuper) return;
    supabase
      .from("organizations")
      .select("id, name")
      .order("name")
      .then(({ data }) => setAllOrgs((data ?? []) as { id: string; name: string }[]));
  }, [isSuper]);

  const loadProfiles = async () => {
    setFetching(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("profiles")
        .select(
          "id, full_name, email, phone, avatar_url, org_id, role, active, country, state",
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
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

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

  if (loading || isSuper === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuper) return <Unauthorized />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-secondary">
            <HeaderIcon className="h-6 w-6 text-primary" />
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
          <Button
            className="mt-2"
            onClick={() => {
              resetAddForm();
              setAddOpen(true);
            }}
            data-testid="add-member-button"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {t("superAdminProfiles.addMember", { defaultValue: "Add member" })}
          </Button>
        </div>
        <div className="flex w-full max-w-2xl flex-wrap items-end gap-3 md:w-auto">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <Label htmlFor="profiles-search">
              {t("superAdminProfiles.searchLabel")}
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="profiles-search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t("superAdminProfiles.searchPlaceholder")}
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <Label>{t("superAdminProfiles.statusFilterLabel")}</Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as StatusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger>
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
          <div className="w-full space-y-1.5 sm:w-44">
            <Label>{t("locations.country", { defaultValue: "Country" })}</Label>
            <Select
              value={countryFilter}
              onValueChange={(value) => {
                setCountryFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger>
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
          <div className="w-full space-y-1.5 sm:w-48">
            <Label>{t("locations.state", { defaultValue: "State / Region" })}</Label>
            <Select
              value={stateFilter}
              onValueChange={(value) => {
                setStateFilter(value);
                setPage(1);
              }}
              disabled={countryFilter === COUNTRY_ALL}
            >
              <SelectTrigger>
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
          <div className="w-full space-y-1.5 sm:w-32">
            <Label>{t("superAdminProfiles.pageSizeLabel")}</Label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setPage(1);
              }}
            >
              <SelectTrigger>
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
      </div>

      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{paginationLabel}</span>
        {fetching && (
          <span className="flex items-center gap-1 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("common.loading")}
          </span>
        )}
      </div>

      <div className="grid gap-3">
        {!fetching && profiles.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground shadow-card">
            {t("superAdminProfiles.empty")}
          </Card>
        )}

        {profiles.map((profile) => {
          const isSelf = profile.id === user.id;
          const isBusy =
            savingId === profile.id ||
            banningId === profile.id ||
            removingId === profile.id;
          const dropdownRoles = roleDropdownOptions ?? getRoleOptions(profile.scope);
          return (
            <Card
              key={profile.id}
              className={`p-4 shadow-card ${profile.banned ? "border-destructive/40" : ""}`}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage
                      src={profile.avatar_url ?? undefined}
                      alt={profile.full_name ?? profile.email ?? "Profile"}
                    />
                    <AvatarFallback>
                      {getInitials(profile.full_name, profile.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-secondary">
                        {profile.full_name || t("superAdminProfiles.unnamed")}
                      </p>
                      <Badge
                        className={getRoleBadgeClass(profile.effectiveRole)}
                        data-testid="profile-role-badge"
                      >
                        {profile.effectiveRole
                          ? t(getRoleLabelKey(profile.effectiveRole), {
                              defaultValue: profile.effectiveRole,
                            })
                          : t("superAdminProfiles.noRole")}
                      </Badge>
                      <Badge variant="outline">
                        {profile.scope === "global"
                          ? t("superAdminProfiles.globalScope")
                          : t("superAdminProfiles.orgScope")}
                      </Badge>
                      {profile.organizationName && (
                        <Badge variant="secondary">
                          {profile.organizationName}
                        </Badge>
                      )}
                      {profile.banned && (
                        <Badge variant="destructive">
                          {t("superAdminProfiles.bannedBadge")}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {profile.email || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {profile.phone || "—"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 md:min-w-[260px]">
                  <div className="space-y-1.5">
                    <Label>{t("team.role")}</Label>
                    <Select
                      value={profile.effectiveRole ?? ""}
                      onValueChange={(value) => updateRole(profile, value)}
                      disabled={isBusy || isSelf}
                    >
                      <SelectTrigger>
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

                  {profile.scope === "org" && (
                    <div className="space-y-1.5">
                      <Label>
                        {t("superAdminProfiles.organization", { defaultValue: "Organisation" })}
                      </Label>
                      <Select
                        value={profile.org_id ?? ""}
                        onValueChange={(value) => updateOrg(profile, value)}
                        disabled={isBusy || isSelf}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t("superAdminProfiles.noOrg", { defaultValue: "Aucune organisation" })}
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
                      <Label>{t("locations.country", { defaultValue: "Country" })}</Label>
                      <Select
                        value={profile.country ?? COUNTRY_NONE}
                        onValueChange={(value) =>
                          updateLocation(profile, {
                            country: value === COUNTRY_NONE ? null : value,
                          })
                        }
                        disabled={isBusy}
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
                        value={profile.state ?? STATE_NONE}
                        onValueChange={(value) =>
                          updateLocation(profile, {
                            state: value === STATE_NONE ? null : value,
                          })
                        }
                        disabled={isBusy || !profile.country}
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
                          {getStatesForCountry(profile.country).map((state) => (
                            <SelectItem key={state.code} value={state.code}>
                              {state.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {profile.banned ? (
                    <Button
                      variant="outline"
                      onClick={() => toggleBan(profile, false)}
                      disabled={isBusy || isSelf}
                    >
                      {banningId === profile.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}
                      {t("superAdminProfiles.unbanAction")}
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      onClick={() => setConfirmBan(profile)}
                      disabled={
                        isBusy || isSelf || profile.effectiveRole === "super_admin"
                      }
                    >
                      {banningId === profile.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldOff className="h-4 w-4" />
                      )}
                      {t("superAdminProfiles.banAction")}
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmRemove(profile)}
                    disabled={
                      isBusy || isSelf || profile.effectiveRole === "super_admin"
                    }
                    data-testid="remove-member-button"
                  >
                    {removingId === profile.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    {t("superAdminProfiles.removeAction", {
                      defaultValue: "Unassign from all properties",
                    })}
                  </Button>

                  {isSelf && (
                    <p className="text-xs text-muted-foreground">
                      {t("superAdminProfiles.selfRoleHint")}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{paginationLabel}</p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage <= 1 || fetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
            {t("superAdminProfiles.prev")}
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">
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
          >
            {t("superAdminProfiles.next")}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

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
