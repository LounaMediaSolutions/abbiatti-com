import { useEffect, useState } from "react";
import { Mail, Loader2, MessageCircle, Phone, Globe2, Copy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

interface Request {
  id: string;
  property_id: string | null;
  status: string;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  check_in: string | null;
  check_out: string | null;
  guests_count: number | null;
  message: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = { new: "Nouvelle", contacted: "Contacté", confirmed: "Confirmée", declined: "Refusée", closed: "Fermée" };
const STATUS_VARIANTS: Record<string, any> = { new: "destructive", contacted: "default", confirmed: "secondary", declined: "outline", closed: "outline" };

const BookingRequests = () => {
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [org, setOrg] = useState<any>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [props, setProps] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    const { data: prof } = await supabase.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    if (!prof?.org_id) return;
    setOrgId(prof.org_id);
    const [{ data: o }, { data: r }, { data: p }] = await Promise.all([
      supabase.from("organizations").select("*").eq("id", prof.org_id).maybeSingle(),
      supabase.from("booking_requests").select("*").eq("organization_id", prof.org_id).order("created_at", { ascending: false }),
      supabase.from("properties").select("id, name").eq("org_id", prof.org_id),
    ]);
    setOrg(o);
    setRequests((r as any) || []);
    const m: Record<string, string> = {};
    (p || []).forEach((x) => { m[x.id] = x.name; });
    setProps(m);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const updateOrg = async (patch: any) => {
    if (!orgId) return;
    const { error } = await supabase.from("organizations").update(patch).eq("id", orgId);
    if (error) return toast.error(error.message);
    setOrg({ ...org, ...patch });
    toast.success("Mis à jour");
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("booking_requests").update({ status: status as any }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const showcaseUrl = orgId ? `${window.location.origin}/v/${orgId}` : "";

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Globe2 className="w-6 h-6 text-primary" /> Vitrine publique</h1>
        <p className="text-sm text-muted-foreground">Affiche tes biens sur une page publique pour recevoir des réservations directes (0% commission).</p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Activer la vitrine publique</Label>
            <p className="text-xs text-muted-foreground">Quand activé, ta page est accessible publiquement.</p>
          </div>
          <Switch checked={!!org?.show_on_website} onCheckedChange={(v) => updateOrg({ show_on_website: v })} />
        </div>
        {org?.show_on_website && (
          <div className="flex items-center gap-2 p-3 bg-muted rounded">
            <code className="text-xs flex-1 truncate">{showcaseUrl}</code>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(showcaseUrl); toast.success("Copié"); }}><Copy className="w-3 h-3" /></Button>
            <Button size="sm" variant="outline" onClick={() => window.open(showcaseUrl, "_blank")}>Ouvrir</Button>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label>Slogan</Label><Input value={org?.website_tagline || ""} onChange={(e) => setOrg({ ...org, website_tagline: e.target.value })} onBlur={() => updateOrg({ website_tagline: org?.website_tagline })} /></div>
          <div><Label>Téléphone contact</Label><Input value={org?.website_contact_phone || ""} onChange={(e) => setOrg({ ...org, website_contact_phone: e.target.value })} onBlur={() => updateOrg({ website_contact_phone: org?.website_contact_phone })} /></div>
          <div className="md:col-span-2"><Label>Email contact</Label><Input type="email" value={org?.website_contact_email || ""} onChange={(e) => setOrg({ ...org, website_contact_email: e.target.value })} onBlur={() => updateOrg({ website_contact_email: org?.website_contact_email })} /></div>
        </div>
        <p className="text-xs text-muted-foreground">💡 Active "Afficher sur la vitrine" sur chaque bien depuis la page Propriétés.</p>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-3 flex items-center gap-2"><Mail className="w-5 h-5" /> Demandes reçues ({requests.length})</h2>
        {requests.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">Aucune demande pour le moment.</Card>
        ) : (
          <div className="grid gap-3">
            {requests.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant={STATUS_VARIANTS[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { locale: fr, addSuffix: true })}</span>
                    </div>
                    <h3 className="font-semibold">{r.guest_name}</h3>
                    <p className="text-sm text-muted-foreground">{r.property_id ? props[r.property_id] : "—"}</p>
                    <div className="text-xs mt-1 space-y-0.5">
                      {r.check_in && <div>📅 {r.check_in} → {r.check_out} ({r.guests_count} pers.)</div>}
                      {r.guest_email && <a href={`mailto:${r.guest_email}`} className="text-primary block">{r.guest_email}</a>}
                      {r.guest_phone && (
                        <div className="flex gap-2">
                          <a href={`tel:${r.guest_phone}`} className="text-primary flex items-center gap-1"><Phone className="w-3 h-3" />{r.guest_phone}</a>
                          <a href={`https://wa.me/${r.guest_phone.replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer" className="text-primary flex items-center gap-1"><MessageCircle className="w-3 h-3" />WhatsApp</a>
                        </div>
                      )}
                    </div>
                    {r.message && <p className="text-sm mt-2 p-2 bg-muted rounded whitespace-pre-wrap">{r.message}</p>}
                  </div>
                  <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v)}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BookingRequests;
