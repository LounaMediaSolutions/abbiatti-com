import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Minus, Trash2, Package, AlertTriangle, Pencil } from "lucide-react";

type Category = "linen" | "cleaning" | "consumable" | "equipment" | "other";
type Item = {
  id: string;
  property_id: string;
  organization_id: string;
  name: string;
  category: Category;
  quantity: number;
  unit: string;
  low_stock_threshold: number;
  notes: string | null;
};
type Property = { id: string; name: string };

const CATEGORIES: Category[] = ["linen", "cleaning", "consumable", "equipment", "other"];

export default function Inventory() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState<string>("");
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState({
    name: "",
    category: "linen" as Category,
    quantity: 0,
    unit: "unit",
    low_stock_threshold: 0,
    notes: "",
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
      if (!profile?.organization_id) return;
      setOrgId(profile.organization_id);
      const { data: props } = await supabase.from("properties").select("id, name").eq("organization_id", profile.organization_id).order("name");
      setProperties(props ?? []);
      if (props && props.length > 0) setPropertyId(props[0].id);
    })();
  }, [user]);

  const loadItems = async () => {
    if (!propertyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("property_id", propertyId)
      .order("category")
      .order("name");
    setItems((data as Item[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { loadItems(); }, [propertyId]);

  const filtered = useMemo(() => filter === "all" ? items : items.filter(i => i.category === filter), [items, filter]);
  const lowStockCount = useMemo(() => items.filter(i => i.quantity <= i.low_stock_threshold).length, [items]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", category: "linen", quantity: 0, unit: "unit", low_stock_threshold: 0, notes: "" });
    setDialogOpen(true);
  };
  const openEdit = (item: Item) => {
    setEditing(item);
    setForm({
      name: item.name,
      category: item.category,
      quantity: Number(item.quantity),
      unit: item.unit,
      low_stock_threshold: Number(item.low_stock_threshold),
      notes: item.notes ?? "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!orgId || !propertyId || !form.name.trim()) {
      toast.error(t("common.error"));
      return;
    }
    if (editing) {
      const { error } = await supabase.from("inventory_items").update({
        name: form.name,
        category: form.category,
        unit: form.unit,
        low_stock_threshold: form.low_stock_threshold,
        notes: form.notes || null,
      }).eq("id", editing.id);
      if (error) return toast.error(error.message);
      // If quantity changed, log adjustment
      if (Number(editing.quantity) !== form.quantity) {
        await supabase.from("inventory_movements").insert({
          organization_id: orgId,
          item_id: editing.id,
          type: "adjustment",
          quantity: form.quantity,
          reason: "Manual adjustment",
          created_by: user!.id,
        });
      }
      toast.success(t("inventory.updated"));
    } else {
      const { error } = await supabase.from("inventory_items").insert({
        organization_id: orgId,
        property_id: propertyId,
        name: form.name,
        category: form.category,
        quantity: form.quantity,
        unit: form.unit,
        low_stock_threshold: form.low_stock_threshold,
        notes: form.notes || null,
      });
      if (error) return toast.error(error.message);
      toast.success(t("inventory.created"));
    }
    setDialogOpen(false);
    loadItems();
  };

  const adjust = async (item: Item, delta: number) => {
    if (!orgId) return;
    const newQty = Number(item.quantity) + delta;
    if (newQty < 0) return;
    const { error } = await supabase.from("inventory_movements").insert({
      organization_id: orgId,
      item_id: item.id,
      type: delta > 0 ? "in" : "out",
      quantity: Math.abs(delta),
      created_by: user!.id,
    });
    if (error) return toast.error(error.message);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: newQty } : i));
  };

  const remove = async (item: Item) => {
    if (!confirm(t("inventory.deleteConfirm"))) return;
    const { error } = await supabase.from("inventory_items").delete().eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success(t("inventory.deleted"));
    loadItems();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-secondary">{t("inventory.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("inventory.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {lowStockCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> {lowStockCount} {t("inventory.lowStock")}
            </Badge>
          )}
          <Button onClick={openCreate} disabled={!propertyId}>
            <Plus className="h-4 w-4 mr-1" /> {t("inventory.addItem")}
          </Button>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">{t("inventory.property")}</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="all">{t("inventory.all")}</TabsTrigger>
            {CATEGORIES.map(c => (
              <TabsTrigger key={c} value={c}>{t(`inventory.cat.${c}`)}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </Card>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">{t("common.loading")}</p>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Package className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">{t("inventory.empty")}</p>
        </Card>
      ) : (
        <div className="grid gap-2">
          {filtered.map(item => {
            const low = Number(item.quantity) <= Number(item.low_stock_threshold);
            return (
              <Card key={item.id} className={`p-3 flex items-center gap-3 ${low ? "border-destructive/50" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{item.name}</span>
                    <Badge variant="outline" className="text-xs">{t(`inventory.cat.${item.category}`)}</Badge>
                    {low && <Badge variant="destructive" className="text-xs gap-1"><AlertTriangle className="h-3 w-3" />{t("inventory.lowStock")}</Badge>}
                  </div>
                  {item.notes && <p className="text-xs text-muted-foreground truncate">{item.notes}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => adjust(item, -1)}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <div className="min-w-[60px] text-center">
                    <div className="font-bold">{Number(item.quantity)}</div>
                    <div className="text-[10px] text-muted-foreground">{item.unit}</div>
                  </div>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => adjust(item, 1)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(item)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("inventory.editItem") : t("inventory.addItem")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("inventory.name")}</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Draps double, Liquide vaisselle..." />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t("inventory.category")}</Label>
                <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v as Category }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{t(`inventory.cat.${c}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("inventory.unit")}</Label>
                <Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="unit, kg, L..." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t("inventory.quantity")}</Label>
                <Input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>{t("inventory.threshold")}</Label>
                <Input type="number" value={form.low_stock_threshold} onChange={e => setForm(f => ({ ...f, low_stock_threshold: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <Label>{t("inventory.notes")}</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={save}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
