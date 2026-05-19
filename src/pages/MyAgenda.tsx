import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { format, isToday, isTomorrow, parseISO, startOfDay } from "date-fns";
import { fr, enUS, arSA } from "date-fns/locale";
import {
  CalendarDays,
  MapPin,
  Clock,
  Play,
  Check,
  AlertTriangle,
  Camera,
  ListChecks,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TASK_TYPE_ICONS, TASK_TYPE_COLORS, type TaskType } from "@/lib/taskIcons";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { QRCheckInScanner } from "@/components/QRCheckInScanner";
import { CleaningChecklist } from "@/components/CleaningChecklist";
import { PHOTO_ACCEPT, validatePhotoFile } from "@/lib/photoUpload";

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

// Task types for which a cleaning checklist makes sense.
const CLEANING_LIKE: ReadonlySet<string> = new Set([
  "cleaning",
  "ménage",
  "menage",
  "housekeeping",
  "post_checkout_cleaning",
  "pre_arrival_cleaning",
]);

export default function MyAgenda() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<AgendaTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [expandedChecklist, setExpandedChecklist] = useState<string | null>(null);
  const [problemTask, setProblemTask] = useState<AgendaTask | null>(null);
  const [problemTitle, setProblemTitle] = useState("");
  const [problemDescription, setProblemDescription] = useState("");
  const [problemSubmitting, setProblemSubmitting] = useState(false);
  const [uploadingTaskId, setUploadingTaskId] = useState<string | null>(null);

  const locale = i18n.language === "fr" ? fr : i18n.language === "ar" ? arSA : enUS;

  async function load() {
    if (!user) return;
    setLoading(true);
    const [{ data: profile }, { data: tData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name,avatar_url,org_id")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("tasks")
        .select("id,title,type,status,due_at,property_id,guest_name")
        .eq("assigned_to", user.id)
        .neq("status", "done")
        .order("due_at", { ascending: true, nullsFirst: false }),
    ]);
    setName(profile?.full_name ?? "");
    setAvatar(profile?.avatar_url ?? null);
    setOrgId(profile?.org_id ?? null);

    const propIds = Array.from(
      new Set((tData ?? []).map((t) => t.property_id).filter(Boolean)),
    ) as string[];
    let propMap: Record<string, string> = {};
    if (propIds.length) {
      const { data: props } = await supabase
        .from("properties")
        .select("id,name")
        .in("id", propIds);
      propMap = Object.fromEntries((props ?? []).map((p) => [p.id, p.name]));
    }
    setTasks(
      (tData ?? []).map((t) => ({
        ...t,
        property_name: t.property_id ? propMap[t.property_id] : undefined,
      })) as AgendaTask[],
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [user?.id]);

  async function startTask(id: string) {
    const { error } = await supabase
      .from("tasks")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else load();
  }

  async function completeTask(id: string) {
    const { error } = await supabase
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else load();
  }

  async function uploadPhoto(task: AgendaTask, file: File) {
    if (!user || !orgId) {
      toast.error(t("agenda.uploadOrgMissing", "Could not determine your organisation"));
      return;
    }
    const validation = validatePhotoFile(file);
    if (!validation.ok) {
      toast.error(validation.error);
      return;
    }
    setUploadingTaskId(task.id);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${orgId}/${task.id}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("task-photos")
        .upload(path, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase.from("task_photos").insert({
        task_id: task.id,
        org_id: orgId,
        uploaded_by: user.id,
        storage_path: path,
        kind: "during",
      });
      if (insertError) throw insertError;
      toast.success(t("agenda.photoUploaded", "Photo uploaded"));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err ?? "Upload failed");
      toast.error(message);
    } finally {
      setUploadingTaskId(null);
    }
  }

  function openProblemDialog(task: AgendaTask) {
    setProblemTask(task);
    setProblemTitle(`${task.title} — ${t("agenda.anomaly", "anomalie")}`);
    setProblemDescription("");
  }

  function closeProblemDialog() {
    setProblemTask(null);
    setProblemTitle("");
    setProblemDescription("");
    setProblemSubmitting(false);
  }

  async function submitProblem() {
    if (!problemTask || !user || !orgId) return;
    if (!problemTitle.trim()) {
      toast.error(t("agenda.problemTitleRequired", "Title required"));
      return;
    }
    setProblemSubmitting(true);
    const { error } = await supabase.from("maintenance_tickets").insert({
      organization_id: orgId,
      property_id: problemTask.property_id,
      task_id: problemTask.id,
      title: problemTitle.trim(),
      description: problemDescription.trim() || null,
      status: "new",
      priority: "normal",
      reported_by: user.id,
    });
    if (error) {
      toast.error(error.message);
      setProblemSubmitting(false);
      return;
    }
    toast.success(t("agenda.problemReported", "Problem reported"));
    closeProblemDialog();
  }

  // Group by day
  const groups: Record<string, AgendaTask[]> = {};
  const noDate: AgendaTask[] = [];
  tasks.forEach((t) => {
    if (!t.due_at) {
      noDate.push(t);
      return;
    }
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

  function renderTaskActions(task: AgendaTask) {
    const isCleaning = CLEANING_LIKE.has(String(task.type ?? "").toLowerCase());
    const isExpanded = expandedChecklist === task.id;
    return (
      <>
        <div className="flex flex-wrap gap-2 pt-2">
          {task.status === "todo" && (
            <>
              <Button
                size="sm"
                data-testid="task-start-button"
                onClick={() => startTask(task.id)}
              >
                <Play className="h-4 w-4 mr-1" /> {t("agenda.start")}
              </Button>
              {task.property_id && (
                <QRCheckInScanner taskId={task.id} onCheckedIn={load} />
              )}
            </>
          )}
          {task.status === "in_progress" && (
            <Button
              size="sm"
              data-testid="task-done-button"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => completeTask(task.id)}
            >
              <Check className="h-4 w-4 mr-1" /> {t("agenda.done")}
            </Button>
          )}

          {/* Photo upload — available in todo and in_progress */}
          {task.status !== "done" && (
            <Button
              size="sm"
              variant="outline"
              data-testid="task-photo-button"
              disabled={uploadingTaskId === task.id}
              asChild
            >
              <label className="cursor-pointer">
                <Camera className="h-4 w-4 mr-1" />
                {uploadingTaskId === task.id
                  ? t("agenda.uploading", "Uploading…")
                  : t("agenda.addPhoto", "Photo")}
                <input
                  type="file"
                  accept={PHOTO_ACCEPT}
                  className="sr-only"
                  data-testid="task-photo-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadPhoto(task, f);
                    e.target.value = "";
                  }}
                />
              </label>
            </Button>
          )}

          {/* Report a problem — always available */}
          <Button
            size="sm"
            variant="outline"
            data-testid="task-report-problem-button"
            onClick={() => openProblemDialog(task)}
          >
            <AlertTriangle className="h-4 w-4 mr-1" />
            {t("agenda.reportProblem", "Report problem")}
          </Button>

          {/* Checklist toggle — only for cleaning-type tasks */}
          {isCleaning && (
            <Button
              size="sm"
              variant="outline"
              data-testid="task-checklist-toggle"
              onClick={() =>
                setExpandedChecklist(isExpanded ? null : task.id)
              }
            >
              <ListChecks className="h-4 w-4 mr-1" />
              {t("agenda.checklist", "Checklist")}
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 ml-1" />
              ) : (
                <ChevronDown className="h-4 w-4 ml-1" />
              )}
            </Button>
          )}
        </div>

        {isCleaning && isExpanded && orgId && (
          <div
            className="mt-3 rounded-lg border bg-muted/30 p-3"
            data-testid="task-checklist-panel"
          >
            <CleaningChecklist
              taskId={task.id}
              organizationId={orgId}
              canEdit={true}
            />
          </div>
        )}
      </>
    );
  }

  if (loading) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 border">
        {avatar ? (
          <img
            src={avatar}
            alt=""
            className="h-14 w-14 rounded-full object-cover border-2 border-foreground"
          />
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

      {sortedKeys.map((key) => (
        <div key={key} className="space-y-2">
          <div className="flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur py-2 z-10">
            <div className="h-8 w-1 rounded-full bg-primary" />
            <h2 className="text-lg font-bold capitalize">{dayLabel(key)}</h2>
            <Badge variant="secondary">{groups[key].length}</Badge>
          </div>
          {groups[key].map((task) => {
            const Icon = TASK_TYPE_ICONS[task.type] ?? TASK_TYPE_ICONS.other;
            const color =
              TASK_TYPE_COLORS[task.type] ?? TASK_TYPE_COLORS.other;
            const time = task.due_at
              ? format(parseISO(task.due_at), "HH:mm")
              : null;
            return (
              <Card key={task.id} className="p-4" data-testid="agenda-task-card">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "h-14 w-14 rounded-2xl flex items-center justify-center shrink-0",
                      color,
                    )}
                  >
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div
                        className="font-semibold truncate"
                        data-testid="agenda-task-title"
                      >
                        {task.title}
                      </div>
                      <Badge className={STATUS_COLORS[task.status]}>
                        {t(`tasks.status.${task.status}`)}
                      </Badge>
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
                    {renderTaskActions(task)}
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
          {noDate.map((task) => {
            const Icon = TASK_TYPE_ICONS[task.type] ?? TASK_TYPE_ICONS.other;
            const color =
              TASK_TYPE_COLORS[task.type] ?? TASK_TYPE_COLORS.other;
            return (
              <Card
                key={task.id}
                className="p-4"
                data-testid="agenda-task-card"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
                      color,
                    )}
                  >
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div
                      className="font-medium"
                      data-testid="agenda-task-title"
                    >
                      {task.title}
                    </div>
                    {task.property_name && (
                      <div className="text-xs text-muted-foreground">
                        {task.property_name}
                      </div>
                    )}
                    {renderTaskActions(task)}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Report-a-problem dialog */}
      <Dialog
        open={problemTask !== null}
        onOpenChange={(open) => {
          if (!open) closeProblemDialog();
        }}
      >
        <DialogContent data-testid="report-problem-dialog">
          <DialogHeader>
            <DialogTitle>
              {t("agenda.reportProblemTitle", "Report a problem")}
            </DialogTitle>
            <DialogDescription>
              {problemTask?.title}
              {problemTask?.property_name ? ` · ${problemTask.property_name}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="problem-title">
                {t("agenda.problemTitle", "Title")}
              </Label>
              <Input
                id="problem-title"
                data-testid="problem-title-input"
                value={problemTitle}
                onChange={(e) => setProblemTitle(e.target.value)}
                placeholder={t(
                  "agenda.problemTitlePlaceholder",
                  "Kitchen sink leaking",
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="problem-description">
                {t("agenda.problemDescription", "Description")}
              </Label>
              <Textarea
                id="problem-description"
                data-testid="problem-description-input"
                rows={4}
                value={problemDescription}
                onChange={(e) => setProblemDescription(e.target.value)}
                placeholder={t(
                  "agenda.problemDescriptionPlaceholder",
                  "Optional: what did you notice?",
                )}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeProblemDialog}
              disabled={problemSubmitting}
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              data-testid="problem-submit-button"
              onClick={submitProblem}
              disabled={problemSubmitting}
            >
              {problemSubmitting
                ? t("common.saving", "Saving…")
                : t("agenda.problemSubmit", "Report")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
