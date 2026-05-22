import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Home, MapPin, Pencil, Plus, Trash2, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const PROPERTY_TYPES = ["apartment", "house", "villa", "studio", "room", "other"];

type OrgProperty = {
  id: string;
  name: string;
  property_type: string | null;
  city: string | null;
  country: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  max_guests: number | null;
};

type FormState = {
  name: string;
  property_type: string;
  city: string;
  country: string;
  bedrooms: number;
  bathrooms: number;
  max_guests: number;
};

const emptyForm: FormState = {
  name: "",
  property_type: "apartment",
  city: "",
  country: "",
  bedrooms: 1,
  bathrooms: 1,
  max_guests: 2,
};

const ORG_PROPERTY_OPTIONAL_COLUMNS = [
  "property_type",
  "city",
  "country",
  "bedrooms",
  "bathrooms",
  "max_guests",
  "submitted_by",
] as const;

const missingOrgPropertyColumns = new Set<string>();

const extractMissingPropertyColumn = (error: { message?: string } | null | undefined) => {
  const message = error?.message ?? "";
  const schemaCacheMatch = message.match(/'([^']+)' column of 'properties'/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];

  const postgresMatch = message.match(/column properties\.([a-z_]+)/i);
  return postgresMatch?.[1] ?? null;
};

// The generated Supabase types are intentionally out of sync with the live
// `properties` schema (extra columns like property_type / max_guests), so we
// access the table through an untyped client — exactly as Properties.tsx does.
const sb = supabase as unknown as {
  from: (table: string) => any;
};

export function OrgPropertiesTab({
  orgId,
  onChanged,
}: {
  orgId: string;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<OrgProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState<OrgProperty | null>(null);

  // Add-existing-property picker
  const [addOpen, setAddOpen] = useState(false);
  const [available, setAvailable] = useState<{ id: string; name: string; orgName: string }[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<string>("");

  const buildPropertySelect = () => {
    const columns = ["id", "name"];
    for (const column of ORG_PROPERTY_OPTIONAL_COLUMNS) {
      if (column !== "submitted_by" && !missingOrgPropertyColumns.has(column)) {
        columns.push(column);
      }
    }
    return columns.join(", ");
  };

  const withPropertySchemaFallback = async <T,>(
    run: (payload: Record<string, unknown>) => Promise<{ data?: T; error?: { message?: string } | null }>,
    payload: Record<string, unknown>,
  ) => {
    let nextPayload = { ...payload };

    while (true) {
      const result = await run(nextPayload);
      const missingColumn = extractMissingPropertyColumn(result.error);
      if (!missingColumn || !(missingColumn in nextPayload)) return result;
      missingOrgPropertyColumns.add(missingColumn);
      delete nextPayload[missingColumn];
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      let result = await sb
        .from("properties")
        .select(buildPropertySelect())
        .eq("org_id", orgId)
        .order("name");

      while (result.error) {
        const missingColumn = extractMissingPropertyColumn(result.error);
        if (!missingColumn) throw result.error;
        missingOrgPropertyColumns.add(missingColumn);
        result = await sb
          .from("properties")
          .select(buildPropertySelect())
          .eq("org_id", orgId)
          .order("name");
      }

      const { data } = result;
      setItems((data ?? []) as OrgProperty[]);
    } catch (e: unknown) {
      toast({
        title: t("common.error"),
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orgId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Open the picker and load every property that is NOT already in this org,
  // along with its current organization name so it's clear where it comes from.
  const openAdd = async () => {
    setSelectedToAdd("");
    setAddOpen(true);
    setLoadingAvailable(true);
    try {
      const [propsRes, orgsRes] = await Promise.all([
        sb.from("properties").select("id, name, org_id").order("name"),
        sb.from("organizations").select("id, name"),
      ]);
      if (propsRes.error) throw propsRes.error;
      const orgMap = new Map<string, string>(
        ((orgsRes.data ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name]),
      );
      const unassignedLabel = t("properties.cohostAssign.unassigned", {
        defaultValue: "— Unassigned —",
      });
      setAvailable(
        ((propsRes.data ?? []) as { id: string; name: string; org_id: string | null }[])
          .filter((p) => p.org_id !== orgId)
          .map((p) => ({
            id: p.id,
            name: p.name,
            orgName: p.org_id ? orgMap.get(p.org_id) ?? "—" : unassignedLabel,
          })),
      );
    } catch (e: unknown) {
      toast({
        title: t("common.error"),
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setLoadingAvailable(false);
    }
  };

  // Attach an existing property to this org by reassigning its org_id.
  const assign = async () => {
    if (!selectedToAdd) return;
    setBusy(true);
    try {
      const { error } = await sb
        .from("properties")
        .update({ org_id: orgId })
        .eq("id", selectedToAdd);
      if (error) throw error;
      toast({
        title: t("orgProperties.added", { defaultValue: "Property added to organization" }),
      });
      setAddOpen(false);
      load();
      onChanged?.();
    } catch (e: unknown) {
      toast({
        title: t("common.error"),
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (p: OrgProperty) => {
    setEditingId(p.id);
    setForm({
      name: p.name ?? "",
      property_type: p.property_type ?? "apartment",
      city: p.city ?? "",
      country: p.country ?? "",
      bedrooms: p.bedrooms ?? 0,
      bathrooms: p.bathrooms ?? 0,
      max_guests: p.max_guests ?? 0,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      return toast({
        title: t("common.error"),
        description: t("orgProperties.nameRequired", { defaultValue: "Name is required" }),
        variant: "destructive",
      });
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        property_type: form.property_type,
        city: form.city.trim() || null,
        country: form.country.trim() || null,
        bedrooms: form.bedrooms,
        bathrooms: form.bathrooms,
        max_guests: form.max_guests,
      };
      if (editingId) {
        const { error } = await withPropertySchemaFallback(
          async (nextPayload) => sb.from("properties").update(nextPayload).eq("id", editingId),
          payload,
        );
        if (error) throw error;
        toast({ title: t("properties.updated", { defaultValue: "Property updated" }) });
      } else {
        const insertPayload = {
          ...payload,
          org_id: orgId,
          submitted_by: user?.id ?? null,
        };
        const { error } = await withPropertySchemaFallback(
          async (nextPayload) => sb.from("properties").insert([nextPayload]),
          insertPayload,
        );
        if (error) throw error;
        toast({ title: t("properties.created", { defaultValue: "Property created" }) });
      }
      setDialogOpen(false);
      load();
      onChanged?.();
    } catch (e: unknown) {
      toast({
        title: t("common.error"),
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      const { error } = await sb.from("properties").delete().eq("id", confirmDelete.id);
      if (error) throw error;
      toast({ title: t("properties.deleted", { defaultValue: "Property deleted" }) });
      setConfirmDelete(null);
      load();
      onChanged?.();
    } catch (e: unknown) {
      toast({
        title: t("common.error"),
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t("orgProperties.count", {
            count: items.length,
            defaultValue: `${items.length} property(ies)`,
          })}
        </p>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t("orgProperties.addExisting", { defaultValue: "Add property" })}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {t("orgProperties.empty", { defaultValue: "No properties in this organization yet." })}
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <Card
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/properties/${p.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/properties/${p.id}`);
                }
              }}
              className="flex flex-wrap items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-muted/50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Home className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-secondary">{p.name}</p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="text-[10px]">
                    {t(`properties.types.${p.property_type ?? "apartment"}`, {
                      defaultValue: p.property_type ?? "—",
                    })}
                  </Badge>
                  {(p.city || p.country) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {[p.city, p.country].filter(Boolean).join(", ")}
                    </span>
                  )}
                  <span>
                    {p.bedrooms ?? 0} 🛏 · {p.bathrooms ?? 0} 🛁 · {p.max_guests ?? 0} 👤
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEdit(p)}
                  aria-label={t("properties.edit", { defaultValue: "Edit" })}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => setConfirmDelete(p)}
                  aria-label={t("common.delete", { defaultValue: "Delete" })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => navigate(`/properties/${p.id}`)}>
                  {t("propertyDetail.open", { defaultValue: "Open" })}
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add an existing property to this organization */}
      <Dialog open={addOpen} onOpenChange={(o) => !o && !busy && setAddOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("orgProperties.addExisting", { defaultValue: "Add property" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {loadingAvailable ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : available.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("orgProperties.noneToAdd", {
                  defaultValue: "No other properties are available to add.",
                })}
              </p>
            ) : (
              <div>
                <Label>{t("orgProperties.choose", { defaultValue: "Property" })}</Label>
                <Select value={selectedToAdd} onValueChange={setSelectedToAdd}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t("orgProperties.choosePlaceholder", {
                        defaultValue: "Choose a property",
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — {p.orgName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("orgProperties.moveHint", {
                    defaultValue: "This moves the selected property into this organization.",
                  })}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button onClick={assign} disabled={busy || !selectedToAdd}>
              {busy ? t("common.loading") : t("orgProperties.addExisting", { defaultValue: "Add property" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && !busy && setDialogOpen(false)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? t("properties.edit", { defaultValue: "Edit property" })
                : t("orgProperties.add", { defaultValue: "New property" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("properties.name", { defaultValue: "Name" })} *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("properties.type", { defaultValue: "Type" })}</Label>
              <Select
                value={form.property_type}
                onValueChange={(v) => setForm({ ...form, property_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map((tp) => (
                    <SelectItem key={tp} value={tp}>
                      {t(`properties.types.${tp}`, { defaultValue: tp })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("properties.city", { defaultValue: "City" })}</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
              <div>
                <Label>{t("properties.country", { defaultValue: "Country" })}</Label>
                <Input
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>🛏</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.bedrooms}
                  onChange={(e) => setForm({ ...form, bedrooms: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>🛁</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.bathrooms}
                  onChange={(e) => setForm({ ...form, bathrooms: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>👤 max</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.max_guests}
                  onChange={(e) => setForm({ ...form, max_guests: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && !busy && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("orgProperties.deleteTitle", {
                name: confirmDelete?.name ?? "",
                defaultValue: `Delete ${confirmDelete?.name ?? "this property"}?`,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("orgProperties.deleteBody", {
                defaultValue: "This permanently deletes the property and cannot be undone.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              disabled={busy}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {busy ? t("common.loading") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
