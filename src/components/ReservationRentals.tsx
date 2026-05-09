import { useEffect, useState } from "react";
import { Package, Plus, Check, Undo2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RentalItem { id: string; name: string; price_day: number | null; }
interface ReservationRental {
  id: string;
  rental_item_id: string;
  quantity: number;
  delivered_at: string | null;
  returned_at: string | null;
  notes: string | null;
}

export const ReservationRentals = ({
  reservationId,
  organizationId,
  canEdit,
}: {
  reservationId: string;
  organizationId: string;
  canEdit: boolean;
}) => {
  const [items, setItems] = useState<ReservationRental[]>([]);
  const [catalog, setCatalog] = useState<RentalItem[]>([]);
  const [picking, setPicking] = useState<string>("");
  const [qty, setQty] = useState(1);

  const load = async () => {
    const [{ data: rentals }, { data: cat }] = await Promise.all([
      supabase.from("reservation_rentals").select("*").eq("reservation_id", reservationId),
      supabase.from("rental_items").select("id, name, price_day").eq("organization_id", organizationId).eq("active", true).order("name"),
    ]);
    setItems((rentals ?? []) as ReservationRental[]);
    setCatalog((cat ?? []) as RentalItem[]);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [reservationId]);

  const add = async () => {
    if (!picking) return;
    const { error } = await supabase.from("reservation_rentals").insert({
      reservation_id: reservationId,
      rental_item_id: picking,
      organization_id: organizationId,
      quantity: qty,
    });
    if (error) { toast.error(error.message); return; }
    setPicking(""); setQty(1);
    load();
  };

  const markDelivered = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("reservation_rentals").update({
      delivered_at: new Date().toISOString(),
      delivered_by: user?.id,
    }).eq("id", id);
    toast.success("Livraison confirmée ✅");
    load();
  };

  const markReturned = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("reservation_rentals").update({
      returned_at: new Date().toISOString(),
      returned_by: user?.id,
    }).eq("id", id);
    toast.success("Retour confirmé ✅");
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("reservation_rentals").delete().eq("id", id);
    load();
  };

  const nameOf = (id: string) => catalog.find((c) => c.id === id)?.name ?? "—";

  return (
    <Card className="p-4 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <Package className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Équipements loués au guest</h3>
        <Badge variant="outline" className="ml-auto">{items.length}</Badge>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-3">Aucun équipement attribué.</p>
      ) : (
        <ul className="space-y-2 mb-3">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/40 flex-wrap">
              <span className="text-sm font-medium flex-1 min-w-0 truncate">
                {nameOf(it.rental_item_id)} <span className="text-muted-foreground">×{it.quantity}</span>
              </span>
              {it.delivered_at ? (
                <Badge className="bg-emerald-500 text-white text-[10px]">Livré</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">À livrer</Badge>
              )}
              {it.returned_at && <Badge className="bg-blue-500 text-white text-[10px]">Récupéré</Badge>}
              <div className="flex gap-1">
                {!it.delivered_at && (
                  <Button size="sm" variant="outline" className="h-7" onClick={() => markDelivered(it.id)}>
                    <Check className="h-3 w-3 mr-1" /> Livrer
                  </Button>
                )}
                {it.delivered_at && !it.returned_at && (
                  <Button size="sm" variant="outline" className="h-7" onClick={() => markReturned(it.id)}>
                    <Undo2 className="h-3 w-3 mr-1" /> Retour
                  </Button>
                )}
                {canEdit && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(it.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit && catalog.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <Select value={picking} onValueChange={setPicking}>
            <SelectTrigger className="flex-1 min-w-[140px]"><SelectValue placeholder="Choisir un équipement" /></SelectTrigger>
            <SelectContent>
              {catalog.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)} className="w-20" />
          <Button size="sm" onClick={add} disabled={!picking}><Plus className="h-4 w-4 mr-1" /> Ajouter</Button>
        </div>
      )}
    </Card>
  );
};
