import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, Home, ListTodo, MapPin, Plus, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { WhatsAppReminders } from "@/components/WhatsAppReminders";
import { getUserAccess } from "@/lib/access";
import { cn } from "@/lib/utils";

type DashboardProperty = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  submitted_by: string | null;
};

type DashboardData = {
  stats: { properties: number; team: number; tasks: number };
  name: string;
  orgId: string | null;
  properties: DashboardProperty[];
};

const EMPTY_DASHBOARD: DashboardData = {
  stats: { properties: 0, team: 0, tasks: 0 },
  name: "",
  orgId: null,
  properties: [],
};

const Dashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const {
    data = EMPTY_DASHBOARD,
    isPending: loading,
    error,
  } = useQuery<DashboardData>({
    queryKey: ["dashboard", user?.id ?? null],
    enabled: !!user,
    // 5s of "fresh" — long enough that rapid tab-switching (back / forward)
    // feels instant, short enough that a stat tile or property card never
    // lies for more than a few seconds after the user edits something on a
    // neighbouring page. Mutations on Properties also invalidate this query
    // explicitly (see Properties.tsx), so the common create/delete cases
    // refresh immediately rather than waiting on staleness.
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!user) return EMPTY_DASHBOARD;

      const [access, profileRes] = await Promise.all([
        getUserAccess(user.id),
        supabase
          .from("profiles")
          .select("full_name, org_id, pending_org_id, role, invitation_status")
          .eq("id", user.id)
          .maybeSingle(),
      ]);
      const profile = profileRes.data;

      let propsCount = 0;
      let teamCount = 0;
      let tasksCount = 0;
      let visibleProperties: DashboardProperty[] = [];

      // Determine which properties are visible on this dashboard.
      //   - Admins / co-admins: every property in their organization
      //     (org-scoped, per the role map). `org_id` is the user's real org;
      //     fall back to `pending_org_id` while their org is being set up.
      //   - Cohosts: only the properties assigned to them — via
      //     property_members or property_cohosts — plus any they created.
      if (access.isAdmin) {
        const effectiveOrgId =
          profile?.org_id ?? profile?.pending_org_id ?? null;
        if (effectiveOrgId) {
          const orgResult = await supabase
            .from("properties")
            .select("id, name, city, country, submitted_by, org_id")
            .eq("org_id", effectiveOrgId)
            .order("name");
          visibleProperties = (orgResult.data ?? []) as DashboardProperty[];
        }
      } else if (access.isCohost) {
        const [membersRes, cohostsRes, createdRes] = await Promise.all([
          supabase.from("property_members").select("property_id").eq("user_id", user.id),
          supabase.from("property_cohosts").select("property_id").eq("user_id", user.id),
          supabase
            .from("properties")
            .select("id, name, city, country, submitted_by")
            .eq("submitted_by", user.id),
        ]);

        const propertyIds = new Set<string>();
        ((membersRes.data ?? []) as { property_id: string }[]).forEach((row) =>
          propertyIds.add(row.property_id),
        );
        ((cohostsRes.data ?? []) as { property_id: string }[]).forEach((row) =>
          propertyIds.add(row.property_id),
        );
        ((createdRes.data ?? []) as DashboardProperty[]).forEach((property) =>
          propertyIds.add(property.id),
        );

        if (propertyIds.size > 0) {
          const propIds = Array.from(propertyIds);
          const { data: propsData } = await supabase
            .from("properties")
            .select("id, name, city, country, submitted_by")
            .in("id", propIds)
            .order("name");
          visibleProperties = (propsData ?? []) as DashboardProperty[];
        }
      }

      // Aggregate the stat cards from the visible property set (works for both
      // admins and cohosts, so the numbers always match the list below).
      if (visibleProperties.length > 0) {
        const propIds = visibleProperties.map((p) => p.id);
        const [tasksRes, memberUsersRes, cohostUsersRes] = await Promise.all([
          supabase
            .from("tasks")
            .select("*", { count: "exact", head: true })
            .in("property_id", propIds),
          supabase
            .from("property_members")
            .select("user_id")
            .in("property_id", propIds),
          supabase
            .from("property_cohosts")
            .select("user_id")
            .in("property_id", propIds),
        ]);

        propsCount = visibleProperties.length;
        tasksCount = tasksRes.count ?? 0;
        const uniqueUsers = new Set<string>();
        ((memberUsersRes.data ?? []) as { user_id: string }[]).forEach((row) =>
          uniqueUsers.add(row.user_id),
        );
        ((cohostUsersRes.data ?? []) as { user_id: string }[]).forEach((row) =>
          uniqueUsers.add(row.user_id),
        );
        teamCount = uniqueUsers.size;
      }

      return {
        stats: { properties: propsCount, team: teamCount, tasks: tasksCount },
        name: profile?.full_name ?? "",
        orgId: profile?.org_id ?? profile?.pending_org_id ?? null,
        properties: visibleProperties,
      };
    },
  });

  const { stats, name, orgId, properties } = data;
  const loadError = error
    ? error instanceof Error
      ? error.message
      : String(error)
    : null;

  const cards = [
    { icon: Home, label: t("dashboard.stats.properties"), value: stats.properties, color: "bg-primary/10 text-primary" },
    { icon: Users, label: t("dashboard.stats.team"), value: stats.team, color: "bg-accent/10 text-accent" },
    { icon: ListTodo, label: t("dashboard.stats.tasks"), value: stats.tasks, color: "bg-warning/10 text-warning" },
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-secondary text-balance">
            {t("dashboard.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("dashboard.welcome", { name: name || user?.email })}
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link to="/properties?new=1">
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            {t("dashboard.addProperty")}
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-busy={loading}>
        {loading
          ? cards.map((c) => (
              <Card key={c.label} className="p-5 border border-border/60 shadow-card">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <Skeleton className="mt-5 h-4 w-24" />
                <Skeleton className="mt-2 h-9 w-16" />
              </Card>
            ))
          : cards.map((c) => (
              <Card
                key={c.label}
                className={cn(
                  "p-5 border border-border/60 shadow-card",
                  "transition-colors duration-200 motion-reduce:transition-none",
                  "hover:border-gold/40",
                )}
              >
                <div
                  className={cn(
                    "inline-flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-inset ring-border/40",
                    c.color,
                  )}
                >
                  <c.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="mt-5 text-sm font-medium text-muted-foreground">
                  {c.label}
                </p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-secondary tabular-nums">
                  {/* On a load error the counts are not real zeros — show a
                      neutral dash so the tiles don't assert "0 properties". */}
                  {loadError ? "—" : c.value}
                </p>
              </Card>
            ))}
      </div>

      <WhatsAppReminders orgId={orgId} />

      <Card className="p-5 border border-border/60 shadow-card sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-secondary text-balance">
              {t("dashboard.assignedProperties", { defaultValue: "Assigned properties" })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("dashboard.assignedPropertiesHint", {
                defaultValue: "Properties currently visible in your dashboard.",
              })}
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link to="/properties">
              {t("dashboard.viewAllProperties", { defaultValue: "Open properties" })}
            </Link>
          </Button>
        </div>

        {loadError ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
            <div>
              <p className="font-medium text-secondary">
                {t("dashboard.loadErrorTitle", { defaultValue: "Couldn't load your properties" })}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {t("dashboard.loadErrorBody", {
                  defaultValue: "Check your connection and try again.",
                })}
              </p>
            </div>
          </div>
        ) : loading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-4"
              >
                <div className="flex min-w-0 items-center gap-3 flex-1">
                  <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : properties.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <Home className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-secondary">
              {t("dashboard.noAssignedPropertiesTitle", {
                defaultValue: "No properties yet",
              })}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("dashboard.noAssignedProperties", {
                defaultValue: "No properties are assigned to this account yet.",
              })}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {properties.map((property) => (
              <Link
                key={property.id}
                to={`/properties/${property.id}`}
                className={cn(
                  "group flex items-center justify-between gap-3 rounded-xl border border-border/60 p-4",
                  "transition-colors duration-200 motion-reduce:transition-none",
                  "hover:border-gold/40 hover:bg-muted/40",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-border/40">
                    <Home className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-secondary truncate">{property.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {[property.city, property.country].filter(Boolean).join(", ") ||
                        t("properties.locationUnknown", { defaultValue: "Location not set" })}
                    </p>
                  </div>
                </div>
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default Dashboard;
