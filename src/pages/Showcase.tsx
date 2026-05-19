import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Home, MapPin, Users, Bed, Bath, Loader2, MessageCircle, Phone, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Org {
  id: string;
  name: string;
  website_tagline: string | null;
  website_contact_phone: string | null;
  website_contact_email: string | null;
}
interface Property {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  max_guests: number | null;
  cover_image_url: string | null;
  public_description: string | null;
  price_per_night: number | null;
}

const Showcase = () => {
  const { orgId } = useParams<{ orgId: string }>();
  const [org, setOrg] = useState<Org | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<Property | null>(null);
  const [form, setForm] = useState({ guest_name: "", guest_email: "", guest_phone: "", check_in: "", check_out: "", guests_count: 2, message: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!orgId) return;
      const [{ data: o }, { data: p }] = await Promise.all([
        supabase.from("organizations").select("id, name, website_tagline, website_contact_phone, website_contact_email").eq("id", orgId).eq("show_on_website", true).maybeSingle(),
        (supabase as any).from("public_properties").select("id, name, city, region, bedrooms, bathrooms, max_guests, cover_image_url, public_description, price_per_night").eq("organization_id", orgId).order("name"),
      ]);
      setOrg(o as any);
      setProperties((p as any) || []);
      setLoading(false);
    };
    load();
  }, [orgId]);

  const submit = async () => {
    if (!org || !requesting || !form.guest_name) {
      toast.error("Nom requis");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("booking_requests").insert({
      organization_id: org.id,
      property_id: requesting.id,
      guest_name: form.guest_name,
      guest_email: form.guest_email || null,
      guest_phone: form.guest_phone || null,
      check_in: form.check_in || null,
      check_out: form.check_out || null,
      guests_count: form.guests_count,
      message: form.message || null,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Demande envoyée ! L'organisation va vous recontacter.");
    setRequesting(null);
    setForm({ guest_name: "", guest_email: "", guest_phone: "", check_in: "", check_out: "", guests_count: 2, message: "" });
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (!org) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="p-8 text-center max-w-md">
          <h1 className="text-xl font-semibold mb-2">Vitrine introuvable</h1>
          <p className="text-muted-foreground">Cette organisation n'a pas encore publié sa vitrine.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-to-br from-primary to-primary-glow text-primary-foreground py-12 px-6 text-center">
        <h1 className="text-3xl md:text-4xl font-bold">{org.name}</h1>
        {org.website_tagline && <p className="opacity-90 mt-2">{org.website_tagline}</p>}
        <div className="flex justify-center gap-4 mt-4 text-sm flex-wrap">
          {org.website_contact_phone && <a href={`tel:${org.website_contact_phone}`} className="flex items-center gap-1"><Phone className="w-4 h-4" /> {org.website_contact_phone}</a>}
          {org.website_contact_email && <a href={`mailto:${org.website_contact_email}`} className="flex items-center gap-1"><Mail className="w-4 h-4" /> {org.website_contact_email}</a>}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-10">
        <h2 className="text-xl font-semibold mb-6">Nos biens disponibles</h2>
        {properties.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">Aucun bien publié pour le moment.</Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {properties.map((p) => (
              <Card key={p.id} className="overflow-hidden flex flex-col">
                <div className="aspect-video bg-muted">
                  {p.cover_image_url ? (
                    <img src={p.cover_image_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Home className="w-10 h-10 text-muted-foreground" /></div>
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="font-semibold">{p.name}</h3>
                  {(p.city || p.region) && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" />{[p.city, p.region].filter(Boolean).join(", ")}</p>}
                  <div className="flex gap-3 text-xs text-muted-foreground mt-2">
                    {p.bedrooms != null && <span className="flex items-center gap-1"><Bed className="w-3 h-3" />{p.bedrooms}</span>}
                    {p.bathrooms != null && <span className="flex items-center gap-1"><Bath className="w-3 h-3" />{p.bathrooms}</span>}
                    {p.max_guests != null && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{p.max_guests}</span>}
                  </div>
                  {p.public_description && <p className="text-sm mt-2 line-clamp-3">{p.public_description}</p>}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t">
                    {p.price_per_night != null ? (
                      <div><span className="text-lg font-bold">{p.price_per_night}€</span><span className="text-xs text-muted-foreground"> /nuit</span></div>
                    ) : <span />}
                    <Button size="sm" onClick={() => setRequesting(p)}>Réserver</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={!!requesting} onOpenChange={(o) => !o && setRequesting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Demande de réservation — {requesting?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom complet *</Label><Input value={form.guest_name} onChange={(e) => setForm({ ...form, guest_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input type="email" value={form.guest_email} onChange={(e) => setForm({ ...form, guest_email: e.target.value })} /></div>
              <div><Label>Téléphone</Label><Input value={form.guest_phone} onChange={(e) => setForm({ ...form, guest_phone: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Arrivée</Label><Input type="date" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} /></div>
              <div><Label>Départ</Label><Input type="date" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} /></div>
              <div><Label>Voyageurs</Label><Input type="number" min={1} value={form.guests_count} onChange={(e) => setForm({ ...form, guests_count: +e.target.value })} /></div>
            </div>
            <div><Label>Message</Label><Textarea rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequesting(null)}>Annuler</Button>
            <Button onClick={submit} disabled={submitting}>{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Envoyer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Showcase;
