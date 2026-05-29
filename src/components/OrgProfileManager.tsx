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
  Home,
  Loader2,
  Users,
  UserCheck,
  UserX,
  SlidersHorizontal,
  Mail,
  Phone,
  MapPin,
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
import { getUserAccess } from "@/lib/access";
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
import { toast } from "@/hooks/use-toast";
import {
  COUNTRIES,
  getStatesForCountry,
  isStateInCountry,
} from "@/lib/locations";

// Org-scoped people manager used by the admin Cohosts / Employees sections.
// It mirrors the super-admin SuperAdminProfileManager (search, status filter,
// pagination, role change, activate/deactivate) but is gated to organization
// admins and only ever lists / mutates profiles inside the admin's own
// organization. It also surfaces each person's property assignments so an
// admin can see what a cohost or employee is responsible for.

const getErrorMessage = (error: unknown): string | undefined => {
  if (!error) return undefined;
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return undefined;
};

// Roles an org admin may assign within their organization. Deliberately omits
// super_admin and other global roles — those are managed by the super-admin.
const ORG_ROLE_OPTIONS = [
  "admin",
  "co_admin",
  "cohost",
  "cleaner",
  "driver",
  "decorator",
  "maintenance",
  "staff",
] as const;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

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

type AssignedProperty = { id: string; name: string };

type ProfileItem = ProfileRow & {
  banned: boolean;
  properties: AssignedProperty[];
};

export type OrgProfileManagerProps = {
  /** Title shown at the top of the page. */
  title: string;
  /** Short description shown under the title. */
  subtitle: string;
  /** Optional header icon. Defaults to a shield. */
  icon?: ComponentType<{ className?: string }>;
  /** Roles to include in the listing (e.g. ["cohost"]). */
  allowedRoles: readonly string[];
  /** Roles offered in the per-profile role dropdown. Defaults to org roles. */
  roleDropdownOptions?: readonly string[];
};

const getInitials = (name: string | null, email: string | null) => {
  const source = (name || email || "").trim();
  if (!source) return "U";
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
};

// Small KPI tile used in the page header. Tone drives the icon-tile colour;
// values stay neutral so the eye reads the number, not the badge.
type KpiTone = "primary" | "emerald" | "rose" | "blue";

const KPI_TONE_MAP: Record<KpiTone, string> = {
  primary: "bg-primary/10 text-primary",
  emerald: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-600",
  blue: "bg-blue-50 text-blue-600",
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

// Soft tinted chips — matches the data-dense dashboard convention. Each
// chip has its own accent + ring so role-at-a-glance scanning is fast
// without the eye-fatigue of saturated full-colour badges.
const getRoleBadgeClass = (role: string | null) => {
  switch (role) {
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
    case null:
    case undefined:
      return "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200";
  }
};

export default function OrgProfileManager({
  title,
  subtitle,
  icon: HeaderIcon = Shield,
  allowedRoles,
  roleDropdownOptions,
}: OrgProfileManagerProps) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  // null = still resolving, false = not an org admin, string = the admin's org.
  const [orgId, setOrgId] = useState<string | null | false>(null);

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

  // Switching country must drop a now-irrelevant state code so we don't
  // silently filter to zero rows.
  useEffect(() => {
    setStateFilter(STATE_ALL);
  }, [countryFilter]);

  const [savingId, setSavingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<ProfileItem | null>(null);
  // The id of the profile whose edit sheet is open. Derived back to the
  // live ProfileItem each render so updates inside the sheet stay in sync
  // with refreshes of the underlying list.
  const [editingId, setEditingId] = useState<string | null>(null);

  const roleKey = allowedRoles.join(",");

  // Debounce the search input.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  // Resolve the current user's org + admin status.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setOrgId(false);
      return;
    }
    getUserAccess(user.id)
      .then(async (access) => {
        if (!access.isAdmin) {
          setOrgId(false);
          return;
        }
        if (access.orgId) {
          setOrgId(access.orgId);
          return;
        }
        // Freshly-invited admins may not have `org_id` set yet — fall back to
        // their pending organization so the page still lists that org's people.
        const { data } = await supabase
          .from("profiles")
          .select("pending_org_id")
          .eq("id", user.id)
          .maybeSingle();
        const pending =
          (data as { pending_org_id?: string | null } | null)?.pending_org_id ??
          null;
        setOrgId(pending ?? false);
      })
      .catch(() => setOrgId(false));
  }, [user?.id, loading]);

  const loadProfiles = async () => {
    if (typeof orgId !== "string") return;
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
        .eq("org_id", orgId)
        .in("role", allowedRoles as string[])
        .order("created_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true });

      if (countryFilter !== COUNTRY_ALL) {
        query = query.eq("country", countryFilter);
      }
      if (stateFilter !== STATE_ALL) {
        query = query.eq("state", stateFilter);
      }

      if (statusFilter === "active") {
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
      const userIds = rows.map((r) => r.id);

      // Resolve property assignments for the listed people. Employees are in
      // property_members; cohosts in property_cohosts. We union both so the
      // page works for either role set.
      const propsByUser = new Map<string, Set<string>>();
      if (userIds.length > 0) {
        const [membersRes, cohostsRes] = await Promise.all([
          supabase
            .from("property_members")
            .select("user_id, property_id")
            .in("user_id", userIds),
          supabase
            .from("property_cohosts")
            .select("user_id, property_id")
            .in("user_id", userIds),
        ]);
        const addAssignment = (uid: string, pid: string) => {
          const set = propsByUser.get(uid) ?? new Set<string>();
          set.add(pid);
          propsByUser.set(uid, set);
        };
        ((membersRes.data ?? []) as { user_id: string; property_id: string }[]).forEach(
          (r) => addAssignment(r.user_id, r.property_id),
        );
        ((cohostsRes.data ?? []) as { user_id: string; property_id: string }[]).forEach(
          (r) => addAssignment(r.user_id, r.property_id),
        );
      }

      const allPropIds = Array.from(
        new Set(Array.from(propsByUser.values()).flatMap((s) => Array.from(s))),
      );
      const propNameMap = new Map<string, string>();
      if (allPropIds.length > 0) {
        const { data: propRows } = await supabase
          .from("properties")
          .select("id, name")
          .in("id", allPropIds);
        ((propRows ?? []) as { id: string; name: string }[]).forEach((p) =>
          propNameMap.set(p.id, p.name),
        );
      }

      const items: ProfileItem[] = rows.map((profile) => {
        const propIds = Array.from(propsByUser.get(profile.id) ?? []);
        const properties = propIds.map((id) => ({
          id,
          name: propNameMap.get(id) ?? id,
        }));
        return {
          ...profile,
          banned: profile.active === false,
          properties,
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
    if (typeof orgId !== "string") return;
    void loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, page, pageSize, statusFilter, searchQuery, roleKey, countryFilter, stateFilter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  /** Update country and/or state on a profile. Mirrors the same helper in
   *  SuperAdminProfileManager — when we change country, drop a now-orphaned
   *  state code so the row never has a state that doesn't belong to its
   *  country. */
  const updateLocation = async (
    profile: ProfileItem,
    patch: { country?: string | null; state?: string | null },
  ) => {
    const payload: Record<string, string | null> = {};
    if (patch.country !== undefined) payload.country = patch.country;
    if (patch.state !== undefined) payload.state = patch.state;
    if (Object.keys(payload).length === 0) return;

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
        title: t("superAdminProfiles.selfRoleLocked", {
          defaultValue: "You can't change your own role.",
        }),
        variant: "destructive",
      });
      return;
    }
    if (nextRole === profile.role) return;

    setSavingId(profile.id);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ role: nextRole })
        .eq("id", profile.id);
      if (error) throw error;
      toast({
        title: t("superAdminProfiles.roleUpdated", {
          defaultValue: "Role updated",
        }),
      });
      await loadProfiles();
    } catch (error: unknown) {
      toast({
        title: t("common.error"),
        description:
          getErrorMessage(error) ??
          t("superAdminProfiles.roleUpdateFailed", {
            defaultValue: "Failed to update role",
          }),
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (profile: ProfileItem, shouldActivate: boolean) => {
    if (profile.id === user?.id) {
      toast({
        title: t("superAdminProfiles.selfBanLocked", {
          defaultValue: "You can't deactivate your own account.",
        }),
        variant: "destructive",
      });
      return;
    }

    setTogglingId(profile.id);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ active: shouldActivate })
        .eq("id", profile.id);
      if (error) throw error;
      toast({
        title: shouldActivate
          ? t("superAdminProfiles.userUnbanned", { defaultValue: "User reactivated" })
          : t("superAdminProfiles.userBanned", { defaultValue: "User deactivated" }),
        description: profile.full_name || profile.email || profile.id,
      });
      await loadProfiles();
    } catch (error: unknown) {
      toast({
        title: t("common.error"),
        description:
          getErrorMessage(error) ??
          t("superAdminProfiles.banFailed", { defaultValue: "Action failed" }),
        variant: "destructive",
      });
    } finally {
      setTogglingId(null);
    }
  };

  const rangeStart = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, totalCount);

  const paginationLabel = useMemo(() => {
    if (totalCount === 0)
      return t("superAdminProfiles.empty", { defaultValue: "No profiles found" });
    return t("superAdminProfiles.paginationRange", {
      from: rangeStart,
      to: rangeEnd,
      total: totalCount,
      defaultValue: `${rangeStart}–${rangeEnd} of ${totalCount}`,
    });
  }, [rangeEnd, rangeStart, t, totalCount]);

  const dropdownRoles = roleDropdownOptions ?? ORG_ROLE_OPTIONS;

  // Re-derive the currently-edited profile from the live list so updates
  // performed inside the sheet (which trigger loadProfiles) reflect back
  // into the sheet without us juggling separate state. Declared BEFORE the
  // early returns below so the hook order stays stable across renders
  // (Rules of Hooks — never call a hook after a conditional return).
  const editing = editingId
    ? profiles.find((p) => p.id === editingId) ?? null
    : null;
  // If the row dropped off the page (e.g. role filter removed it), close
  // the sheet rather than stranding a ghost.
  useEffect(() => {
    if (editingId && !editing) setEditingId(null);
  }, [editingId, editing]);

  if (loading || orgId === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (orgId === false) return <Unauthorized />;

  // KPI strip is derived from the *currently loaded* page rather than from
  // server-side aggregates. Cheap, no extra round trip, and matches what the
  // operator sees on screen. Server-side counts can be wired up later if we
  // need true org-wide totals.
  const activeCount = profiles.filter((p) => !p.banned).length;
  const deactivatedCount = profiles.filter((p) => p.banned).length;
  const assignedCount = profiles.filter((p) => p.properties.length > 0).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* ─── Page header card ─── title + KPI strip in one confident block */}
      <Card className="border-border/60 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t("orgProfiles.eyebrow", { defaultValue: "Team management" })}
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
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile
            icon={Users}
            label={t("orgProfiles.kpiTotal", { defaultValue: "Total" })}
            value={totalCount}
            tone="primary"
          />
          <KpiTile
            icon={UserCheck}
            label={t("orgProfiles.kpiActive", { defaultValue: "Active" })}
            value={activeCount}
            tone="emerald"
            hint={totalCount > pageSize ? t("orgProfiles.kpiThisPage", { defaultValue: "this page" }) : undefined}
          />
          <KpiTile
            icon={UserX}
            label={t("orgProfiles.kpiDeactivated", { defaultValue: "Deactivated" })}
            value={deactivatedCount}
            tone="rose"
            hint={totalCount > pageSize ? t("orgProfiles.kpiThisPage", { defaultValue: "this page" }) : undefined}
          />
          <KpiTile
            icon={Home}
            label={t("orgProfiles.kpiAssigned", { defaultValue: "Assigned" })}
            value={assignedCount}
            tone="blue"
            hint={totalCount > pageSize ? t("orgProfiles.kpiThisPage", { defaultValue: "this page" }) : undefined}
          />
        </div>
      </Card>

      {/* ─── Toolbar card ─── search + filters, grouped + clearly labeled */}
      <Card className="border-border/60 p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t("orgProfiles.toolbar", { defaultValue: "Filters" })}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="profiles-search" className="text-xs font-medium text-muted-foreground">
              {t("superAdminProfiles.searchLabel", { defaultValue: "Search" })}
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="profiles-search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t("superAdminProfiles.searchPlaceholder", {
                  defaultValue: "Name, email or phone",
                })}
                className="h-10 pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("superAdminProfiles.statusFilterLabel", { defaultValue: "Status" })}
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
                  {t("superAdminProfiles.statusAll", { defaultValue: "All" })}
                </SelectItem>
                <SelectItem value="active">
                  {t("superAdminProfiles.statusActive", { defaultValue: "Active" })}
                </SelectItem>
                <SelectItem value="banned">
                  {t("superAdminProfiles.statusBanned", { defaultValue: "Deactivated" })}
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
                  countryFilter === COUNTRY_ALL ? null : countryFilter,
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
              {t("superAdminProfiles.pageSizeLabel", { defaultValue: "Per page" })}
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
              {t("orgProfiles.emptyTitle", { defaultValue: "No people found" })}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("orgProfiles.emptyHint", {
                defaultValue: "Try clearing your filters or adjusting the search.",
              })}
            </p>
          </Card>
        )}

        {/* Card wraps the whole list — gives one unified surface so rows
            look like a continuous table rather than a stack of cards. */}
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

                      {/* Identity column */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-secondary">
                            {profile.full_name ||
                              t("superAdminProfiles.unnamed", { defaultValue: "Unnamed" })}
                          </p>
                          {isSelf && (
                            <Badge className="bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200 text-[10px] font-medium px-1.5 py-0">
                              {t("orgProfiles.youBadge", { defaultValue: "You" })}
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {profile.email || "—"}
                        </p>
                      </div>

                      {/* Role chip — always visible */}
                      <Badge
                        className={cn(
                          "hidden sm:inline-flex shrink-0 font-medium",
                          getRoleBadgeClass(profile.role),
                        )}
                        data-testid="profile-role-badge"
                      >
                        {profile.role
                          ? t(`team.roles.${profile.role}`, {
                              defaultValue: profile.role,
                            })
                          : t("superAdminProfiles.noRole", { defaultValue: "No role" })}
                      </Badge>

                      {/* Status dot */}
                      <div className="hidden md:flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground w-[120px]">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            profile.banned ? "bg-rose-500" : "bg-emerald-500",
                          )}
                          aria-hidden="true"
                        />
                        {profile.banned
                          ? t("superAdminProfiles.bannedBadge", { defaultValue: "Deactivated" })
                          : t("superAdminProfiles.statusActive", { defaultValue: "Active" })}
                      </div>

                      {/* Properties count */}
                      <div className="hidden lg:flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground w-[120px]">
                        <Home className="h-3.5 w-3.5" />
                        <span className="tabular-nums">
                          {t("orgProfiles.propertyCount", {
                            count: profile.properties.length,
                            defaultValue: `${profile.properties.length} ${profile.properties.length === 1 ? "property" : "properties"}`,
                          })}
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
              {t("superAdminProfiles.prev", { defaultValue: "Prev" })}
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
              {t("superAdminProfiles.next", { defaultValue: "Next" })}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* ─── Edit sheet ─── slides in from the right with the full edit
          panel. Triggered by clicking a row. Closes when user clicks the
          backdrop, presses Esc, or hits the close button. */}
      <Sheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditingId(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {editing && (() => {
            const isSelf = editing.id === user.id;
            const isBusy = savingId === editing.id || togglingId === editing.id;
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
                        {editing.full_name ||
                          t("superAdminProfiles.unnamed", { defaultValue: "Unnamed" })}
                      </SheetTitle>
                      <SheetDescription className="truncate text-xs text-muted-foreground">
                        {editing.email || "—"}
                      </SheetDescription>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge
                      className={cn("font-medium", getRoleBadgeClass(editing.role))}
                    >
                      {editing.role
                        ? t(`team.roles.${editing.role}`, { defaultValue: editing.role })
                        : t("superAdminProfiles.noRole", { defaultValue: "No role" })}
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
                        ? t("superAdminProfiles.bannedBadge", { defaultValue: "Deactivated" })
                        : t("superAdminProfiles.statusActive", { defaultValue: "Active" })}
                    </Badge>
                    {isSelf && (
                      <Badge className="bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200 font-medium">
                        {t("orgProfiles.youBadge", { defaultValue: "You" })}
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
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{locationText || "—"}</span>
                  </div>
                </div>

                {/* Editable fields */}
                <div className="mt-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      {t("team.role", { defaultValue: "Role" })}
                    </Label>
                    <Select
                      value={editing.role ?? ""}
                      onValueChange={(value) => updateRole(editing, value)}
                      disabled={isBusy || isSelf}
                    >
                      <SelectTrigger className="h-10 cursor-pointer">
                        <SelectValue
                          placeholder={t("superAdminProfiles.noRole", {
                            defaultValue: "No role",
                          })}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {dropdownRoles.map((role) => (
                          <SelectItem key={role} value={role}>
                            {t(`team.roles.${role}`, { defaultValue: role })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

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

                {/* Assigned properties */}
                <div className="mt-5 space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {t("orgProfiles.properties", { defaultValue: "Properties" })}
                  </Label>
                  {editing.properties.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-4 text-center text-xs text-muted-foreground">
                      {t("orgProfiles.noProperties", { defaultValue: "None assigned" })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {editing.properties.map((p) => (
                        <Badge
                          key={p.id}
                          variant="outline"
                          className="border-border/60 bg-background text-[11px] font-medium"
                        >
                          {p.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Danger zone */}
                <div className="mt-6 border-t border-border/60 pt-5">
                  {editing.banned ? (
                    <Button
                      variant="outline"
                      onClick={() => toggleActive(editing, true)}
                      disabled={isBusy || isSelf}
                      className="w-full cursor-pointer h-10"
                    >
                      {togglingId === editing.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="mr-2 h-4 w-4" />
                      )}
                      {t("superAdminProfiles.unbanAction", { defaultValue: "Reactivate" })}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => setConfirmDeactivate(editing)}
                      disabled={isBusy || isSelf}
                      className="w-full cursor-pointer h-10 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
                    >
                      {togglingId === editing.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldOff className="mr-2 h-4 w-4" />
                      )}
                      {t("superAdminProfiles.banAction", { defaultValue: "Deactivate" })}
                    </Button>
                  )}
                  {isSelf && (
                    <p className="mt-2 text-xs text-muted-foreground text-center">
                      {t("superAdminProfiles.selfRoleHint", {
                        defaultValue: "You can't change your own account here.",
                      })}
                    </p>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!confirmDeactivate}
        onOpenChange={(open) => !open && setConfirmDeactivate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("superAdminProfiles.confirmBanTitle", {
                defaultValue: "Deactivate this account?",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("superAdminProfiles.confirmBanBody", {
                name:
                  confirmDeactivate?.full_name ||
                  confirmDeactivate?.email ||
                  confirmDeactivate?.id ||
                  "",
                defaultValue:
                  "This will revoke access for {{name}}. They will be unable to use the app until reactivated.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const target = confirmDeactivate;
                setConfirmDeactivate(null);
                if (target) await toggleActive(target, false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("superAdminProfiles.banAction", { defaultValue: "Deactivate" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
