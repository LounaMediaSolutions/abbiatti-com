import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, CheckCircle2, Clock, Phone, Image as ImageIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

interface Ticket {
  id: string;
  property_id: string;
  category: string;
  status: string;
  title: string;
  description: string | null;
  photo_url: string | null;
  reporter_name: string | null;
  reporter_phone: string | null;
  created_at: string;
}

const CAT_LABELS: Record<string, string> = {
  plumbing: "Plomberie", electrical: "Électricité", appliance: "Équipement",
  cleanliness: "Propreté", wifi: "WiFi", noise: "Bruit", other: "Autre",
};
const STATUS_VARIANTS: Record<string, any> = {
  new: "destructive", in_progress: "default", resolved: "secondary", closed: "outline",
};
const STATUS_LABELS: Record<string, string> = {
  new: "Nouveau", in_progress: "En cours", resolved: "Résolu", closed: "Fermé",
};

const Tickets = () => {
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [props, setProps] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle()
      .then(({ data }) => setOrgId(data?.organization_id ?? null));
  }, [user]);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    const [tRes, pRes] = await Promise.all([
      supabase.from("maintenance_tickets").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }),
      supabase.from("properties").select("id, name").eq("organization_id", orgId),
    ]);
    setTickets((tRes.data as any) || []);
    const m: Record<string, string> = {};
    (pRes.data || []).forEach((p) => { m[p.id] = p.name; });
    setProps(m);
    setLoading(false);
  };

  useEffect(() => { load(); }, [orgId]);

  const updateStatus = async (id: string, status: string) => {
    const patch: any = { status };
    if (status === "resolved") patch.resolved_at = new Date().toISOString();
    const { error } = await supabase.from("maintenance_tickets").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Mis à jour");
    load();
  };

  const filtered = filter === "all" ? tickets : tickets.filter((t) => t.status === filter);

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><AlertTriangle className="w-6 h-6 text-warning" /> Signalements</h1>
          <p className="text-sm text-muted-foreground">Problèmes signalés par les voyageurs via QR code.</p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="new">Nouveau</SelectItem>
            <SelectItem value="in_progress">En cours</SelectItem>
            <SelectItem value="resolved">Résolu</SelectItem>
            <SelectItem value="closed">Fermé</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <CheckCircle2 className="w-10 h-10 mx-auto text-success mb-2" />
          <p className="text-muted-foreground">Aucun signalement.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant={STATUS_VARIANTS[t.status]}>{STATUS_LABELS[t.status]}</Badge>
                    <Badge variant="outline">{CAT_LABELS[t.category]}</Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />{formatDistanceToNow(new Date(t.created_at), { locale: fr, addSuffix: true })}
                    </span>
                  </div>
                  <h3 className="font-semibold">{t.title}</h3>
                  <p className="text-sm text-muted-foreground">{props[t.property_id] || "—"}</p>
                  {t.description && <p className="text-sm mt-2 whitespace-pre-wrap">{t.description}</p>}
                  {(t.reporter_name || t.reporter_phone) && (
                    <div className="text-xs text-muted-foreground mt-2">
                      {t.reporter_name} {t.reporter_phone && (
                        <a href={`tel:${t.reporter_phone}`} className="text-primary inline-flex items-center gap-1 ml-2">
                          <Phone className="w-3 h-3" />{t.reporter_phone}
                        </a>
                      )}
                    </div>
                  )}
                  {t.photo_url && (
                    <a href={t.photo_url} target="_blank" rel="noreferrer" className="inline-block mt-2">
                      <img src={t.photo_url} alt="" className="h-24 rounded border" />
                    </a>
                  )}
                </div>
                <Select value={t.status} onValueChange={(v) => updateStatus(t.id, v)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Nouveau</SelectItem>
                    <SelectItem value="in_progress">En cours</SelectItem>
                    <SelectItem value="resolved">Résolu</SelectItem>
                    <SelectItem value="closed">Fermé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Tickets;
