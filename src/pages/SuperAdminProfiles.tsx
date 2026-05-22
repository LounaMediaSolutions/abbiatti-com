import { useEffect, useMemo, useState } from "react";
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
import { toast } from "@/hooks/use-toast";

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
};

type ProfileItem = ProfileRow & {
  effectiveRole: string | null;
  organizationName: string | null;
  scope: Scope;
  banned: boolean;
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

export default function SuperAdminProfiles() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [isSuper, setIsSuper] = useState<boolean | null>(null);

  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [fetching, setFetching] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const [savingId, setSavingId] = useState<string | null>(null);
  const [banningId, setBanningId] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState<ProfileItem | null>(null);
  // Full organization list so a super-admin can move a user to any org.
  const [allOrgs, setAllOrgs] = useState<{ id: string; name: string }[]>([]);

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
          "id, full_name, email, phone, avatar_url, org_id, role, active",
          { count: "exact" },
        )
        .order("created_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true });

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
  }, [isSuper, page, pageSize, statusFilter, searchQuery]);

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
            <Shield className="h-6 w-6 text-primary" />
            {t("superAdminProfiles.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("superAdminProfiles.subtitle")}
          </p>
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
          const isBusy = savingId === profile.id || banningId === profile.id;
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
                        {getRoleOptions(profile.scope).map((role) => (
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
    </div>
  );
}
