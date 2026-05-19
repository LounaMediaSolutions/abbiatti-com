import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Camera, Play, Check, AlertTriangle, Trash2, Star, ImageIcon, X, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { PHOTO_ACCEPT, validatePhotoFile } from "@/lib/photoUpload";
import { cn } from "@/lib/utils";
import { TASK_TYPES, TASK_TYPE_ICONS, TASK_TYPE_COLORS, type TaskType } from "@/lib/taskIcons";
import { CleaningChecklist } from "@/components/CleaningChecklist";
import { getUserAccess } from "@/lib/access";

type TaskStatus = "todo" | "in_progress" | "done" | "issue";
type PhotoKind = "before" | "during" | "after" | "issue";

interface Task {
  id: string;
  org_id: string;
  property_id: string | null;
  assigned_to: string | null;
  // Some deployments expose a `created_by` column, others only `assigned_by`.
  // Keep both optional so the UI can fall back gracefully.
  created_by?: string | null;
  assigned_by?: string | null;
  title: string;
  type: TaskType;
  status: TaskStatus;
  priority: number;
  due_at: string | null;
  guest_name: string | null;
  guest_rating: number | null;
  guest_comment: string | null;
  staff_notes: string | null;
  issue_description: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

// Helper so we don't have to remember the column name in two places.
const isTaskAuthor = (task: { created_by?: string | null; assigned_by?: string | null }, userId?: string | null) =>
  Boolean(userId) && (task.created_by === userId || task.assigned_by === userId);

// Columns that the live database may not actually have. We try the insert
// with all of them, and if the schema cache complains about a specific one,
// we drop it and retry. This keeps the frontend resilient to the gap between
// the local migrations and the deployed schema.
const TASK_INSERT_OPTIONAL_COLUMNS = [
  "created_by",
  "assigned_by",
  "type",
  "task_type",
  "due_at",
  "scheduled_date",
  "scheduled_time",
  "organization_id",
  "org_id",
] as const;

const extractMissingTaskColumn = (error: { message?: string } | null) => {
  const message = error?.message ?? "";
  const schemaCacheMatch = message.match(/'([^']+)' column of 'tasks'/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];
  const postgresMatch = message.match(/column tasks\.([a-z_]+)/i);
  return postgresMatch?.[1] ?? null;
};

const insertTaskWithSchemaFallback = async (
  initialPayload: Record<string, unknown>,
) => {
  let payload = { ...initialPayload };
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await supabase.from("tasks").insert([payload] as any);
    if (!result.error) return { error: null as null };

    const missingColumn = extractMissingTaskColumn(result.error);
    if (!missingColumn || !(missingColumn in payload)) {
      return { error: result.error };
    }
    delete payload[missingColumn];
  }
  return { error: new Error("Could not reconcile the task payload with the current schema.") };
};

interface Property { id: string; name: string; }
interface Member { id: string; full_name: string | null; }
interface TaskPhoto {
  id: string; task_id: string; storage_path: string; kind: PhotoKind; uploaded_by: string; created_at: string;
}

const STATUS_VARIANTS: Record<TaskStatus, string> = {
  todo: "bg-muted text-foreground",
  in_progress: "bg-amber-500 text-white",
  done: "bg-emerald-500 text-white",
  issue: "bg-destructive text-destructive-foreground",
};

const VALID_TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "issue"];
const VALID_TASK_TYPES = TASK_TYPES as readonly TaskType[];

// The live database splits some columns differently from what this UI expects
// (e.g. `task_type` instead of `type`, `scheduled_date` instead of `due_at`).
// Normalize every row coming out of Supabase so the rest of the component can
// keep using the historical field names.
const normalizeTaskRow = (row: any): Task => {
  const type = (VALID_TASK_TYPES.includes(row?.type) ? row.type : VALID_TASK_TYPES.includes(row?.task_type) ? row.task_type : "other") as TaskType;
  const status = (VALID_TASK_STATUSES.includes(row?.status) ? row.status : "todo") as TaskStatus;
  const dueAt = row?.due_at ?? (row?.scheduled_date
    ? `${row.scheduled_date}${row?.scheduled_time ? `T${row.scheduled_time}` : ""}`
    : null);
  const priorityNumeric = typeof row?.priority === "number"
    ? row.priority
    : typeof row?.priority === "string" && row.priority.trim() !== ""
    ? Number.isFinite(Number(row.priority)) ? Number(row.priority) : 2
    : 2;
  return {
    ...row,
    type,
    status,
    priority: priorityNumeric,
    due_at: dueAt,
    title: row?.title ?? "",
    org_id: row?.org_id,
  } as Task;
};

const Tasks = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [myRoles, setMyRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"mine" | "all">("mine");
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>("all");
  const [openNew, setOpenNew] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [form, setForm] = useState({
    title: "", type: "cleaning" as TaskType, property_id: "", assigned_to: "",
    priority: 2, due_at: "", guest_name: "",
  });

  const isManager = myRoles.some(r => ["admin", "super_admin", "co_admin", "cohost"].includes(r));

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, pending_org_id, role")
      .eq("id", user.id)
      .maybeSingle();

    const access = await getUserAccess(user.id);
    const baseRoles = access.role ? [access.role] : [];
    const isScopedCohost = access.isCohost && !access.isAdmin;

    // For admins/super-admins who haven't been attached to an org yet (notably
    // the global super-admin, but also admins whose pending invite hasn't been
    // accepted via the banner), fall back to the first available organization
    // so they can still see and create tasks instead of bouncing off an empty
    // page. Cohosts/staff keep the strict org_id requirement.
    let effectiveOrgId = profile?.org_id ?? null;
    if (!effectiveOrgId && (access.isSuperAdmin || access.isAdmin)) {
      if (profile?.pending_org_id) {
        effectiveOrgId = profile.pending_org_id;
      } else {
        const { data: firstOrg } = await supabase
          .from("organizations")
          .select("id")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (firstOrg?.id) effectiveOrgId = firstOrg.id;
      }
    }

    if (!effectiveOrgId) {
      // Preserve the original "no org → bail early" behaviour for cohosts and
      // staff; they should not see manager UI without an org. But for
      // admins/super-admins we still want to surface their role so the page
      // chrome (e.g. the "New task" button) renders — clicking the button
      // will then call createTask which has its own org fallback.
      if (access.isSuperAdmin || access.isAdmin) {
        setMyRoles(baseRoles);
      }
      setLoading(false);
      return;
    }
    setOrgId(effectiveOrgId);

    const { data: allTasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("org_id", effectiveOrgId)
      .order("created_at", { ascending: false });

    if (isScopedCohost) {
      const { data: assignments } = await supabase
        .from("property_cohosts")
        .select("property_id")
        .eq("user_id", user.id);
      const allowedIds = (assignments ?? []).map((assignment) => assignment.property_id);

      const [propsRes, profsRes] = await Promise.all([
        allowedIds.length
          ? supabase.from("properties").select("id,name").in("id", allowedIds).order("name")
          : Promise.resolve({ data: [] }),
        supabase
          .from("profiles")
          .select("id,full_name")
          .eq("org_id", effectiveOrgId)
          .in("role", ["cleaner", "driver", "decorator", "maintenance", "staff"]),
      ]);

      setMyRoles(baseRoles);
      setProperties((propsRes.data ?? []) as Property[]);
      setMembers((profsRes.data ?? []) as Member[]);
      setTasks((allTasks ?? []).map(normalizeTaskRow).filter((task) => task.property_id && allowedIds.includes(task.property_id)));
      setLoading(false);
      return;
    }

    const [propsRes, profsRes] = await Promise.all([
      supabase.from("properties").select("id,name").eq("org_id", effectiveOrgId).order("name"),
      supabase.from("profiles").select("id,full_name").eq("org_id", effectiveOrgId),
    ]);

    setMyRoles(baseRoles);
    setTasks((allTasks ?? []).map(normalizeTaskRow));
    setProperties((propsRes.data ?? []) as Property[]);
    setMembers((profsRes.data ?? []) as Member[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const visible = tasks.filter((tk) => {
    if (filter !== "all" && tk.assigned_to !== user?.id) return false;
    if (statusFilter !== "all" && tk.status !== statusFilter) return false;
    return true;
  });

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.title.trim()) return toast.error(t("tasks.taskTitle"));

    // Last-resort fallback for admins/super-admins who reached this dialog
    // without an explicit org (orgId was never set because loadAll bailed
    // early). Pick the first available org so the insert has a valid
    // organization to attach the task to.
    let writeOrgId = orgId;
    if (!writeOrgId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id, pending_org_id")
        .eq("id", user.id)
        .maybeSingle();
      writeOrgId = profile?.org_id ?? profile?.pending_org_id ?? null;
      if (!writeOrgId) {
        const { data: firstOrg } = await supabase
          .from("organizations")
          .select("id")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        writeOrgId = firstOrg?.id ?? null;
      }
      if (!writeOrgId) {
        toast.error("No organization available for this task");
        return;
      }
      setOrgId(writeOrgId);
    }

    const dueIso = form.due_at ? new Date(form.due_at).toISOString() : null;
    const scheduledDate = form.due_at ? form.due_at.slice(0, 10) : null;
    const scheduledTime = form.due_at && form.due_at.length >= 16 ? form.due_at.slice(11, 16) : null;

    // Some deployments require `ref_number` (NOT NULL, no DB default). Generate
    // a short, sortable identifier client-side; the fallback helper drops the
    // field if the column doesn't exist in this deployment.
    const refNumber = `TSK-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;

    // Build a payload that covers both the "migrations" schema (created_by/type/due_at)
    // and the live schema (assigned_by/task_type/scheduled_date+time). The retry helper
    // strips any column the schema cache rejects.
    const { error } = await insertTaskWithSchemaFallback({
      // Send both common org column names — older migrations used
      // `organization_id`, the live schema uses `org_id`. The fallback helper
      // drops whichever the schema cache rejects so this works on either.
      org_id: writeOrgId,
      organization_id: writeOrgId,
      created_by: user.id,
      assigned_by: user.id,
      ref_number: refNumber,
      title: form.title.trim(),
      type: form.type,
      task_type: form.type,
      property_id: form.property_id || null,
      assigned_to: form.assigned_to || null,
      priority: String(form.priority),
      due_at: dueIso,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      guest_name: form.guest_name || null,
    });
    if (error) return toast.error((error as { message?: string }).message ?? String(error));
    toast.success(t("tasks.created"));
    setOpenNew(false);
    setForm({ title: "", type: "cleaning", property_id: "", assigned_to: "", priority: 2, due_at: "", guest_name: "" });
    loadAll();
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    // Optimistic: remove the card immediately. Skipping the loadAll() roundtrip
    // (auth + properties + members + tasks) eliminates the page-wide Loading
    // flicker after every delete.
    setTasks((prev) => prev.filter((tk) => tk.id !== id));
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setDeleteId(null);
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      loadAll(); // resync on failure
      return;
    }
    toast.success(t("tasks.deleted"));
  };

  const confirmBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setBulkDeleting(true);
    setTasks((prev) => prev.filter((tk) => !selectedIds.has(tk.id)));
    const { error } = await supabase.from("tasks").delete().in("id", ids);
    setBulkDeleting(false);
    setBulkConfirmOpen(false);
    setSelectedIds(new Set());
    if (error) {
      toast.error(error.message);
      loadAll();
      return;
    }
    toast.success(t("tasks.bulkDeleted", { count: ids.length, defaultValue: `${ids.length} supprimées` }));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const selectAllVisible = (visibleTasks: Task[]) => {
    setSelectedIds(new Set(visibleTasks.map((t) => t.id)));
  };

  if (selected) {
    return (
      <TaskDetail
        task={selected}
        properties={properties}
        members={members}
        onBack={() => { setSelected(null); loadAll(); }}
        onChanged={loadAll}
      />
    );
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {isManager && selectedIds.size > 0 && (
        <Card
          className="sticky top-2 z-30 flex items-center justify-between gap-3 p-3 bg-primary text-primary-foreground shadow-card"
          data-testid="task-bulk-bar"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-semibold" data-testid="task-bulk-count">
              {selectedIds.size} {t("tasks.bulk.selected", { defaultValue: "sélectionnée(s)" })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary-foreground hover:bg-primary-foreground/10 h-8"
              onClick={clearSelection}
            >
              {t("tasks.bulk.clear", { defaultValue: "Effacer" })}
            </Button>
            {selectedIds.size < visible.length && (
              <Button
                variant="ghost"
                size="sm"
                className="text-primary-foreground hover:bg-primary-foreground/10 h-8"
                onClick={() => selectAllVisible(visible)}
              >
                {t("tasks.bulk.selectAll", { defaultValue: "Tout sélectionner" })}
              </Button>
            )}
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setBulkConfirmOpen(true)}
            disabled={bulkDeleting}
            data-testid="task-bulk-delete-button"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            {t("tasks.bulk.deleteN", {
              count: selectedIds.size,
              defaultValue: `Supprimer ${selectedIds.size}`,
            })}
          </Button>
        </Card>
      )}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl md:text-3xl font-bold text-secondary">{t("tasks.title")}</h1>
        {isManager && (
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button data-testid="open-task-dialog">
                <Plus className="h-4 w-4 mr-2" />
                {t("tasks.add")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t("tasks.add")}</DialogTitle></DialogHeader>
              <form data-testid="task-form" onSubmit={createTask} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>{t("tasks.selectType")}</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {TASK_TYPES.map((tp) => {
                      const Icon = TASK_TYPE_ICONS[tp];
                      const active = form.type === tp;
                      return (
                        <button
                          key={tp}
                          type="button"
                          onClick={() => setForm({ ...form, type: tp })}
                          className={cn(
                            "flex flex-col items-center gap-1 p-3 rounded-lg border text-xs transition-colors",
                            active ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                          )}
                        >
                          <div className={cn("h-9 w-9 rounded-full flex items-center justify-center text-white", TASK_TYPE_COLORS[tp])}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <span>{t(`tasks.type.${tp}`)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("tasks.taskTitle")}</Label>
                  <Input
                    data-testid="task-title-input"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>{t("tasks.selectProperty")}</Label>
                  <Select value={form.property_id} onValueChange={(v) => setForm({ ...form, property_id: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("tasks.selectStaff")}</Label>
                  <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name || m.id.slice(0, 8)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("tasks.dueAt")}</Label>
                    <Input type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("tasks.priority")}</Label>
                    <Select value={String(form.priority)} onValueChange={(v) => setForm({ ...form, priority: Number(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">{t("tasks.low")}</SelectItem>
                        <SelectItem value="2">{t("tasks.normal")}</SelectItem>
                        <SelectItem value="3">{t("tasks.high")}</SelectItem>
                        <SelectItem value="4">{t("tasks.urgent")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("tasks.guestName")}</Label>
                  <Input value={form.guest_name} onChange={(e) => setForm({ ...form, guest_name: e.target.value })} />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpenNew(false)}>{t("tasks.cancel")}</Button>
                  <Button type="submit" data-testid="task-save-button">{t("tasks.save")}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={filter === "mine" ? "default" : "outline"} onClick={() => setFilter("mine")}>
          {t("tasks.myTasks")}
        </Button>
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
          {t("tasks.allTasks")}
        </Button>
        <div className="w-px bg-border mx-1" />
        {(["all", "todo", "in_progress", "done", "issue"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            onClick={() => setStatusFilter(s)}
          >
            {s === "all" ? t("tasks.allStatuses") : t(`tasks.status.${s}`)}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : visible.length === 0 ? (
        <Card className="p-10 text-center shadow-card">
          <h3 className="font-semibold text-secondary">{t("tasks.noTasks")}</h3>
          <p className="text-sm text-muted-foreground">{t("tasks.noTasksHint")}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((tk) => {
            const Icon = TASK_TYPE_ICONS[tk.type];
            const property = properties.find((p) => p.id === tk.property_id);
            const assignee = members.find((m) => m.id === tk.assigned_to);
            return (
              <Card
                key={tk.id}
                data-testid="task-card"
                data-selected={selectedIds.has(tk.id) ? "true" : "false"}
                onClick={() => {
                  if (selectedIds.size > 0) {
                    // While selecting, clicks toggle instead of opening detail.
                    toggleSelect(tk.id);
                  } else {
                    setSelected(tk);
                  }
                }}
                className={cn(
                  "p-4 shadow-card hover:shadow-soft transition cursor-pointer flex gap-3",
                  selectedIds.has(tk.id) && "ring-2 ring-primary",
                )}
              >
                {isManager && (
                  <Checkbox
                    checked={selectedIds.has(tk.id)}
                    onCheckedChange={() => toggleSelect(tk.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 shrink-0"
                    aria-label={`Select ${tk.title}`}
                    data-testid="task-card-checkbox"
                  />
                )}
                <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center text-white shrink-0", TASK_TYPE_COLORS[tk.type])}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-secondary truncate">{tk.title}</h3>
                    <Badge className={cn("text-[10px] shrink-0", STATUS_VARIANTS[tk.status])}>
                      {t(`tasks.status.${tk.status}`)}
                    </Badge>
                  </div>
                  {property && <p className="text-xs text-muted-foreground truncate">🏠 {property.name}</p>}
                  {assignee && <p className="text-xs text-muted-foreground truncate">👤 {assignee.full_name}</p>}
                  {tk.due_at && <p className="text-xs text-muted-foreground">⏰ {new Date(tk.due_at).toLocaleString()}</p>}
                  {tk.guest_rating && (
                    <div className="flex items-center gap-0.5 mt-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={cn("h-3 w-3", i < tk.guest_rating! ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
                      ))}
                    </div>
                  )}
                  {isManager && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 mt-1 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(tk.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tasks.deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("tasks.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>{t("tasks.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={bulkConfirmOpen}
        onOpenChange={(o) => !o && !bulkDeleting && setBulkConfirmOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("tasks.bulk.confirmTitle", {
                count: selectedIds.size,
                defaultValue: `Supprimer ${selectedIds.size} tâche(s) ?`,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("tasks.bulk.confirmBody", {
                defaultValue: "Cette action est irréversible.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>{t("tasks.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              disabled={bulkDeleting}
              data-testid="task-bulk-delete-confirm"
            >
              {bulkDeleting
                ? t("tasks.bulk.deleting", { defaultValue: "Suppression…" })
                : t("tasks.bulk.deleteN", {
                    count: selectedIds.size,
                    defaultValue: `Supprimer ${selectedIds.size}`,
                  })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ----- Detail view -----
const TaskDetail = ({
  task: initial, properties, members, onBack, onChanged,
}: {
  task: Task; properties: Property[]; members: Member[]; onBack: () => void; onChanged: () => void;
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [task, setTask] = useState<Task>(initial);
  const [photos, setPhotos] = useState<(TaskPhoto & { url?: string })[]>([]);
  const [uploading, setUploading] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueText, setIssueText] = useState("");
  const [finishOpen, setFinishOpen] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [guestComment, setGuestComment] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [checklistComplete, setChecklistComplete] = useState(false);
  const Icon = TASK_TYPE_ICONS[task.type];
  const property = properties.find((p) => p.id === task.property_id);
  const assignee = members.find((m) => m.id === task.assigned_to);
  const isCleaning = task.type === "cleaning";

  const loadPhotos = useCallback(async () => {
    const { data } = await supabase.from("task_photos").select("*").eq("task_id", task.id).order("created_at");
    const list = (data ?? []) as TaskPhoto[];
    const withUrls = await Promise.all(list.map(async (p) => {
      const { data: signed } = await supabase.storage.from("task-photos").createSignedUrl(p.storage_path, 3600);
      return { ...p, url: signed?.signedUrl };
    }));
    setPhotos(withUrls);
  }, [task.id]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  const updateStatus = async (status: TaskStatus, extra: Partial<Task> = {}) => {
    const { data, error } = await supabase.from("tasks").update({
      status,
      ...extra,
      ...(status === "in_progress" && !task.started_at ? { started_at: new Date().toISOString() } as any : {}),
      ...(status === "done" ? { completed_at: new Date().toISOString() } as any : {}),
    }).eq("id", task.id).select().single();
    if (error) return toast.error(error.message);
    setTask(data as Task);
    onChanged();
  };

  const handleStart = async () => {
    await updateStatus("in_progress");
    toast.success(t("tasks.started"));
  };

  const handleFinish = async () => {
    const hasAfterPhoto = photos.some((p) => p.kind === "after");
    if (!hasAfterPhoto) {
      toast.error("Photo 'après' obligatoire");
      return;
    }
    if (isCleaning && !checklistComplete) {
      toast.error("Tous les points de la checklist doivent être cochés");
      return;
    }
    setFinishOpen(true);
  };

  const confirmFinish = async () => {
    await updateStatus("done", {
      guest_rating: rating || null,
      guest_comment: guestComment || null,
    } as any);
    setFinishOpen(false);
    toast.success(t("tasks.completed"));
  };

  const reportIssue = async () => {
    if (!issueText.trim()) return;
    await updateStatus("issue", { issue_description: issueText.trim() } as any);
    setIssueOpen(false);
    setIssueText("");
    toast.success(t("tasks.issueReported"));
  };

  const handlePhoto = async (file: File, kind: PhotoKind) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `${task.org_id}/${task.id}/${fileName}`;
      const { error: upErr } = await supabase.storage.from("task-photos").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("task_photos").insert([{
        task_id: task.id,
        org_id: task.org_id,
        uploaded_by: user.id,
        storage_path: path,
        kind,
      }]);
      if (insErr) throw insErr;
      toast.success(t("tasks.photoUploaded"));
      loadPhotos();
    } catch (e: any) {
      toast.error(e.message || t("tasks.photoFailed"));
    } finally {
      setUploading(false);
    }
  };

  const [photoKind, setPhotoKind] = useState<PhotoKind>("after");

  return (
    <div className="space-y-4 max-w-3xl mx-auto pb-24">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        {t("tasks.back")}
      </Button>

      <Card className="p-4 shadow-card">
        <div className="flex items-start gap-3">
          <div className={cn("h-14 w-14 rounded-xl flex items-center justify-center text-white shrink-0", TASK_TYPE_COLORS[task.type])}>
            <Icon className="h-7 w-7" />
          </div>
          <div className="flex-1 min-w-0">
            <Badge className={cn("text-[10px] mb-1", STATUS_VARIANTS[task.status])}>
              {t(`tasks.status.${task.status}`)}
            </Badge>
            <h2 className="text-xl font-bold text-secondary">{task.title}</h2>
            <p className="text-sm text-muted-foreground">{t(`tasks.type.${task.type}`)}</p>
            {property && <p className="text-sm text-muted-foreground">🏠 {property.name}</p>}
            {assignee && <p className="text-sm text-muted-foreground">👤 {assignee.full_name}</p>}
            {task.due_at && <p className="text-sm text-muted-foreground">⏰ {new Date(task.due_at).toLocaleString()}</p>}
            {task.guest_name && <p className="text-sm text-muted-foreground">🧳 {task.guest_name}</p>}
          </div>
        </div>
      </Card>

      {isCleaning && (
        <CleaningChecklist
          taskId={task.id}
          organizationId={task.org_id}
          canEdit={task.assigned_to === user?.id || isTaskAuthor(task, user?.id)}
          onAllDone={setChecklistComplete}
        />
      )}

      {task.status === "issue" && task.issue_description && (
        <Card className="p-4 border-destructive bg-destructive/5">
          <div className="flex gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-sm">{task.issue_description}</p>
          </div>
        </Card>
      )}

      {task.status === "done" && (
        <Card className="p-4 bg-emerald-500/5 border-emerald-500/30">
          {task.guest_rating ? (
            <div className="flex items-center gap-1 mb-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={cn("h-5 w-5", i < task.guest_rating! ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
              ))}
            </div>
          ) : null}
          {task.guest_comment && <p className="text-sm">{task.guest_comment}</p>}
        </Card>
      )}

      {/* Photos grid */}
      <div className="space-y-2">
        <h3 className="font-semibold text-secondary flex items-center gap-2">
          <ImageIcon className="h-4 w-4" /> {photos.length}
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => {
            const ts = new Date(p.created_at);
            const stamp = ts.toLocaleString(undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
            return (
              <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="relative block aspect-square rounded-lg overflow-hidden bg-muted">
                {p.url && <img src={p.url} alt={p.kind} className="w-full h-full object-cover" loading="lazy" />}
                <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                  {t(`tasks.photo${p.kind.charAt(0).toUpperCase() + p.kind.slice(1)}`)}
                </span>
                <span className="absolute top-1 right-1 text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded font-mono">
                  {stamp}
                </span>
              </a>
            );
          })}
        </div>

        {/* Photo kind picker */}
        <div className="flex flex-wrap gap-2 pt-2">
          {(["before", "during", "after", "issue"] as PhotoKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setPhotoKind(k)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs border",
                photoKind === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"
              )}
            >
              {t(`tasks.photo${k.charAt(0).toUpperCase() + k.slice(1)}`)}
            </button>
          ))}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept={PHOTO_ACCEPT}
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              const v = validatePhotoFile(f);
              if (v.ok === false) toast.error(v.error);
              else handlePhoto(f, photoKind);
            }
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="w-full h-16 text-base"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <Camera className="h-6 w-6 mr-2" />
          {uploading ? "…" : t("tasks.takePhoto")}
        </Button>
      </div>

      {/* Action buttons - sticky at bottom feeling */}
      {(task.assigned_to === user?.id || isTaskAuthor(task, user?.id)) && (
        <div className="grid grid-cols-1 gap-3 pt-2">
          {task.status === "todo" && (
            <Button size="lg" className="h-16 text-lg" onClick={handleStart}>
              <Play className="h-6 w-6 mr-2" /> {t("tasks.start")}
            </Button>
          )}
          {(task.status === "in_progress" || task.status === "issue") && (
            <Button size="lg" className="h-16 text-lg bg-emerald-500 hover:bg-emerald-600 text-white" onClick={handleFinish}>
              <Check className="h-6 w-6 mr-2" /> {t("tasks.finish")}
            </Button>
          )}
          {task.status !== "done" && (
            <Button size="lg" variant="outline" className="h-14 text-base border-destructive text-destructive" onClick={() => setIssueOpen(true)}>
              <AlertTriangle className="h-5 w-5 mr-2" /> {t("tasks.reportIssue")}
            </Button>
          )}
        </div>
      )}

      {/* Issue dialog */}
      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("tasks.reportIssue")}</DialogTitle></DialogHeader>
          <Textarea rows={4} placeholder={t("tasks.issueDescription")} value={issueText} onChange={(e) => setIssueText(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)}>{t("tasks.cancel")}</Button>
            <Button onClick={reportIssue}>{t("tasks.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finish + rating dialog */}
      <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("tasks.rating")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("tasks.ratingHint")}</p>
          <div className="flex justify-center gap-2 py-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)}>
                <Star className={cn("h-10 w-10", n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
              </button>
            ))}
          </div>
          <Textarea rows={3} placeholder={t("tasks.guestComment")} value={guestComment} onChange={(e) => setGuestComment(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinishOpen(false)}>{t("tasks.cancel")}</Button>
            <Button onClick={confirmFinish}>{t("tasks.finish")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tasks;
