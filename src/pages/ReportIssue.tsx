import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PHOTO_ACCEPT, validatePhotoFile } from "@/lib/photoUpload";

const CATEGORIES = [
  { value: "plumbing", label: "Plomberie / fuite d'eau" },
  { value: "electrical", label: "Électricité" },
  { value: "appliance", label: "Équipement (frigo, four, clim…)" },
  { value: "wifi", label: "Internet / WiFi" },
  { value: "cleanliness", label: "Propreté" },
  { value: "noise", label: "Bruit" },
  { value: "other", label: "Autre" },
];

const ReportIssue = () => {
  const { slug } = useParams<{ slug: string }>();
  const [book, setBook] = useState<{ property_id: string; organization_id: string } | null>(null);
  const [propertyName, setPropertyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [form, setForm] = useState({
    category: "other",
    title: "",
    description: "",
    reporter_name: "",
    reporter_phone: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!slug) return;
      const { data } = await supabase
        .from("guest_books")
        .select("property_id, organization_id")
        .eq("slug", slug)
        .eq("active", true)
        .maybeSingle();
      if (data) {
        setBook(data);
        const { data: p } = await supabase.from("properties").select("name").eq("id", data.property_id).maybeSingle();
        setPropertyName(p?.name || "");
      }
      setLoading(false);
    };
    load();
  }, [slug]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!book || !form.title.trim()) {
      toast.error("Décris brièvement le problème");
      return;
    }
    setSubmitting(true);
    try {
      let photo_url: string | null = null;
      if (photo) {
        const path = `${book.organization_id}/${Date.now()}-${photo.name}`;
        const { error: upErr } = await supabase.storage.from("maintenance-photos").upload(path, photo);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("maintenance-photos").getPublicUrl(path);
        photo_url = pub.publicUrl;
      }

      const { error } = await supabase.from("maintenance_tickets").insert({
        organization_id: book.organization_id,
        property_id: book.property_id,
        category: form.category as any,
        title: form.title,
        description: form.description || null,
        reporter_name: form.reporter_name || null,
        reporter_phone: form.reporter_phone || null,
        photo_url,
      });
      if (error) throw error;
      setDone(true);
    } catch (err: any) {
      toast.error(err.message || "Erreur d'envoi");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="p-8 text-center max-w-md">
          <h1 className="text-xl font-semibold mb-2">Lien invalide</h1>
          <p className="text-muted-foreground">Ce livret n'existe pas ou est désactivé.</p>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="p-8 text-center max-w-md">
          <CheckCircle2 className="w-12 h-12 mx-auto text-success mb-4" />
          <h1 className="text-xl font-semibold mb-2">Signalement envoyé ✓</h1>
          <p className="text-muted-foreground mb-6">L'équipe a été prévenue et vous contactera rapidement.</p>
          <Link to={`/g/${slug}`}>
            <Button variant="outline">Retour au livret</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-md mx-auto px-4">
        <div className="text-center mb-6">
          <AlertTriangle className="w-10 h-10 mx-auto text-warning mb-2" />
          <h1 className="text-2xl font-bold">Signaler un problème</h1>
          {propertyName && <p className="text-sm text-muted-foreground mt-1">{propertyName}</p>}
        </div>

        <Card className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Type de problème *</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Résumé *</Label>
              <Input
                placeholder="Ex : robinet de la cuisine qui fuit"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={120}
                required
              />
            </div>
            <div>
              <Label>Détails</Label>
              <Textarea
                rows={4}
                placeholder="Décris le problème"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={1000}
              />
            </div>
            <div>
              <Label>Photo (optionnel) — JPG, 200 Ko max</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept={PHOTO_ACCEPT}
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    if (!f) { setPhoto(null); return; }
                    const v = validatePhotoFile(f);
                    if (v.ok === false) {
                      toast.error(v.error);
                      e.target.value = "";
                      setPhoto(null);
                      return;
                    }
                    setPhoto(f);
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Votre nom</Label>
                <Input value={form.reporter_name} onChange={(e) => setForm({ ...form, reporter_name: e.target.value })} maxLength={80} />
              </div>
              <div>
                <Label>Téléphone</Label>
                <Input value={form.reporter_phone} onChange={(e) => setForm({ ...form, reporter_phone: e.target.value })} maxLength={30} />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              Envoyer le signalement
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default ReportIssue;
