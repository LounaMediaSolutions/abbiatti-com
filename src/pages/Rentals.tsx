import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Sparkles } from "lucide-react";

type RentalCategory = "baby" | "beach" | "tech" | "mobility" | "outdoor" | "service" | "other";

type RentalItem = {
  id: string;
  organization_id: string;
  name: string;
  category: RentalCategory;
  price_day: number | null;
  price_week: number | null;
  price_stay: number | null;
  deposit: number | null;
  purchase_cost: number | null;
  priority: number;
  notes: string | null;
  active: boolean;
  sort_order: number;
};

const CATEGORIES: { value: RentalCategory; emoji: string }[] = [
  { value: "baby", emoji: "👶" },
  { value: "beach", emoji: "🏖️" },
  { value: "tech", emoji: "📡" },
  { value: "mobility", emoji: "🚲" },
  { value: "outdoor", emoji: "⛰️" },
  { value: "service", emoji: "🛎️" },
  { value: "other", emoji: "📦" },
];

const SEED: Omit<RentalItem, "id" | "organization_id">[] = [
  // BABY
  { name: "Siège auto bébé", category: "baby", price_day: 7, price_week: 25, price_stay: 35, deposit: 50, purchase_cost: 50, priority: 5, notes: "Incontournable - rares à louer ailleurs", active: true, sort_order: 1 },
  { name: "Lit parapluie / Travel crib", category: "baby", price_day: 5, price_week: 25, price_stay: 35, deposit: 50, purchase_cost: 70, priority: 5, notes: "Familles avec bébés - rentable en 2-3 locations", active: true, sort_order: 2 },
  { name: "Chaise haute pliable", category: "baby", price_day: 3, price_week: 15, price_stay: 20, deposit: 20, purchase_cost: 40, priority: 4, notes: "Pack famille avec lit parapluie", active: true, sort_order: 3 },
  { name: "Pack Famille Complet (3 articles)", category: "baby", price_day: 12, price_week: 55, price_stay: 75, deposit: 100, purchase_cost: null, priority: 5, notes: "Bundle siège + lit + chaise haute", active: true, sort_order: 4 },
  // BEACH
  { name: "Set Plage (parasol + 2 chaises)", category: "beach", price_day: 8, price_week: 35, price_stay: 50, deposit: 50, purchase_cost: 80, priority: 5, notes: "Demande extrême en été", active: true, sort_order: 10 },
  { name: "Glacière portable", category: "beach", price_day: 3, price_week: 12, price_stay: 20, deposit: null, purchase_cost: 20, priority: 4, notes: "Souvent loué avec set plage", active: true, sort_order: 11 },
  { name: "Set Masque + Tuba (adulte)", category: "beach", price_day: 5, price_week: 15, price_stay: 20, deposit: 20, purchase_cost: 15, priority: 4, notes: "Investissement faible, marge énorme", active: true, sort_order: 12 },
  { name: "Set Masque + Tuba (enfant)", category: "beach", price_day: 3, price_week: 10, price_stay: 15, deposit: 20, purchase_cost: 10, priority: 4, notes: "Idéal pour familles", active: true, sort_order: 13 },
  { name: "Pack Plage Complet", category: "beach", price_day: 15, price_week: 60, price_stay: 85, deposit: 80, purchase_cost: null, priority: 5, notes: "Bundle plage + glacière + 2 sets snorkel", active: true, sort_order: 14 },
  { name: "Scooter sous-marin", category: "beach", price_day: 15, price_week: 80, price_stay: 100, deposit: 150, purchase_cost: 350, priority: 3, notes: "Phase 2 - fort potentiel", active: true, sort_order: 15 },
  { name: "Planche de paddle (SUP)", category: "beach", price_day: 20, price_week: 100, price_stay: 150, deposit: 200, purchase_cost: 500, priority: 3, notes: "Phase 3 - public premium", active: true, sort_order: 16 },
  // TECH
  { name: "Router Wi-Fi portable Ooredoo", category: "tech", price_day: 5, price_week: 25, price_stay: 35, deposit: 50, purchase_cost: 40, priority: 4, notes: "Inclut data Ooredoo", active: true, sort_order: 20 },
  { name: "GoPro / Caméra d'action", category: "tech", price_day: 15, price_week: 70, price_stay: 90, deposit: 200, purchase_cost: 250, priority: 3, notes: "Avec accessoires waterproof", active: true, sort_order: 21 },
  { name: "Enceinte Bluetooth waterproof", category: "tech", price_day: 5, price_week: 20, price_stay: 30, deposit: 50, purchase_cost: 60, priority: 3, notes: "JBL Charge ou similaire", active: true, sort_order: 22 },
  { name: "Trépied + Light kit", category: "tech", price_day: 5, price_week: 20, price_stay: 30, deposit: 30, purchase_cost: 40, priority: 2, notes: "Pour créateurs de contenu", active: true, sort_order: 23 },
  // MOBILITY
  { name: "Vélo de ville (1 pièce)", category: "mobility", price_day: 10, price_week: 50, price_stay: 70, deposit: 100, purchase_cost: 250, priority: 3, notes: "2 vélos recommandés - Phase 3", active: true, sort_order: 30 },
  { name: "Pack 2 vélos", category: "mobility", price_day: 18, price_week: 90, price_stay: 130, deposit: 200, purchase_cost: null, priority: 3, notes: "Couples / familles", active: true, sort_order: 31 },
  // OUTDOOR
  { name: "Pack pique-nique (panier + nappe)", category: "outdoor", price_day: 5, price_week: 20, price_stay: 30, deposit: 20, purchase_cost: 60, priority: 2, notes: "Sorties nature, Yemma Gouraya", active: true, sort_order: 40 },
  { name: "Sac à dos randonnée", category: "outdoor", price_day: 5, price_week: 20, price_stay: 30, deposit: 30, purchase_cost: 50, priority: 2, notes: "Pour Tikjda, Cap Carbon", active: true, sort_order: 41 },
  // SERVICES
  { name: "Transfert aéroport", category: "service", price_day: 25, price_week: null, price_stay: null, deposit: null, purchase_cost: 0, priority: 4, notes: "Partenariat chauffeur - €5-10 commission", active: true, sort_order: 50 },
  { name: "Panier d'accueil / frigo rempli", category: "service", price_day: 40, price_week: null, price_stay: null, deposit: null, purchase_cost: 0, priority: 4, notes: "Marge 40-50% - achats Ritaj Mall", active: true, sort_order: 51 },
  { name: "Massage à domicile", category: "service", price_day: 50, price_week: null, price_stay: null, deposit: null, purchase_cost: 0, priority: 3, notes: "Partenariat masseur - commission €15-20", active: true, sort_order: 52 },
  { name: "Service de courses", category: "service", price_day: 10, price_week: null, price_stay: null, deposit: null, purchase_cost: 0, priority: 3, notes: "Pour longs séjours / familles", active: true, sort_order: 53 },
  { name: "Excursion guidée (journée)", category: "service", price_day: 30, price_week: null, price_stay: null, deposit: null, purchase_cost: 0, priority: 2, notes: "Yemma Gouraya, Cap Carbon, Tikjda", active: true, sort_order: 54 },
  { name: "Cuisinier privé (dîner)", category: "service", price_day: 100, price_week: null, price_stay: null, deposit: null, purchase_cost: 0, priority: 2, notes: "Soirée spéciale - partenariat chef", active: true, sort_order: 55 },
  { name: "Lit / matelas supplémentaire", category: "service", price_day: 5, price_week: null, price_stay: null, deposit: null, purchase_cost: 30, priority: 2, notes: "Pour 7e voyageur", active: true, sort_order: 56 },
];

const empty: Partial<RentalItem> = {
  name: "", category: "other", price_day: null, price_week: null, price_stay: null,
  deposit: null, purchase_cost: null, priority: 3, notes: "", active: true, sort_order: 100,
};

const fmt = (v: number | null | undefined) => (v == null ? "—" : `€${v}`);
const fire = (n: number) => "🔥".repeat(Math.max(1, Math.min(5, n)));

export default function Rentals() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RentalItem | null>(null);
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("all");

  const { data: orgId } = useQuery({
    queryKey: ["myOrg", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("organization_id").eq("id", user!.id).single();
      return data?.organization_id as string;
    },
    enabled: !!user,
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["rental_items"],
    queryFn: async () => {
      const { data } = await supabase.from("rental_items").select("*").order("sort_order");
      return (data ?? []) as RentalItem[];
    },
  });

  // Seed once
  useEffect(() => {
    if (!orgId || isLoading || items.length > 0) return;
    (async () => {
      const rows = SEED.map((s) => ({ ...s, organization_id: orgId }));
      await supabase.from("rental_items").insert(rows);
      qc.invalidateQueries({ queryKey: ["rental_items"] });
    })();
  }, [orgId, items.length, isLoading, qc]);

  const upsert = useMutation({
    mutationFn: async (r: Partial<RentalItem>) => {
      if (r.id) {
        const { error } = await supabase.from("rental_items").update(r as never).eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rental_items").insert({ ...r, organization_id: orgId } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental_items"] });
      toast.success(t("common.save"));
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rental_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental_items"] });
      toast.success(t("common.deleted", "Deleted"));
      setDeleteId(null);
    },
  });

  const toggleActive = (it: RentalItem) =>
    upsert.mutate({ id: it.id, active: !it.active });

  const filtered = useMemo(
    () => (tab === "all" ? items : items.filter((i) => i.category === tab)),
    [items, tab]
  );

  const stats = useMemo(() => {
    const totalInvest = items.reduce((s, i) => s + (i.purchase_cost ?? 0), 0);
    const dailyPotential = items.filter((i) => i.active).reduce((s, i) => s + (i.price_day ?? 0), 0);
    return { totalInvest, dailyPotential, count: items.length };
  }, [items]);

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (it: RentalItem) => { setEditing(it); setOpen(true); };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> {t("rentals.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("rentals.subtitle")}</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> {t("rentals.add")}</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">{t("rentals.itemsCount")}</p><p className="text-2xl font-bold">{stats.count}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">{t("rentals.invest")}</p><p className="text-2xl font-bold">€{stats.totalInvest}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">{t("rentals.dailyPotential")}</p><p className="text-2xl font-bold">€{stats.dailyPotential}</p></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">{t("rentals.all")}</TabsTrigger>
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c.value} value={c.value}>{c.emoji} {t(`rentals.cat.${c.value}`)}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : filtered.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-muted-foreground mb-3">{t("rentals.empty")}</p>
              <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />{t("rentals.add")}</Button>
            </Card>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                    <th className="p-2">{t("rentals.name")}</th>
                    <th className="p-2 text-right">{t("rentals.day")}</th>
                    <th className="p-2 text-right">{t("rentals.week")}</th>
                    <th className="p-2 text-right">{t("rentals.stay")}</th>
                    <th className="p-2 text-right">{t("rentals.deposit")}</th>
                    <th className="p-2 text-right">{t("rentals.cost")}</th>
                    <th className="p-2">{t("rentals.priority")}</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const cat = CATEGORIES.find((c) => c.value === it.category);
                    return (
                      <tr key={it.id} className={`border-b hover:bg-muted/30 ${!it.active ? "opacity-50" : ""}`}>
                        <td className="p-2">
                          <div className="font-medium flex items-center gap-1">{cat?.emoji} {it.name}</div>
                          {it.notes && <div className="text-xs text-muted-foreground">{it.notes}</div>}
                        </td>
                        <td className="p-2 text-right font-mono">{fmt(it.price_day)}</td>
                        <td className="p-2 text-right font-mono">{fmt(it.price_week)}</td>
                        <td className="p-2 text-right font-mono">{fmt(it.price_stay)}</td>
                        <td className="p-2 text-right font-mono text-muted-foreground">{fmt(it.deposit)}</td>
                        <td className="p-2 text-right font-mono text-muted-foreground">{fmt(it.purchase_cost)}</td>
                        <td className="p-2"><Badge variant="outline">{fire(it.priority)}</Badge></td>
                        <td className="p-2">
                          <div className="flex items-center justify-end gap-1">
                            <Switch checked={it.active} onCheckedChange={() => toggleActive(it)} />
                            <Button size="sm" variant="ghost" onClick={() => openEdit(it)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeleteId(it.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ItemDialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}
        item={editing}
        onSave={(r) => upsert.mutate(r)}
      />

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("rentals.deleteConfirm")}</DialogTitle></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => deleteId && remove.mutate(deleteId)}>{t("common.delete", "Delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ItemDialog({ open, onOpenChange, item, onSave }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: RentalItem | null;
  onSave: (r: Partial<RentalItem>) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Partial<RentalItem>>(empty);

  useEffect(() => {
    setForm(item ?? empty);
  }, [item, open]);

  const num = (v: string) => (v === "" ? null : Number(v));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? t("rentals.edit") : t("rentals.add")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("rentals.name")}</Label>
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>{t("rentals.category")}</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as RentalCategory })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.emoji} {t(`rentals.cat.${c.value}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("rentals.priority")} (1-5)</Label>
              <Input type="number" min={1} max={5} value={form.priority ?? 3} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>{t("rentals.day")}</Label><Input type="number" step="0.5" value={form.price_day ?? ""} onChange={(e) => setForm({ ...form, price_day: num(e.target.value) })} /></div>
            <div><Label>{t("rentals.week")}</Label><Input type="number" step="0.5" value={form.price_week ?? ""} onChange={(e) => setForm({ ...form, price_week: num(e.target.value) })} /></div>
            <div><Label>{t("rentals.stay")}</Label><Input type="number" step="0.5" value={form.price_stay ?? ""} onChange={(e) => setForm({ ...form, price_stay: num(e.target.value) })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>{t("rentals.deposit")}</Label><Input type="number" step="0.5" value={form.deposit ?? ""} onChange={(e) => setForm({ ...form, deposit: num(e.target.value) })} /></div>
            <div><Label>{t("rentals.cost")}</Label><Input type="number" step="0.5" value={form.purchase_cost ?? ""} onChange={(e) => setForm({ ...form, purchase_cost: num(e.target.value) })} /></div>
          </div>
          <div>
            <Label>{t("rentals.notes")}</Label>
            <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.active ?? true} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            <Label>{t("rentals.active")}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => onSave(form)} disabled={!form.name}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
