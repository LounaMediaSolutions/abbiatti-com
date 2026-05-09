import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { format, isToday, isTomorrow, parseISO, startOfDay } from "date-fns";
import { fr, enUS, arSA } from "date-fns/locale";
import { CalendarDays, MapPin, Clock, Play, Check, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TASK_TYPE_ICONS, TASK_TYPE_COLORS, type TaskType } from "@/lib/taskIcons";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { QRCheckInScanner } from "@/components/QRCheckInScanner";

interface AgendaTask {
  id: string;
  title: string;
  type: TaskType;
  status: "todo" | "in_progress" | "done" | "issue";
  due_at: string | null;
  property_id: string | null;
  property_name?: string;
  guest_name: string | null;
}

const STATUS_COLORS = {
  todo: "bg-muted text-foreground",
  in_progress: "bg-amber-500 text-white",
  done: "bg-emerald-500 text-white",
  issue: "bg-destructive text-destructive-foreground",
};

export default function MyAgenda() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<AgendaTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);

  const locale = i18n.language === "fr" ? fr : i18n.language === "ar" ? arSA : enUS;

  async function load() {
    if (!user) return;
    setLoading(true);
    const [{ data: profile }, { data: tData }] = await Promise.all([
      supabase.from("profiles").select("full_name,avatar_url").eq("id", user.id).maybeSingle(),
      supabase
        .from("tasks")
        .select("id,title,type,status,due_at,property_id,guest_name")
        .eq("assigned_to", user.id)
        .neq("status", "done")
        .order("due_at", { ascending: true, nullsFirst: false }),
    ]);
    setName(profile?.full_name ?? "");
    setAvatar(profile?.avatar_url ?? null);

    const propIds = Array.from(new Set((tData ?? []).map(t => t.property_id).filter(Boolean))) as string[];
    let propMap: Record<string, string> = {};
    if (propIds.length) {
      const { data: props } = await supabase.from("properties").select("id,name").in("id", propIds);
      propMap = Object.fromEntries((props ?? []).map(p => [p.id, p.name]));
    }
    setTasks((tData ?? []).map(t => ({ ...t, property_name: t.property_id ? propMap[t.property_id] : undefined })) as AgendaTask[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [user?.id]);

  async function startTask(id: string) {
    const { error } = await supabase.from("tasks").update({ status: "in_progress", started_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else load();
  }
  async function completeTask(id: string) {
    const { error } = await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else load();
  }

  // Group by day
  const groups: Record<string, AgendaTask[]> = {};
  const noDate: AgendaTask[] = [];
  tasks.forEach(t => {
    if (!t.due_at) { noDate.push(t); return; }
    const key = format(startOfDay(parseISO(t.due_at)), "yyyy-MM-dd");
    (groups[key] ||= []).push(t);
  });
  const sortedKeys = Object.keys(groups).sort();

  function dayLabel(dateStr: string) {
    const d = parseISO(dateStr);
    if (isToday(d)) return t("agenda.today");
    if (isTomorrow(d)) return t("agenda.tomorrow");
    return format(d, "EEEE d MMMM", { locale });
  }

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">{t("common.loading")}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 border">
        {avatar ? (
          <img src={avatar} alt="" className="h-14 w-14 rounded-full object-cover border-2 border-foreground" />
        ) : (
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-2xl border-2 border-foreground">
            👤
          </div>
        )}
        <div>
          <div className="text-xs text-muted-foreground">{t("agenda.hello")}</div>
          <div className="text-lg font-bold">{name || user?.email}</div>
        </div>
      </div>

      <h1 className="text-2xl font-bold flex items-center gap-2">
        <CalendarDays className="h-6 w-6" />
        {t("agenda.title")}
      </h1>

      {tasks.length === 0 && (
        <Card className="p-8 text-center">
          <div className="text-6xl mb-3">🎉</div>
          <p className="text-lg font-medium">{t("agenda.empty")}</p>
        </Card>
      )}

      {sortedKeys.map(key => (
        <div key={key} className="space-y-2">
          <div className="flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur py-2 z-10">
            <div className="h-8 w-1 rounded-full bg-primary" />
            <h2 className="text-lg font-bold capitalize">{dayLabel(key)}</h2>
            <Badge variant="secondary">{groups[key].length}</Badge>
          </div>
          {groups[key].map(task => {
            const Icon = TASK_TYPE_ICONS[task.type] ?? TASK_TYPE_ICONS.other;
            const color = TASK_TYPE_COLORS[task.type] ?? TASK_TYPE_COLORS.other;
            const time = task.due_at ? format(parseISO(task.due_at), "HH:mm") : null;
            return (
              <Card key={task.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center shrink-0", color)}>
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="font-semibold truncate">{task.title}</div>
                      <Badge className={STATUS_COLORS[task.status]}>{t(`tasks.status.${task.status}`)}</Badge>
                    </div>
                    {time && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" /> {time}
                      </div>
                    )}
                    {task.property_name && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" /> {task.property_name}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-2">
                      {task.status === "todo" && (
                        <>
                          <Button size="sm" onClick={() => startTask(task.id)}>
                            <Play className="h-4 w-4 mr-1" /> {t("agenda.start")}
                          </Button>
                          {task.property_id && <QRCheckInScanner taskId={task.id} onCheckedIn={load} />}
                        </>
                      )}
                      {task.status === "in_progress" && (
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => completeTask(task.id)}>
                          <Check className="h-4 w-4 mr-1" /> {t("agenda.done")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ))}

      {noDate.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 py-2">
            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-bold">{t("agenda.noDate")}</h2>
          </div>
          {noDate.map(task => {
            const Icon = TASK_TYPE_ICONS[task.type] ?? TASK_TYPE_ICONS.other;
            const color = TASK_TYPE_COLORS[task.type] ?? TASK_TYPE_COLORS.other;
            return (
              <Card key={task.id} className="p-4 flex items-center gap-3">
                <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center shrink-0", color)}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{task.title}</div>
                  {task.property_name && <div className="text-xs text-muted-foreground">{task.property_name}</div>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
