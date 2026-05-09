import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Crown, Star, Calendar } from "lucide-react";
import { toast } from "sonner";
import { CouponsManager } from "./CouponsManager";
import { PartnerPerformance } from "./PartnerPerformance";
import { BannersManager } from "./BannersManager";

type Tier = "gold" | "silver" | "standard";

interface Partner {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  price: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  whatsapp_phone: string | null;
  website_url: string | null;
  tier: Tier;
  visible_to_guest: boolean;
  active: boolean;
  subscription_active: boolean;
  subscription_until: string | null;
}

const EMPTY_FORM = {
  name: "",
  category: "",
  description: "",
  price: "",
  contact_phone: "",
  contact_email: "",
  whatsapp_phone: "",
  website_url: "",
  tier: "standard" as Tier,
  visible_to_guest: false,
};

const TIER_META: Record<Tier, { label: string; className: string; icon: JSX.Element }> = {
  gold: {
    label: "Gold",
    className: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400",
    icon: <Crown className="h-3 w-3" />,
  },
  silver: {
    label: "Silver",
    className: "bg-slate-400/15 text-slate-700 border-slate-400/30 dark:text-slate-300",
    icon: <Star className="h-3 w-3" />,
  },
  standard: {
    label: "Standard",
    className: "bg-muted text-muted-foreground border-border",
    icon: <></>,
  },
};

const tierRank: Record<Tier, number> = { gold: 0, silver: 1, standard: 2 };

export function PartnersTab({ orgId }: { orgId: string }) {
  const [items, setItems] = useState<Partner[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const load = async () => {
    const { data } = await supabase
      .from("partner_services")
      .select("*")
      .eq("organization_id", orgId)
      .order("sort_order", { ascending: true });
    const list = ((data ?? []) as Partner[]).slice().sort((a, b) => {
      const ra = tierRank[a.tier ?? "standard"] ?? 99;
      const rb = tierRank[b.tier ?? "standard"] ?? 99;
      return ra - rb;
    });
    setItems(list);
  };
  useEffect(() => { void load(); }, [orgId]);

  const add = async () => {
    if (!form.name.trim()) return toast.error("Nom requis");
    const { error } = await supabase.from("partner_services").insert({
      organization_id: orgId,
      ...form,
    });
    if (error) return toast.error(error.message);
    setForm({ ...EMPTY_FORM });
    toast.success("Partenaire ajouté");
    void load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("partner_services").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  const update = async (id: string, patch: Partial<Partner>) => {
    const { error } = await supabase.from("partner_services").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  return (
    <Tabs defaultValue="manage" className="space-y-4">
      <TabsList className="grid grid-cols-3 w-full max-w-xl">
        <TabsTrigger value="manage">Gestion</TabsTrigger>
        <TabsTrigger value="banners">Bannières</TabsTrigger>
        <TabsTrigger value="performance">Performance</TabsTrigger>
      </TabsList>

      <TabsContent value="banners">
        <BannersManager orgId={orgId} />
      </TabsContent>

      <TabsContent value="performance">
        <PartnerPerformance orgId={orgId} />
      </TabsContent>

      <TabsContent value="manage" className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Ajouter un partenaire</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Catégorie</Label><Input placeholder="Restaurant, Taxi, Spa..." value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
              <div><Label>Téléphone</Label><Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
              <div><Label>WhatsApp (optionnel)</Label><Input placeholder="+33612345678" value={form.whatsapp_phone} onChange={(e) => setForm({ ...form, whatsapp_phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
              <div><Label>Site web / Menu</Label><Input placeholder="https://…" value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} /></div>
              <div><Label>Tarif</Label><Input placeholder="à partir de 30€" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              <div>
                <Label>Niveau</Label>
                <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v as Tier })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gold">⭐ Gold</SelectItem>
                    <SelectItem value="silver">Silver</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="flex items-center gap-3 pt-2">
              <Switch
                id="visible-new"
                checked={form.visible_to_guest}
                onCheckedChange={(v) => setForm({ ...form, visible_to_guest: v })}
              />
              <Label htmlFor="visible-new" className="cursor-pointer">Afficher dans le portail invité</Label>
            </div>
            <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> Ajouter</Button>
          </CardContent>
        </Card>

        <div className="space-y-2">
          {items.map((p) => {
            const tier = TIER_META[p.tier];
            const subExpiringSoon =
              p.subscription_until && new Date(p.subscription_until).getTime() - Date.now() < 14 * 24 * 3600 * 1000;
            return (
              <Card key={p.id} className="p-3 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{p.name}</span>
                      <Badge variant="outline" className={`gap-1 ${tier.className}`}>
                        {tier.icon} {tier.label}
                      </Badge>
                      {p.category && <Badge variant="outline">{p.category}</Badge>}
                      {p.visible_to_guest && (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400">
                          Visible invités
                        </Badge>
                      )}
                      {p.subscription_active && (
                        <Badge
                          variant="outline"
                          className={subExpiringSoon
                            ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
                            : "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"}
                        >
                          <Calendar className="h-3 w-3 mr-1" />
                          Abo {p.subscription_until ? `→ ${new Date(p.subscription_until).toLocaleDateString("fr-FR")}` : "actif"}
                        </Badge>
                      )}
                    </div>
                    {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
                    <p className="text-xs mt-1">
                      {[p.price, p.contact_phone, p.whatsapp_phone && `WhatsApp ${p.whatsapp_phone}`, p.contact_email, p.website_url]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex gap-2 items-center shrink-0 flex-wrap">
                    <Select value={p.tier} onValueChange={(v) => update(p.id, { tier: v as Tier })}>
                      <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gold">⭐ Gold</SelectItem>
                        <SelectItem value="silver">Silver</SelectItem>
                        <SelectItem value="standard">Standard</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch
                      checked={p.visible_to_guest}
                      onCheckedChange={(v) => update(p.id, { visible_to_guest: v })}
                      aria-label="Visible aux invités"
                    />
                    <Button variant="outline" size="sm" onClick={() => update(p.id, { active: !p.active })}>
                      {p.active ? "Désactiver" : "Activer"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Subscription controls */}
                <div className="flex flex-wrap items-center gap-3 pt-2 border-t text-sm">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={p.subscription_active}
                      onCheckedChange={(v) => update(p.id, { subscription_active: v })}
                    />
                    <Label className="cursor-pointer text-xs">Abonnement actif</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">Expire le</Label>
                    <Input
                      type="date"
                      className="h-8 w-[150px]"
                      value={p.subscription_until ?? ""}
                      onChange={(e) => update(p.id, { subscription_until: e.target.value || null })}
                    />
                  </div>
                </div>

                {/* Coupons inline */}
                <CouponsManager orgId={orgId} partnerId={p.id} partnerName={p.name} />
              </Card>
            );
          })}
          {items.length === 0 && <p className="text-sm text-muted-foreground">Aucun partenaire.</p>}
        </div>
      </TabsContent>
    </Tabs>
  );
}
