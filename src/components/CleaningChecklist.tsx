import { useEffect, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DEFAULT_ITEMS = [
  "Lits faits avec linge propre",
  "Salle de bain nettoyée",
  "Toilettes désinfectées",
  "Cuisine propre, vaisselle rangée",
  "Frigo vidé et essuyé",
  "Sols aspirés et lavés",
  "Poubelles vidées",
  "Serviettes propres déposées",
  "Produits de bienvenue",
  "Wifi affiché",
];

interface Item {
  id: string;
  label: string;
  done: boolean;
  sort_order: number;
}

export const CleaningChecklist = ({
  taskId,
  organizationId,
  canEdit,
  onAllDone,
}: {
  taskId: string;
  organizationId: string;
  canEdit: boolean;
  onAllDone?: (ok: boolean) => void;
}) => {
  const [items, setItems] = useState<Item[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from("cleaning_checklists")
      .select("id, label, done, sort_order")
      .eq("task_id", taskId)
      .order("sort_order");
    let list = (data ?? []) as Item[];
    if (list.length === 0) {
      // Seed defaults
      const rows = DEFAULT_ITEMS.map((label, i) => ({
        task_id: taskId,
        organization_id: organizationId,
        label,
        sort_order: i,
      }));
      const { data: inserted } = await supabase.from("cleaning_checklists").insert(rows).select("id, label, done, sort_order");
      list = (inserted ?? []) as Item[];
    }
    setItems(list);
    setLoading(false);
    onAllDone?.(list.length > 0 && list.every((it) => it.done));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [taskId]);

  const toggle = async (it: Item) => {
    const newDone = !it.done;
    setItems((prev) => {
      const next = prev.map((p) => p.id === it.id ? { ...p, done: newDone } : p);
      onAllDone?.(next.every((x) => x.done));
      return next;
    });
    const { error } = await supabase.from("cleaning_checklists").update({ done: newDone }).eq("id", it.id);
    if (error) toast.error(error.message);
  };

  const addItem = async () => {
    if (!newLabel.trim()) return;
    const { data, error } = await supabase
      .from("cleaning_checklists")
      .insert({ task_id: taskId, organization_id: organizationId, label: newLabel.trim(), sort_order: items.length })
      .select("id, label, done, sort_order")
      .single();
    if (error) { toast.error(error.message); return; }
    setItems((p) => [...p, data as Item]);
    setNewLabel("");
  };

  const remove = async (id: string) => {
    await supabase.from("cleaning_checklists").delete().eq("id", id);
    setItems((p) => p.filter((x) => x.id !== id));
  };

  if (loading) return null;
  const doneCount = items.filter((i) => i.done).length;

  return (
    <Card className="p-4 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Check className="h-4 w-4 text-primary" /> Checklist ménage
        </h3>
        <span className="text-sm text-muted-foreground">{doneCount}/{items.length}</span>
      </div>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-3 text-sm">
            <Checkbox checked={it.done} onCheckedChange={() => toggle(it)} id={`chk-${it.id}`} />
            <label htmlFor={`chk-${it.id}`} className={`flex-1 cursor-pointer ${it.done ? "line-through text-muted-foreground" : ""}`}>
              {it.label}
            </label>
            {canEdit && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(it.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="flex gap-2 mt-3">
          <Input
            placeholder="Ajouter un point…"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem())}
            maxLength={120}
          />
          <Button size="sm" onClick={addItem}><Plus className="h-4 w-4" /></Button>
        </div>
      )}
    </Card>
  );
};
