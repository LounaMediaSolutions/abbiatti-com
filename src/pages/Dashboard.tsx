import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight, Home, ListTodo, MapPin, Plus, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

const Dashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [stats, setStats] = useState({ properties: 0, team: 0, tasks: 0 });
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [properties, setProperties] = useState<DashboardProperty[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!user) {
        setStats({ properties: 0, team: 0, tasks: 0 });
        setName("");
        setOrgId(null);
        setProperties([]);
        return;
      }
      const [access, profileRes] = await Promise.all([
        getUserAccess(user.id),
        supabase
          .from("profiles")
          .select("full_name, org_id, pending_org_id, role, invitation_status")
          .eq("id", user.id)
          .maybeSingle(),
      ]);
      const profile = profileRes.data;

      // ─── TEMP DEBUG ─── remove once the admin-properties bug is resolved.
      // Logs the live state we use to decide what shows on the dashboard.
      console.log("[DASHBOARD DEBUG] user.id:", user.id);
      console.log("[DASHBOARD DEBUG] user.email:", user.email);
      console.log("[DASHBOARD DEBUG] profile row:", profile);
      console.log("[DASHBOARD DEBUG] access:", access);

      // What does the user actually have visibility into right now? This query
      // hits the same RLS as the org-scoped one below — if it returns rows but
      // the org-scoped one returns 0, we know the org_id values don't match.
      const allVisible = await supabase
        .from("properties")
        .select("id, name, org_id, submitted_by");
      console.log("[DASHBOARD DEBUG] properties visible via RLS (no filter):", allVisible.data);
      console.log("[DASHBOARD DEBUG] properties visible via RLS - error:", allVisible.error);

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
        console.log("[DASHBOARD DEBUG] effectiveOrgId used for admin query:", effectiveOrgId);
        if (effectiveOrgId) {
          const orgResult = await supabase
            .from("properties")
            .select("id, name, city, country, submitted_by, org_id")
            .eq("org_id", effectiveOrgId)
            .order("name");
          console.log("[DASHBOARD DEBUG] org-scoped properties result:", orgResult);
          visibleProperties = (orgResult.data ?? []) as DashboardProperty[];
        } else {
          console.log("[DASHBOARD DEBUG] effectiveOrgId is null → admin sees nothing.");
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

      setName(profile?.full_name ?? "");
      setOrgId(profile?.org_id ?? profile?.pending_org_id ?? null);
      setProperties(visibleProperties);
      setStats({ properties: propsCount, team: teamCount, tasks: tasksCount });
    };
    load();
  }, [user]);

  const cards = [
    { icon: Home, label: t("dashboard.stats.properties"), value: stats.properties, color: "bg-primary/10 text-primary" },
    { icon: Users, label: t("dashboard.stats.team"), value: stats.team, color: "bg-accent/10 text-accent" },
    { icon: ListTodo, label: t("dashboard.stats.tasks"), value: stats.tasks, color: "bg-warning/10 text-warning" },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page header — title + primary CTA. Consolidates the old bottom Quick
          Actions card into a single, more discoverable spot. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("dashboard.eyebrow", { defaultValue: "Workspace" })}
          </p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-secondary">
            {t("dashboard.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("dashboard.welcome", { name: name || user?.email })}
          </p>
        </div>
        <Button asChild className="shrink-0 cursor-pointer">
          <Link to="/properties">
            <Plus className="h-4 w-4 mr-2" />
            {t("dashboard.addProperty")}
          </Link>
        </Button>
      </div>

      {/* KPI strip — bordered cards with subtle hover lift */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Card
            key={c.label}
            className={cn(
              "p-5 border border-border/60 shadow-sm",
              "transition-all duration-200",
              "hover:border-primary/30 hover:shadow-md",
            )}
          >
            <div
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-lg",
                c.color,
              )}
            >
              <c.icon className="h-5 w-5" />
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {c.label}
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-secondary tabular-nums">
              {c.value}
            </p>
          </Card>
        ))}
      </div>

      <WhatsAppReminders orgId={orgId} />

      {/* Assigned properties — list-as-cards */}
      <Card className="p-5 border border-border/60 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="font-semibold text-secondary">
              {t("dashboard.assignedProperties", { defaultValue: "Assigned properties" })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("dashboard.assignedPropertiesHint", {
                defaultValue: "Properties currently visible in your dashboard.",
              })}
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0 cursor-pointer">
            <Link to="/properties">
              {t("dashboard.viewAllProperties", { defaultValue: "Open properties" })}
            </Link>
          </Button>
        </div>

        {properties.length === 0 ? (
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
                  "transition-colors duration-200 cursor-pointer",
                  "hover:border-primary/30 hover:bg-muted/40",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
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
