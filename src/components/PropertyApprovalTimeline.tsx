import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, XCircle, Clock, RotateCcw, History } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Event {
  id: string;
  event: string;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
  actor_name?: string | null;
}

interface Props {
  propertyId: string;
  propertyName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ICONS: Record<string, JSX.Element> = {
  submitted: <Clock className="h-4 w-4 text-amber-600" />,
  approved: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  rejected: <XCircle className="h-4 w-4 text-destructive" />,
  resubmitted: <RotateCcw className="h-4 w-4 text-primary" />,
};

export function PropertyApprovalTimeline({ propertyId, propertyName, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("property_approval_events")
        .select("id, event, actor_id, reason, created_at")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: true });

      const events = (data ?? []) as Event[];
      const actorIds = Array.from(new Set(events.map((e) => e.actor_id).filter(Boolean) as string[]));
      if (actorIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", actorIds);
        const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
        events.forEach((e) => { e.actor_name = e.actor_id ? nameMap.get(e.actor_id) ?? null : null; });
      }
      setEvents(events);
      setLoading(false);
    })();
  }, [open, propertyId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {t("properties.approval.history")} — {propertyName}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("properties.approval.noHistory")}</p>
        ) : (
          <ol className="relative border-s border-border ms-3 space-y-4 pt-2">
            {events.map((e) => (
              <li key={e.id} className="ms-4">
                <span className="absolute -start-2 flex h-4 w-4 items-center justify-center rounded-full bg-background ring-4 ring-background">
                  {ICONS[e.event] ?? <Clock className="h-4 w-4" />}
                </span>
                <div className="text-sm font-medium text-secondary">
                  {t(`properties.approval.events.${e.event}`)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(e.created_at), "dd MMM yyyy · HH:mm")}
                  {e.actor_name && <> · {e.actor_name}</>}
                </div>
                {e.reason && (
                  <p className="text-xs italic text-destructive mt-1">"{e.reason}"</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
