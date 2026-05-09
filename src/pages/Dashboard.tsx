import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Home, Users, ListTodo, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { WhatsAppReminders } from "@/components/WhatsAppReminders";

const Dashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [stats, setStats] = useState({ properties: 0, team: 0, tasks: 0 });
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const [{ data: profile }, { count: propsCount }, { count: teamCount }] = await Promise.all([
        supabase.from("profiles").select("full_name, organization_id").eq("id", user.id).maybeSingle(),
        supabase.from("properties").select("*", { count: "exact", head: true }),
        supabase.from("user_roles").select("*", { count: "exact", head: true }),
      ]);
      setName(profile?.full_name ?? "");
      setOrgId((profile as any)?.organization_id ?? null);
      setStats({ properties: propsCount ?? 0, team: teamCount ?? 0, tasks: 0 });
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
