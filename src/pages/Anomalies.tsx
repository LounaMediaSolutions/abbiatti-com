import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, Wrench, MessageSquare, Calendar, ExternalLink } from "lucide-react";

interface Anomaly {
  id: string;
  severity: "high" | "medium" | "low";
  type: "task_overdue" | "ticket_open" | "message_unanswered" | "no_cleaning" | "reservation_conflict";
  title: string;
  detail: string;
  link?: string;
  property?: string;
  ageHours?: number;
}

const TYPE_ICON = {
  task_overdue: Clock,
  ticket_open: Wrench,
  message_unanswered: MessageSquare,
  no_cleaning: Calendar,
  reservation_conflict: Calendar,
};

const SEVERITY_COLOR = {
  high: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  low: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
};

const MESSAGE_THRESHOLD_H = 4;
const TICKET_THRESHOLD_H = 48;

export default function Anomalies() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
      const orgId = profile?.org_id;
      if (!orgId) { setLoading(false); return; }

      const myRole = profile?.role;
      const isAdminLike = myRole === "admin" || myRole === "co_admin" || myRole === "super_admin";
      setAllowed(isAdminLike);
      if (!isAdminLike) { setLoading(false); return; }

      const now = Date.now();
      const result: Anomaly[] = [];

      // Properties map
      const { data: props } = await supabase.from("properties").select("id,name").eq("org_id", orgId);
      const propMap: Record<string, string> = {};
      (props ?? []).forEach(p => { propMap[p.id] = p.name; });

      // 1. Overdue tasks
      const { data: tasks } = await supabase.from("tasks").select("id,title,due_at,status,property_id,assigned_to").eq("org_id", orgId).in("status", ["todo", "in_progress"]).not("due_at", "is", null);
      (tasks ?? []).forEach(t => {
        const due = new Date(t.due_at!).getTime();
        if (due < now) {
          const ageH = Math.round((now - due) / 3600000);
          result.push({
            id: `task-${t.id}`,
            severity: ageH > 24 ? "high" : ageH > 6 ? "medium" : "low",
            type: "task_overdue",
            title: t.title,
            detail: `En retard de ${ageH < 24 ? `${ageH}h` : `${Math.round(ageH / 24)}j`}`,
            link: "/tasks",
            property: t.property_id ? propMap[t.property_id] : undefined,
            ageHours: ageH,
          });
        }
      });

      // 2. Unresolved maintenance tasks older than threshold
      const { data: tickets } = await supabase.from("tasks").select("id,title,created_at,completed_at,property_id,priority").eq("org_id", orgId).eq("type", "maintenance").is("completed_at", null);
      (tickets ?? []).forEach(t => {
        const ageH = Math.round((now - new Date(t.created_at!).getTime()) / 3600000);
        if (ageH > TICKET_THRESHOLD_H || t.priority >= 4) {
          result.push({
            id: `ticket-${t.id}`,
            severity: t.priority >= 4 || ageH > 168 ? "high" : ageH > 72 ? "medium" : "low",
            type: "ticket_open",
            title: t.title,
            detail: `Ouvert depuis ${ageH < 24 ? `${ageH}h` : `${Math.round(ageH / 24)}j`}`,
            link: "/tasks",
            property: t.property_id ? propMap[t.property_id] : undefined,
            ageHours: ageH,
          });
        }
      });

      // 3. Unanswered guest messages (Removed as guest_messages table no longer exists)
      // Implementation pending re-addition of messaging functionality.

      // 4. Reservations check-in within 48h with no cleaning task
      const in48h = new Date(now + 48 * 3600000).toISOString().split("T")[0];
      const today = new Date(now).toISOString().split("T")[0];
      const { data: upcoming } = await supabase.from("bookings").select("id,guest_name,checkin,property_id,status").eq("org_id", orgId).gte("checkin", today).lte("checkin", in48h).neq("status", "cancelled");
      const { data: upcomingTasks } = await supabase.from("tasks").select("id,property_id,due_at,type").eq("org_id", orgId).eq("type", "cleaning").gte("due_at", new Date(now - 86400000).toISOString());
      (upcoming ?? []).forEach(r => {
        const hasCleaning = (upcomingTasks ?? []).some(t =>
          t.property_id === r.property_id &&
          t.due_at && new Date(t.due_at).getTime() <= new Date(r.checkin!).getTime() + 86400000
        );
        if (!hasCleaning) {
          const hoursUntil = Math.round((new Date(r.checkin!).getTime() - now) / 3600000);
          result.push({
            id: `nocleaning-${r.id}`,
            severity: hoursUntil < 24 ? "high" : "medium",
            type: "no_cleaning",
            title: `Aucun ménage planifié avant ${r.guest_name || "check-in"}`,
            detail: `Check-in dans ${hoursUntil}h`,
            link: "/tasks",
            property: r.property_id ? propMap[r.property_id] : undefined,
            ageHours: -hoursUntil,
          });
        }
      });

      // 5. Reservation overlaps (same property, overlapping dates, not cancelled)
      const { data: allRes } = await supabase.from("bookings").select("id,property_id,checkin,checkout,guest_name,status").eq("org_id", orgId).neq("status", "cancelled").gte("checkout", today);
      const byProp: Record<string, any[]> = {};
      (allRes ?? []).forEach(r => { (byProp[r.property_id!] ||= []).push(r); });
      Object.values(byProp).forEach(list => {
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const a = list[i], b = list[j];
            if (a.checkin && a.checkout && b.checkin && b.checkout) {
              if (new Date(a.checkin) < new Date(b.checkout) && new Date(b.checkin) < new Date(a.checkout)) {
                result.push({
                  id: `conflict-${a.id}-${b.id}`,
                  severity: "high",
                  type: "reservation_conflict",
                  title: `Conflit: ${a.guest_name || "?"} ↔ ${b.guest_name || "?"}`,
                  detail: `${a.checkin} → ${a.checkout} chevauche ${b.checkin} → ${b.checkout}`,
                  link: "/reservations",
                  property: propMap[a.property_id!],
                });
              }
            }
          }
        }
      });

      // Sort: high → medium → low, then by age desc
      const sevOrder = { high: 0, medium: 1, low: 2 };
      result.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || (b.ageHours ?? 0) - (a.ageHours ?? 0));
      setAnomalies(result);
      setLoading(false);
    })();
  }, [user?.id]);

  if (loading) return <div className="p-6">Chargement…</div>;
  if (!allowed) return <div className="p-6 text-muted-foreground">Réservé aux administrateurs et co-admins.</div>;

  const filtered = filter === "all" ? anomalies : anomalies.filter(a => a.severity === filter);
  const counts = {
    high: anomalies.filter(a => a.severity === "high").length,
    medium: anomalies.filter(a => a.severity === "medium").length,
    low: anomalies.filter(a => a.severity === "low").length,
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" /> Anomalies
          </h1>
          <p className="text-sm text-muted-foreground">Problèmes détectés automatiquement à résoudre par les co-admins.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>Tout ({anomalies.length})</Button>
          <Button size="sm" variant={filter === "high" ? "default" : "outline"} onClick={() => setFilter("high")} className={filter === "high" ? "bg-red-500 hover:bg-red-600" : ""}>Critique ({counts.high})</Button>
          <Button size="sm" variant={filter === "medium" ? "default" : "outline"} onClick={() => setFilter("medium")}>Moyen ({counts.medium})</Button>
          <Button size="sm" variant={filter === "low" ? "default" : "outline"} onClick={() => setFilter("low")}>Faible ({counts.low})</Button>
        </div>
      </div>

      {anomalies.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-5xl mb-3">🎉</div>
            <p className="text-lg font-medium">Aucune anomalie détectée</p>
            <p className="text-sm text-muted-foreground mt-1">Tout fonctionne normalement.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => {
            const Icon = TYPE_ICON[a.type];
            return (
              <Card key={a.id} className={`border-l-4 ${SEVERITY_COLOR[a.severity].split(" ").find(c => c.startsWith("border-")) ?? ""}`}>
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={`p-2 rounded-md ${SEVERITY_COLOR[a.severity]}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{a.title}</span>
                        <Badge variant="outline" className={SEVERITY_COLOR[a.severity]}>{a.severity}</Badge>
                        {a.property && <Badge variant="secondary" className="text-[10px]">{a.property}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.detail}</p>
                    </div>
                  </div>
                  {a.link && (
                    <Button asChild size="sm" variant="outline">
                      <Link to={a.link}>Résoudre <ExternalLink className="h-3.5 w-3.5 ml-1" /></Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
