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
} from "lucide-react";
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
};

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

const getRoleBadgeClass = (role: string | null) => {
  switch (role) {
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
    case null:
    case undefined:
      return "bg-destructive/20 text-destructive";
    default:
      return "bg-muted text-foreground";
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const [savingId, setSavingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<ProfileItem | null>(null);

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
          "id, full_name, email, phone, avatar_url, org_id, role, active",
          { count: "exact" },
        )
        .eq("org_id", orgId)
        .in("role", allowedRoles as string[])
        .order("created_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true });

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
  }, [orgId, page, pageSize, statusFilter, searchQuery, roleKey]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

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

  if (loading || orgId === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (orgId === false) return <Unauthorized />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-secondary">
            <HeaderIcon className="h-6 w-6 text-primary" />
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex w-full max-w-2xl flex-wrap items-end gap-3 md:w-auto">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <Label htmlFor="profiles-search">
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
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <Label>
              {t("superAdminProfiles.statusFilterLabel", { defaultValue: "Status" })}
            </Label>
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
          <div className="w-full space-y-1.5 sm:w-32">
            <Label>
              {t("superAdminProfiles.pageSizeLabel", { defaultValue: "Per page" })}
            </Label>
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
            {t("superAdminProfiles.empty", { defaultValue: "No profiles found" })}
          </Card>
        )}

        {profiles.map((profile) => {
          const isSelf = profile.id === user.id;
          const isBusy = savingId === profile.id || togglingId === profile.id;
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
                        {profile.full_name ||
                          t("superAdminProfiles.unnamed", { defaultValue: "Unnamed" })}
                      </p>
                      <Badge
                        className={getRoleBadgeClass(profile.role)}
                        data-testid="profile-role-badge"
                      >
                        {profile.role
                          ? t(`team.roles.${profile.role}`, {
                              defaultValue: profile.role,
                            })
                          : t("superAdminProfiles.noRole", { defaultValue: "No role" })}
                      </Badge>
                      {profile.banned && (
                        <Badge variant="destructive">
                          {t("superAdminProfiles.bannedBadge", {
                            defaultValue: "Deactivated",
                          })}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {profile.email || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {profile.phone || "—"}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Home className="h-3.5 w-3.5" />
                        {t("orgProfiles.properties", { defaultValue: "Properties" })}:
                      </span>
                      {profile.properties.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {t("orgProfiles.noProperties", {
                            defaultValue: "None assigned",
                          })}
                        </span>
                      ) : (
                        profile.properties.map((p) => (
                          <Badge key={p.id} variant="outline" className="text-[11px]">
                            {p.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 md:min-w-[260px]">
                  <div className="space-y-1.5">
                    <Label>{t("team.role", { defaultValue: "Role" })}</Label>
                    <Select
                      value={profile.role ?? ""}
                      onValueChange={(value) => updateRole(profile, value)}
                      disabled={isBusy || isSelf}
                    >
                      <SelectTrigger>
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

                  {profile.banned ? (
                    <Button
                      variant="outline"
                      onClick={() => toggleActive(profile, true)}
                      disabled={isBusy || isSelf}
                    >
                      {togglingId === profile.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}
                      {t("superAdminProfiles.unbanAction", { defaultValue: "Reactivate" })}
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      onClick={() => setConfirmDeactivate(profile)}
                      disabled={isBusy || isSelf}
                    >
                      {togglingId === profile.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldOff className="h-4 w-4" />
                      )}
                      {t("superAdminProfiles.banAction", { defaultValue: "Deactivate" })}
                    </Button>
                  )}

                  {isSelf && (
                    <p className="text-xs text-muted-foreground">
                      {t("superAdminProfiles.selfRoleHint", {
                        defaultValue: "You can't change your own account here.",
                      })}
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
            {t("superAdminProfiles.prev", { defaultValue: "Prev" })}
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
            {t("superAdminProfiles.next", { defaultValue: "Next" })}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

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
