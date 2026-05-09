import { useEffect, useState } from "react";
import { BookOpen, Plus, QrCode, Pencil, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Property { id: string; name: string; }
interface GuestBook {
  id: string;
  organization_id: string;
  property_id: string;
  slug: string;
  active: boolean;
  language: string;
  wifi_name: string | null;
  wifi_password: string | null;
  check_in_instructions: string | null;
  check_out_instructions: string | null;
  house_rules: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  emergency_phone: string | null;
  extra_notes: string | null;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

interface PropertyFull { id: string; name: string; show_on_website: boolean; public_description: string | null; entry_instructions: string | null; }
interface OrgSite { website_contact_phone: string | null; website_contact_email: string | null; }

const GuestBooks = () => {
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [properties, setProperties] = useState<PropertyFull[]>([]);
  const [orgSite, setOrgSite] = useState<OrgSite | null>(null);
  const [books, setBooks] = useState<GuestBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<GuestBook | null>(null);
  const [qrBook, setQrBook] = useState<GuestBook | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: prof } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
      const oid = prof?.organization_id ?? null;
      setOrgId(oid);
      if (oid) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("organization_id", oid);
        setCanEdit(!!roles?.some((r: any) => r.role === "admin" || r.role === "cohost"));
      }
    })();
  }, [user]);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    const [propsRes, booksRes, orgRes] = await Promise.all([
      supabase.from("properties").select("id, name, show_on_website, public_description, entry_instructions").eq("organization_id", orgId).order("name"),
      supabase.from("guest_books").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }),
      supabase.from("organizations").select("website_contact_phone, website_contact_email").eq("id", orgId).maybeSingle(),
    ]);
    setProperties((propsRes.data as any) || []);
    setBooks((booksRes.data as any) || []);
    setOrgSite((orgRes.data as any) || null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [orgId]);

  // Only properties shown on the public website are eligible
  const eligibleProps = properties.filter((p) => p.show_on_website);

  const startNew = () => {
    if (!canEdit) { toast.error("Réservé aux admin / cohost"); return; }
    if (!eligibleProps.length) {
      toast.error("Aucune propriété publiée sur le site. Active « Afficher sur le site » d'abord.");
      return;
    }
    const p = eligibleProps[0];
    setEditing({
      id: "",
      organization_id: orgId!,
      property_id: p.id,
      slug: "",
      active: true,
      language: "fr",
      wifi_name: "",
      wifi_password: "",
      check_in_instructions: p.entry_instructions || "",
      check_out_instructions: "",
      house_rules: p.public_description || "",
      contact_name: "",
      contact_phone: orgSite?.website_contact_phone || "",
      emergency_phone: "",
      extra_notes: "",
    });
  };

  const save = async () => {
    if (!editing || !orgId) return;
    const propName = properties.find((p) => p.id === editing.property_id)?.name || "livret";
    const slug = editing.slug || `${slugify(propName)}-${Math.random().toString(36).slice(2, 6)}`;

    const payload = { ...editing, slug, organization_id: orgId };
    if (!editing.id) {
      const { id: _omit, ...insertData } = payload as any;
      const { error } = await supabase.from("guest_books").insert(insertData);
      if (error) return toast.error(error.message);
      toast.success("Livret créé");
    } else {
      const { id, ...updateData } = payload;
      const { error } = await supabase.from("guest_books").update(updateData).eq("id", id);
      if (error) return toast.error(error.message);
      toast.success("Livret mis à jour");
    }
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer ce livret ?")) return;
    const { error } = await supabase.from("guest_books").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Supprimé");
    load();
  };

  const publicUrl = (slug: string) => `${window.location.origin}/g/${slug}`;

  if (loading) {
    return <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="w-6 h-6 text-primary" /> Livrets d'accueil</h1>
          <p className="text-sm text-muted-foreground">
            Une page web par bien (WiFi, check-in, contacts, QR code).{" "}
            {!canEdit && <span className="text-warning">Lecture seule — édition réservée aux admin / cohost.</span>}
            {canEdit && <span>Seules les propriétés publiées sur le site sont éligibles.</span>}
          </p>
        </div>
        {canEdit && <Button onClick={startNew}><Plus className="w-4 h-4 mr-2" /> Nouveau livret</Button>}
      </div>

      {books.length === 0 ? (
        <Card className="p-10 text-center">
          <BookOpen className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">Aucun livret. Crée le premier pour générer un QR code.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {books.map((b) => {
            const prop = properties.find((p) => p.id === b.property_id);
            return (
              <Card key={b.id} className="p-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{prop?.name || "—"}</span>
                    {!b.active && <span className="text-xs bg-muted px-2 py-0.5 rounded">Désactivé</span>}
                  </div>
                  <a href={publicUrl(b.slug)} target="_blank" rel="noreferrer" className="text-xs text-primary flex items-center gap-1">
                    /g/{b.slug} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setQrBook(b)}><QrCode className="w-4 h-4" /></Button>
                  {canEdit && <Button variant="outline" size="sm" onClick={() => setEditing(b)}><Pencil className="w-4 h-4" /></Button>}
                  {canEdit && <Button variant="outline" size="sm" onClick={() => remove(b.id)}><Trash2 className="w-4 h-4" /></Button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Modifier le livret" : "Nouveau livret"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Propriété</Label>
                  <Select value={editing.property_id} onValueChange={(v) => setEditing({ ...editing, property_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {eligibleProps.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
                    <Label>Actif</Label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label>WiFi nom</Label><Input value={editing.wifi_name || ""} onChange={(e) => setEditing({ ...editing, wifi_name: e.target.value })} /></div>
                <div><Label>WiFi mot de passe</Label><Input value={editing.wifi_password || ""} onChange={(e) => setEditing({ ...editing, wifi_password: e.target.value })} /></div>
              </div>

              <div><Label>Instructions check-in</Label><Textarea rows={3} value={editing.check_in_instructions || ""} onChange={(e) => setEditing({ ...editing, check_in_instructions: e.target.value })} /></div>
              <div><Label>Instructions check-out</Label><Textarea rows={3} value={editing.check_out_instructions || ""} onChange={(e) => setEditing({ ...editing, check_out_instructions: e.target.value })} /></div>
              <div><Label>Règles de la maison</Label><Textarea rows={3} value={editing.house_rules || ""} onChange={(e) => setEditing({ ...editing, house_rules: e.target.value })} /></div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label>Contact nom</Label><Input value={editing.contact_name || ""} onChange={(e) => setEditing({ ...editing, contact_name: e.target.value })} /></div>
                <div><Label>Contact téléphone</Label><Input value={editing.contact_phone || ""} onChange={(e) => setEditing({ ...editing, contact_phone: e.target.value })} /></div>
              </div>
              <div><Label>Téléphone d'urgence</Label><Input value={editing.emergency_phone || ""} onChange={(e) => setEditing({ ...editing, emergency_phone: e.target.value })} /></div>
              <div><Label>Notes complémentaires</Label><Textarea rows={2} value={editing.extra_notes || ""} onChange={(e) => setEditing({ ...editing, extra_notes: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
            <Button onClick={save}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR dialog */}
      <Dialog open={!!qrBook} onOpenChange={(o) => !o && setQrBook(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>QR code à imprimer</DialogTitle></DialogHeader>
          {qrBook && (
            <div className="flex flex-col items-center gap-3 p-2">
              <div className="bg-white p-4 rounded-lg">
                <QRCodeSVG value={publicUrl(qrBook.slug)} size={220} />
              </div>
              <p className="text-xs text-muted-foreground break-all text-center">{publicUrl(qrBook.slug)}</p>
              <Button variant="outline" size="sm" onClick={() => window.print()}>Imprimer</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GuestBooks;
