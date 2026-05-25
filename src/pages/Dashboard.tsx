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
          .select("full_name, org_id, pending_org_id")
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
          const { data: orgProps } = await supabase
            .from("properties")
            .select("id, name, city, country, submitted_by")
            .eq("org_id", effectiveOrgId)
            .order("name");
          visibleProperties = (orgProps ?? []) as DashboardProperty[];
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
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-secondary">{t("dashboard.title")}</h1>
        <p className="text-muted-foreground">{t("dashboard.welcome", { name: name || user?.email })}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5 shadow-card">
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${c.color} mb-3`}>
              <c.icon className="h-5 w-5" />
            </div>
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="text-3xl font-bold text-secondary">{c.value}</p>
          </Card>
        ))}
      </div>

      <WhatsAppReminders orgId={orgId} />

      <Card className="p-5 shadow-card">
        <div className="flex items-center justify-between gap-3 mb-3">
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
          <Button asChild variant="outline" size="sm">
            <Link to="/properties">
              {t("dashboard.viewAllProperties", { defaultValue: "Open properties" })}
            </Link>
          </Button>
        </div>

        {properties.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {t("dashboard.noAssignedProperties", {
              defaultValue: "No properties are assigned to this account yet.",
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {properties.map((property) => (
              <Link
                key={property.id}
                to={`/properties/${property.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="font-medium text-secondary truncate">{property.name}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="h-4 w-4 shrink-0" />
                    {[property.city, property.country].filter(Boolean).join(", ") ||
                      t("properties.locationUnknown", { defaultValue: "Location not set" })}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5 shadow-card">
        <h2 className="font-semibold text-secondary mb-3">{t("dashboard.quickActions")}</h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/properties">
              <Plus className="h-4 w-4 mr-2" />
              {t("dashboard.addProperty")}
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;
