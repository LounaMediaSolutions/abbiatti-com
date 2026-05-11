import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Home, Users, ListTodo, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { WhatsAppReminders } from "@/components/WhatsAppReminders";
import { getUserAccess } from "@/lib/access";

const Dashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [stats, setStats] = useState({ properties: 0, team: 0, tasks: 0 });
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const { isAdmin, isCohost } = await getUserAccess(user.id);
      
      const { data: profile } = await supabase.from("profiles").select("full_name, org_id").eq("id", user.id).maybeSingle();
      
      let propsCount = 0;
      let teamCount = 0;
      let tasksCount = 0;

      if (isAdmin) {
        const [props, team, tasks] = await Promise.all([
          supabase.from("properties").select("*", { count: "exact", head: true }).eq("org_id", profile?.org_id),
          supabase.from("profiles").select("*", { count: "exact", head: true }).eq("org_id", profile?.org_id),
          supabase.from("tasks").select("*", { count: "exact", head: true }).eq("org_id", profile?.org_id)
        ]);
        propsCount = props.count ?? 0;
        teamCount = team.count ?? 0;
        tasksCount = tasks.count ?? 0;
      } else if (isCohost) {
        const { data: cohosts } = await supabase.from("property_cohosts").select("property_id").eq("user_id", user.id);
        const propIds = (cohosts ?? []).map(c => c.property_id);
        propsCount = propIds.length;
        
        if (propsCount > 0) {
          const { count: tasks } = await supabase.from("tasks").select("*", { count: "exact", head: true }).in("property_id", propIds);
          tasksCount = tasks ?? 0;
          
          // Count distinct users in property_cohosts for these properties
          const { data: cohostUsers } = await supabase.from("property_cohosts").select("user_id").in("property_id", propIds);
          const uniqueUsers = new Set((cohostUsers ?? []).map(c => c.user_id));
          teamCount = uniqueUsers.size;
        }
      }

      setName(profile?.full_name ?? "");
      setOrgId(profile?.org_id ?? null);
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
