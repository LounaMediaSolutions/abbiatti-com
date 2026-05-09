import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Upload, Eye, ImageIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { AdPlacement } from "./AdBanner";

const PLACEMENT_LABEL: Record<AdPlacement, string> = {
  guest_hero: "Hero portail invité (exclusif)",
  guest_inline: "Inline portail invité",
  public_book: "Page publique /g/:slug",
  welcome_footer: "Footer écran d'accueil",
};

interface BannerRow {
  id: string;
  organization_id: string;
  partner_id: string | null;
  placement: AdPlacement;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  start_date: string;
  end_date: string;
  active: boolean;
  visible_to_guest: boolean;
  priority: number;
}

interface PartnerLite {
  id: string;
  name: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const inDaysISO = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const EMPTY_FORM = {
  partner_id: "",
  placement: "guest_inline" as AdPlacement,
  title: "",
  subtitle: "",
  cta_label: "",
  cta_url: "",
  start_date: todayISO(),
  end_date: inDaysISO(30),
  priority: 0,
  visible_to_guest: true,
};

export function BannersManager({ orgId }: { orgId: string }) {
  const [items, setItems] = useState<BannerRow[]>([]);
  const [partners, setPartners] = useState<PartnerLite[]>([]);
  const [impressionsByBanner, setImpressionsByBanner] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    const [{ data: banners }, { data: parts }, { data: imps }] = await Promise.all([
      supabase.from("ad_banners").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }),
      supabase.from("partner_services").select("id,name").eq("organization_id", orgId).order("name"),
      supabase.from("ad_impressions").select("banner_id").eq("organization_id", orgId),
    ]);
    setItems((banners ?? []) as BannerRow[]);
    setPartners((parts ?? []) as PartnerLite[]);
    const counts: Record<string, number> = {};
    (imps ?? []).forEach((r: any) => {
      counts[r.banner_id] = (counts[r.banner_id] ?? 0) + 1;
    });
    setImpressionsByBanner(counts);
  };

  useEffect(() => {
    void load();
  }, [orgId]);

  const uploadImage = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("partner-banners").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      toast.error("Upload image: " + error.message);
      return null;
    }
    const { data } = supabase.storage.from("partner-banners").getPublicUrl(path);
    return data.publicUrl;
  };

  const checkExclusivity = async (placement: AdPlacement, start: string, end: string, excludeId?: string) => {
    const { data } = await supabase
      .from("ad_banners")
      .select("id,title,start_date,end_date")
      .eq("organization_id", orgId)
      .eq("placement", placement)
      .eq("active", true)
      .lte("start_date", end)
      .gte("end_date", start);
    return (data ?? []).filter((b: any) => b.id !== excludeId);
  };

  const add = async () => {
    if (!form.title.trim()) return toast.error("Titre requis");
    if (!form.end_date || form.end_date < form.start_date) return toast.error("Date de fin invalide");

    // Exclusivity check
    const overlap = await checkExclusivity(form.placement, form.start_date, form.end_date);
    if (overlap.length > 0) {
      const ok = confirm(
        `⚠️ Conflit d'exclusivité : "${overlap[0].title}" occupe déjà cet emplacement sur cette période.\n\nContinuer quand même ?`,
      );
      if (!ok) return;
    }

    setUploading(true);
    let imageUrl: string | null = null;
    if (imageFile) {
      imageUrl = await uploadImage(imageFile);
      if (!imageUrl) {
        setUploading(false);
        return;
      }
    }

    const { error } = await supabase.from("ad_banners").insert({
      organization_id: orgId,
      partner_id: form.partner_id || null,
      placement: form.placement,
      title: form.title,
      subtitle: form.subtitle || null,
      image_url: imageUrl,
      cta_label: form.cta_label || null,
      cta_url: form.cta_url || null,
      start_date: form.start_date,
      end_date: form.end_date,
      priority: form.priority,
      visible_to_guest: form.visible_to_guest,
      active: true,
    });
    setUploading(false);
    if (error) return toast.error(error.message);
    toast.success("Bannière créée");
    setForm({ ...EMPTY_FORM });
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    void load();
  };

  const update = async (id: string, patch: Partial<BannerRow>) => {
    const { error } = await supabase.from("ad_banners").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer cette bannière ?")) return;
    const { error } = await supabase.from("ad_banners").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  const seedDemo = async () => {
    setSeeding(true);
    try {
      const placements: AdPlacement[] = ["guest_hero", "guest_inline", "public_book", "welcome_footer"];
      const titles = [
        { t: "Découvrez la Pizzeria Da Marco", s: "Authentique cuisine italienne au feu de bois", cta: "Voir le menu" },
        { t: "Spa Lumière — offre exclusive", s: "Massage relaxant -15% pour les invités", cta: "Réserver" },
        { t: "Sortie en mer aux calanques", s: "Demi-journée bateau au coucher de soleil", cta: "En savoir plus" },
        { t: "Taxi privé 24/7", s: "Réservation immédiate, tarifs préférentiels", cta: "Appeler" },
      ];
      let created = 0;
      for (let i = 0; i < placements.length; i++) {
        const t = titles[i];
        const { error } = await supabase.from("ad_banners").insert({
          organization_id: orgId,
          placement: placements[i],
          title: `[DEMO] ${t.t}`,
          subtitle: t.s,
          cta_label: t.cta,
          cta_url: "https://example.com",
          start_date: todayISO(),
          end_date: inDaysISO(30),
          priority: 0,
          active: true,
          visible_to_guest: true,
        });
        if (!error) created++;
      }
      toast.success(`${created} bannière(s) démo créée(s)`);
      void load();
    } finally {
      setSeeding(false);
    }
  };

  const clearDemo = async () => {
    if (!confirm("Supprimer toutes les bannières [DEMO] ?")) return;
    const { error } = await supabase
      .from("ad_banners")
      .delete()
      .eq("organization_id", orgId)
      .like("title", "[DEMO]%");
    if (error) return toast.error(error.message);
    toast.success("Bannières démo supprimées");
    void load();
  };

  const totalImpressions = Object.values(impressionsByBanner).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      {/* Demo banner */}
      <Card className="border-dashed border-primary/40 bg-primary/5 p-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="text-sm">
            <span className="font-medium flex items-center gap-1">
              <Sparkles className="h-4 w-4 text-primary" /> Mode test
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Crée 4 bannières démo (une par emplacement) pour tester l'affichage.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" onClick={seedDemo} disabled={seeding}>
              <Sparkles className="h-3 w-3 mr-1" /> Générer démo
            </Button>
            <Button size="sm" variant="outline" onClick={clearDemo}>
              <Trash2 className="h-3 w-3 mr-1" /> Nettoyer
            </Button>
          </div>
        </div>
      </Card>

      {/* Stats summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Bannières actives</p>
          <p className="text-2xl font-bold">{items.filter((b) => b.active).length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Impressions totales</p>
          <p className="text-2xl font-bold text-emerald-600">{totalImpressions}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Emplacements occupés</p>
          <p className="text-2xl font-bold">
            {new Set(items.filter((b) => b.active && b.end_date >= todayISO()).map((b) => b.placement)).size}/4
          </p>
        </Card>
      </div>

      {/* Create form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nouvelle bannière</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Titre</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Emplacement</Label>
              <Select value={form.placement} onValueChange={(v) => setForm({ ...form, placement: v as AdPlacement })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PLACEMENT_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Sous-titre</Label>
              <Textarea
                rows={2}
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              />
            </div>
            <div>
              <Label>Partenaire associé (optionnel)</Label>
              <Select
                value={form.partner_id || "none"}
                onValueChange={(v) => setForm({ ...form, partner_id: v === "none" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Aucun —</SelectItem>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Image</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <Label>Texte du bouton</Label>
              <Input
                placeholder="Réserver, Voir le menu…"
                value={form.cta_label}
                onChange={(e) => setForm({ ...form, cta_label: e.target.value })}
              />
            </div>
            <div>
              <Label>URL du bouton</Label>
              <Input
                placeholder="https://…"
                value={form.cta_url}
                onChange={(e) => setForm({ ...form, cta_url: e.target.value })}
              />
            </div>
            <div>
              <Label>Date début</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <Label>Date fin (exclusivité)</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="visible-banner"
              checked={form.visible_to_guest}
              onCheckedChange={(v) => setForm({ ...form, visible_to_guest: v })}
            />
            <Label htmlFor="visible-banner" className="cursor-pointer">Visible aux invités dès création</Label>
          </div>
          <Button onClick={add} disabled={uploading}>
            <Plus className="h-4 w-4 mr-1" /> {uploading ? "Création…" : "Créer la bannière"}
          </Button>
        </CardContent>
      </Card>

      {/* List */}
      <div className="space-y-2">
        {items.map((b) => {
          const expired = b.end_date < todayISO();
          const upcoming = b.start_date > todayISO();
          const partnerName = partners.find((p) => p.id === b.partner_id)?.name;
          return (
            <Card key={b.id} className="p-3">
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="shrink-0 h-16 w-16 rounded-md bg-muted flex items-center justify-center overflow-hidden">
                  {b.image_url ? (
                    <img src={b.image_url} alt={b.title} className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{b.title}</span>
                    <Badge variant="outline" className="text-xs">{PLACEMENT_LABEL[b.placement]}</Badge>
                    {expired && <Badge variant="destructive" className="text-xs">Expirée</Badge>}
                    {upcoming && <Badge variant="secondary" className="text-xs">À venir</Badge>}
                    {!b.active && <Badge variant="outline" className="text-xs">Désactivée</Badge>}
                    {partnerName && <Badge variant="outline" className="text-xs">👤 {partnerName}</Badge>}
                  </div>
                  {b.subtitle && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{b.subtitle}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    Du {new Date(b.start_date).toLocaleDateString("fr-FR")} au {new Date(b.end_date).toLocaleDateString("fr-FR")}
                    {b.cta_label && ` · CTA "${b.cta_label}"`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                    <Eye className="h-3 w-3 mr-1" />
                    {impressionsByBanner[b.id] ?? 0} vues
                  </Badge>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={b.active}
                      onCheckedChange={(v) => update(b.id, { active: v })}
                      aria-label="Active"
                    />
                    <Button variant="ghost" size="sm" onClick={() => remove(b.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Aucune bannière. Crée-en une ou utilise le mode test pour démarrer.
          </p>
        )}
      </div>
    </div>
  );
}
