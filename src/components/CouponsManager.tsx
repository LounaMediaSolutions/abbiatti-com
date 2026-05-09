import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Gift, Pencil } from "lucide-react";
import { toast } from "sonner";

interface Coupon {
  id: string;
  partner_id: string;
  title: string;
  description: string | null;
  discount_label: string;
  terms: string | null;
  valid_from: string | null;
  valid_until: string | null;
  active: boolean;
  visible_to_guest: boolean;
}

const EMPTY = {
  title: "",
  description: "",
  discount_label: "",
  terms: "",
  valid_from: "",
  valid_until: "",
  active: true,
  visible_to_guest: true,
};

export function CouponsManager({
  orgId,
  partnerId,
  partnerName,
}: {
  orgId: string;
  partnerId: string;
  partnerName: string;
}) {
  const [items, setItems] = useState<Coupon[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [stats, setStats] = useState<Record<string, { claimed: number; redeemed: number }>>({});

  const load = async () => {
    const { data } = await supabase
      .from("partner_coupons")
      .select("*")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as Coupon[];
    setItems(list);

    if (list.length > 0) {
      const { data: reds } = await supabase
        .from("coupon_redemptions")
        .select("coupon_id,status")
        .in("coupon_id", list.map((c) => c.id));
      const s: Record<string, { claimed: number; redeemed: number }> = {};
      list.forEach((c) => (s[c.id] = { claimed: 0, redeemed: 0 }));
      (reds ?? []).forEach((r: any) => {
        if (!s[r.coupon_id]) s[r.coupon_id] = { claimed: 0, redeemed: 0 };
        s[r.coupon_id].claimed += 1;
        if (r.status === "redeemed") s[r.coupon_id].redeemed += 1;
      });
      setStats(s);
    }
  };

  useEffect(() => {
    void load();
  }, [partnerId]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setOpen(true);
  };

  const openEdit = (c: Coupon) => {
    setEditing(c);
    setForm({
      title: c.title,
      description: c.description ?? "",
      discount_label: c.discount_label,
      terms: c.terms ?? "",
      valid_from: c.valid_from ?? "",
      valid_until: c.valid_until ?? "",
      active: c.active,
      visible_to_guest: c.visible_to_guest,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.discount_label.trim()) {
      return toast.error("Titre et libellé de réduction requis");
    }
    const payload = {
      organization_id: orgId,
      partner_id: partnerId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      discount_label: form.discount_label.trim(),
      terms: form.terms.trim() || null,
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
      active: form.active,
      visible_to_guest: form.visible_to_guest,
    };
    const { error } = editing
      ? await supabase.from("partner_coupons").update(payload).eq("id", editing.id)
      : await supabase.from("partner_coupons").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Coupon modifié" : "Coupon créé");
    setOpen(false);
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer ce coupon ? Les réclamations existantes seront aussi supprimées.")) return;
    const { error } = await supabase.from("partner_coupons").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  return (
    <div className="space-y-2 mt-3 pt-3 border-t">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Gift className="h-4 w-4 text-primary" />
          Coupons ({items.length})
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" onClick={openNew}>
              <Plus className="h-3 w-3 mr-1" /> Coupon
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Modifier le coupon" : "Nouveau coupon"} · {partnerName}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Titre</Label>
                <Input
                  placeholder="Ex: Menu découverte"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div>
                <Label>Réduction (affichée en gros)</Label>
                <Input
                  placeholder="Ex: -20% ou Cocktail offert"
                  value={form.discount_label}
                  onChange={(e) => setForm({ ...form, discount_label: e.target.value })}
                />
              </div>
              <div>
                <Label>Description (optionnel)</Label>
                <Textarea
                  placeholder="Détails de l'offre…"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div>
                <Label>Conditions (optionnel)</Label>
                <Textarea
                  placeholder="Ex: Hors boissons, sur présentation à l'arrivée"
                  value={form.terms}
                  onChange={(e) => setForm({ ...form, terms: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valide du</Label>
                  <Input
                    type="date"
                    value={form.valid_from}
                    onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Valide jusqu'au</Label>
                  <Input
                    type="date"
                    value={form.valid_until}
                    onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Switch
                  checked={form.visible_to_guest}
                  onCheckedChange={(v) => setForm({ ...form, visible_to_guest: v })}
                />
                <Label className="cursor-pointer">Visible dans le portail invité</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.active}
                  onCheckedChange={(v) => setForm({ ...form, active: v })}
                />
                <Label className="cursor-pointer">Actif</Label>
              </div>
              <Button onClick={save} className="w-full">
                {editing ? "Enregistrer" : "Créer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 && (
        <p className="text-xs text-muted-foreground italic">Aucun coupon pour ce partenaire.</p>
      )}

      <div className="space-y-1.5">
        {items.map((c) => {
          const s = stats[c.id] ?? { claimed: 0, redeemed: 0 };
          const conversion = s.claimed > 0 ? Math.round((s.redeemed / s.claimed) * 100) : 0;
          const expired = c.valid_until && new Date(c.valid_until) < new Date();
          return (
            <Card key={c.id} className="p-2.5 bg-muted/30">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{c.title}</span>
                    <Badge variant="secondary" className="text-xs">{c.discount_label}</Badge>
                    {!c.active && <Badge variant="outline" className="text-xs">Inactif</Badge>}
                    {expired && <Badge variant="destructive" className="text-xs">Expiré</Badge>}
                    {!c.visible_to_guest && <Badge variant="outline" className="text-xs">Masqué</Badge>}
                  </div>
                  {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                  <div className="text-xs mt-1 flex gap-3">
                    <span><strong>{s.claimed}</strong> réclamés</span>
                    <span className="text-emerald-600"><strong>{s.redeemed}</strong> utilisés</span>
                    {s.claimed > 0 && (
                      <span className={conversion >= 50 ? "text-emerald-600" : "text-amber-600"}>
                        {conversion}% conversion
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(c)} className="h-7 w-7 p-0">
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(c.id)} className="h-7 w-7 p-0">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
