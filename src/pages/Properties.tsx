import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Home, Pencil, Trash2, MapPin, Building2, Castle, Hotel, Bed, HelpCircle, Link2, Calendar, Sparkles, History, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { IcalManager } from "@/components/IcalManager";
import { PropertyQRCode } from "@/components/PropertyQRCode";
import { PropertyApprovalTimeline } from "@/components/PropertyApprovalTimeline";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

interface Property {
  id: string;
  org_id: string;
  name: string;
  property_type: string;
  address: string | null;
  street_number: string | null;
  street_name: string | null;
  building_name: string | null;
  apartment_number: string | null;
  floor: string | null;
  postal_code: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  access_code: string | null;
  entry_instructions: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  max_guests: number | null;
  listing_platforms: string[] | null;
  categories: string[] | null;
  status: string;
  notes: string | null;
  approval_status: string;
  submitted_by: string | null;
  rejection_reason: string | null;
}

const propertySchema = z.object({
  name: z.string().trim().min(1).max(120),
  property_type: z.string().min(1),
  street_number: z.string().trim().max(20).optional(),
  street_name: z.string().trim().max(150).optional(),
  building_name: z.string().trim().max(150).optional(),
  apartment_number: z.string().trim().max(20).optional(),
  floor: z.string().trim().max(20).optional(),
  postal_code: z.string().trim().max(20).optional(),
  city: z.string().trim().max(100).optional(),
  region: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  access_code: z.string().trim().max(50).optional(),
  entry_instructions: z.string().max(1000).optional(),
  bedrooms: z.number().int().min(0).max(50),
  bathrooms: z.number().int().min(0).max(50),
  max_guests: z.number().int().min(1).max(100),
  notes: z.string().max(2000).optional(),
});

const PLATFORMS = ["Airbnb", "Booking", "Expedia", "Vrbo"];

export const PROPERTY_CATEGORIES = [
  { value: "family", emoji: "👨‍👩‍👧" },
  { value: "beach", emoji: "🏖️" },
  { value: "mountain", emoji: "⛰️" },
  { value: "city", emoji: "🏙️" },
  { value: "business", emoji: "💼" },
  { value: "romantic", emoji: "💕" },
  { value: "group", emoji: "🎉" },
  { value: "pets", emoji: "🐾" },
  { value: "luxury", emoji: "✨" },
  { value: "budget", emoji: "💰" },
] as const;

const PROPERTY_TYPES = [
  { value: "villa", icon: Castle },
  { value: "apartment", icon: Building2 },
  { value: "house", icon: Home },
  { value: "studio", icon: Hotel },
  { value: "room", icon: Bed },
  { value: "other", icon: HelpCircle },
] as const;

const emptyForm = {
  name: "",
  property_type: "apartment",
  street_number: "", street_name: "", building_name: "",
  apartment_number: "", floor: "",
  postal_code: "", city: "", region: "", country: "",
  access_code: "", entry_instructions: "",
  bedrooms: 1, bathrooms: 1, max_guests: 2,
  notes: "", platforms: [] as string[], categories: [] as string[],
};

const buildAddress = (p: Partial<Property>) => {
  const line1 = [p.street_number, p.street_name].filter(Boolean).join(" ");
  const detail = [
    p.building_name,
    p.apartment_number ? `Apt ${p.apartment_number}` : null,
    p.floor ? `Fl ${p.floor}` : null,
  ].filter(Boolean).join(" · ");
  const cityLine = [p.postal_code, p.city, p.region, p.country].filter(Boolean).join(", ");
  return [line1, detail, cityLine].filter(Boolean).join("\n");
};

const Properties = () => {
  const { t } = useTranslation();
  const [items, setItems] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [icalProperty, setIcalProperty] = useState<Property | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [canApprove, setCanApprove] = useState(false);
  const [rejectFor, setRejectFor] = useState<Property | null>(null);
  const [historyFor, setHistoryFor] = useState<Property | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [lastEvents, setLastEvents] = useState<Record<string, { event: string; created_at: string; actor_name: string | null; reason: string | null }>>({});
  const [cohosts, setCohosts] = useState<{ id: string; full_name: string | null }[]>([]);
  const [propertyCohosts, setPropertyCohosts] = useState<Record<string, string | null>>({});
  const [savingCohost, setSavingCohost] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (profile?.role === "admin" || profile?.role === "super_admin" || profile?.role === "co_admin") {
        setCanApprove(true);
      } else {
        setCanApprove(false);
      }
    }
    const { data, error } = await supabase.from("properties").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    const props = (data ?? []) as Property[];
    
    // Filter properties based on user role (if not admin, only show properties they cohost)
    let visibleProps = props;
    if (user && !canApprove) {
      const { data: cohosted } = await supabase.from("property_cohosts").select("property_id").eq("user_id", user.id);
      const allowedIds = new Set((cohosted ?? []).map((c: any) => c.property_id));
      visibleProps = props.filter(p => allowedIds.has(p.id));
    }
    setItems(visibleProps);

    // Fetch cohosts
    const { data: cohostData } = await supabase.from("property_cohosts").select("user_id").in("property_id", visibleProps.map(p => p.id));
    const cohostUserIds = Array.from(new Set((cohostData ?? []).map((r: any) => r.user_id)));
    if (cohostUserIds.length) {
      const { data: cohostProfiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", cohostUserIds);
      setCohosts((cohostProfiles ?? []) as any);
    } else {
      setCohosts([]);
    }
    if (visibleProps.length) {
      const { data: assignments } = await supabase
        .from("property_cohosts")
        .select("property_id, user_id")
        .in("property_id", visibleProps.map((p) => p.id));
      const map: Record<string, string | null> = {};
      visibleProps.forEach((p) => { map[p.id] = null; });
      (assignments ?? []).forEach((a: any) => { map[a.property_id] = a.user_id; });
      setPropertyCohosts(map);
    }
    if (props.length) {
      const { data: events } = await supabase
        .from("property_approval_events")
        .select("property_id, event, actor_id, reason, created_at")
        .in("property_id", props.map((p) => p.id))
        .order("created_at", { ascending: false });

      const latestByProp = new Map<string, any>();
      (events ?? []).forEach((e: any) => {
        if (!latestByProp.has(e.property_id)) latestByProp.set(e.property_id, e);
      });

      const actorIds = Array.from(new Set(Array.from(latestByProp.values()).map((e) => e.actor_id).filter(Boolean)));
      const nameMap = new Map<string, string | null>();
      if (actorIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
        (profiles ?? []).forEach((p: any) => nameMap.set(p.id, p.full_name));
      }

      const summary: Record<string, any> = {};
      latestByProp.forEach((e, propId) => {
        summary[propId] = {
          event: e.event,
          created_at: e.created_at,
          actor_name: e.actor_id ? nameMap.get(e.actor_id) ?? null : null,
          reason: e.reason,
        };
      });
      setLastEvents(summary);
    }

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (p: Property) => {
    setEditing(p);
    setForm({
      name: p.name,
      property_type: p.property_type ?? "apartment",
      street_number: p.street_number ?? "",
      street_name: p.street_name ?? "",
      building_name: p.building_name ?? "",
      apartment_number: p.apartment_number ?? "",
      floor: p.floor ?? "",
      postal_code: p.postal_code ?? "",
      city: p.city ?? "",
      region: p.region ?? "",
      country: p.country ?? "",
      access_code: p.access_code ?? "",
      entry_instructions: p.entry_instructions ?? "",
      bedrooms: p.bedrooms ?? 1,
      bathrooms: p.bathrooms ?? 1,
      max_guests: p.max_guests ?? 2,
      notes: p.notes ?? "",
      platforms: p.listing_platforms ?? [],
      categories: p.categories ?? [],
    });
    setOpen(true);
  };

  const toggleCategory = (c: string) => {
    setForm((f) => ({
      ...f,
      categories: f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c],
    }));
  };

  const togglePlatform = (p: string) => {
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter((x) => x !== p) : [...f.platforms, p],
    }));
  };

  const importFromUrl = async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-listing", {
        body: { url: importUrl.trim() },
      });
      if (error) throw error;
      const d = (data as any)?.data ?? {};
      setForm((f) => ({
        ...f,
        name: d.name || f.name,
        property_type: d.property_type || f.property_type,
        city: d.city || f.city,
        region: d.region || f.region,
        country: d.country || f.country,
        bedrooms: Number(d.bedrooms) || f.bedrooms,
        bathrooms: Number(d.bathrooms) || f.bathrooms,
        max_guests: Number(d.max_guests) || f.max_guests,
        notes: d.notes || f.notes,
        platforms: importUrl.includes("airbnb") ? Array.from(new Set([...(f.platforms || []), "Airbnb"]))
          : importUrl.includes("booking") ? Array.from(new Set([...(f.platforms || []), "Booking"]))
          : importUrl.includes("vrbo") ? Array.from(new Set([...(f.platforms || []), "Vrbo"]))
          : f.platforms,
      }));
      toast.success(t("properties.imported"));
      setImportUrl("");
    } catch (e: any) {
      toast.error(e.message || t("properties.importFailed"));
    } finally {
      setImporting(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = propertySchema.safeParse({
      ...form,
      bedrooms: Number(form.bedrooms),
      bathrooms: Number(form.bathrooms),
      max_guests: Number(form.max_guests),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    const payload = {
      ...parsed.data,
      address: buildAddress(parsed.data as any),
      listing_platforms: form.platforms,
      categories: form.categories,
    };

    if (editing) {
      const { error } = await supabase.from("properties").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success(t("properties.updated"));
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: orgs } = await supabase.from("organizations").select("id").eq("owner_id", user.id).limit(1);
      if (!orgs || orgs.length === 0) return toast.error("No organization found for your user");

      const { error } = await supabase.from("properties").insert([{
        ...payload,
        name: parsed.data.name,
        org_id: orgs[0].id,
        submitted_by: user.id,
      }]);
      if (error) return toast.error(error.message);
      toast.success(t("properties.created"));
    }
    setOpen(false);
    load();
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("properties").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else toast.success(t("properties.deleted"));
    setDeleteId(null);
    load();
  };

  const approveProperty = async (p: Property) => {
    const { error } = await supabase
      .from("properties")
      .update({ approval_status: "approved", rejection_reason: null })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(t("properties.approval.approved_toast"));
    load();
  };

  const rejectProperty = async () => {
    if (!rejectFor) return;
    const { error } = await supabase
      .from("properties")
      .update({ approval_status: "rejected", rejection_reason: rejectReason || null })
      .eq("id", rejectFor.id);
    if (error) return toast.error(error.message);
    toast.success(t("properties.approval.rejected_toast"));
    setRejectFor(null);
    setRejectReason("");
    load();
  };

  const assignCohost = async (p: Property, newUserId: string | null) => {
    setSavingCohost(p.id);
    try {
      // Remove existing cohost assignments for this property
      const { error: delErr } = await supabase
        .from("property_cohosts")
        .delete()
        .eq("property_id", p.id);
      if (delErr) throw delErr;

      if (newUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        const { error: insErr } = await supabase.from("property_cohosts").insert([{
          property_id: p.id,
          user_id: newUserId,
          assigned_by: user.id,
          permissions: ["manage_properties", "manage_reservations", "manage_tasks", "manage_staff", "view_financials", "manage_settings"]
        }]);
        if (insErr) throw insErr;
      }
      setPropertyCohosts((m) => ({ ...m, [p.id]: newUserId }));
      toast.success(t("properties.cohostAssign.saved"));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingCohost(null);
    }
  };

  const showApt = ["apartment", "studio", "room"].includes(form.property_type);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl md:text-3xl font-bold text-secondary">{t("properties.title")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" />
              {t("properties.add")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? t("properties.edit") : t("properties.add")}</DialogTitle>
            </DialogHeader>
            {!editing && !canApprove && (
              <div className="rounded-lg border border-amber-400/40 p-3 bg-amber-50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-200">
                ⏳ {t("properties.approval.submittedHint")}
              </div>
            )}
            {!editing && (
              <div className="rounded-lg border border-primary/30 p-3 bg-primary/5 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-secondary">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {t("properties.importTitle")}
                </div>
                <p className="text-xs text-muted-foreground">{t("properties.importHint")}</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://www.airbnb.com/rooms/..."
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                  />
                  <Button type="button" onClick={importFromUrl} disabled={importing || !importUrl.trim()}>
                    {importing ? t("common.loading") : t("properties.importBtn")}
                  </Button>
                </div>
              </div>
            )}
            <form onSubmit={save} className="space-y-4">

              <div className="space-y-1.5">
                <Label>{t("properties.name")}</Label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>

              <div className="space-y-1.5">
                <Label>{t("properties.propertyType")}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {PROPERTY_TYPES.map(({ value, icon: Icon }) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setForm({ ...form, property_type: value })}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-xs transition-colors ${
                        form.property_type === value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card hover:bg-muted border-border"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{t(`properties.types.${value}`)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
                <p className="text-sm font-medium text-secondary">{t("properties.addressSection")}</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("properties.streetNumber")}</Label>
                    <Input value={form.street_number} onChange={(e) => setForm({ ...form, street_number: e.target.value })} />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs">{t("properties.streetName")}</Label>
                    <Input value={form.street_name} onChange={(e) => setForm({ ...form, street_name: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("properties.buildingName")}</Label>
                  <Input value={form.building_name} onChange={(e) => setForm({ ...form, building_name: e.target.value })} />
                </div>
                {showApt && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("properties.apartmentNumber")}</Label>
                      <Input value={form.apartment_number} onChange={(e) => setForm({ ...form, apartment_number: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("properties.floor")}</Label>
                      <Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("properties.postalCode")}</Label>
                    <Input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("properties.city")}</Label>
                    <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("properties.region")}</Label>
                    <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("properties.country")}</Label>
                    <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("properties.accessCode")}</Label>
                    <Input value={form.access_code} onChange={(e) => setForm({ ...form, access_code: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("properties.entryInstructions")}</Label>
                    <Textarea rows={2} value={form.entry_instructions} onChange={(e) => setForm({ ...form, entry_instructions: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("properties.bedrooms")}</Label>
                  <Input type="number" min={0} value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("properties.bathrooms")}</Label>
                  <Input type="number" min={0} value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("properties.maxGuests")}</Label>
                  <Input type="number" min={1} value={form.max_guests} onChange={(e) => setForm({ ...form, max_guests: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("properties.platforms")}</Label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => (
                    <Badge
                      key={p}
                      variant={form.platforms.includes(p) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => togglePlatform(p)}
                    >
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("properties.categories")}</Label>
                <div className="flex flex-wrap gap-2">
                  {PROPERTY_CATEGORIES.map((c) => (
                    <Badge
                      key={c.value}
                      variant={form.categories.includes(c.value) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleCategory(c.value)}
                    >
                      {c.emoji} {t(`properties.categoryLabels.${c.value}`)}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("properties.notes")}</Label>
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("properties.cancel")}</Button>
                <Button type="submit">{t("properties.save")}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center shadow-card">
          <Home className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-secondary">{t("properties.empty")}</h3>
          <p className="text-sm text-muted-foreground mb-4">{t("properties.emptyHint")}</p>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            {t("properties.add")}
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p) => (
            <Card key={p.id} className="p-4 shadow-card hover:shadow-soft transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-secondary truncate">{p.name}</h3>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t(`properties.types.${p.property_type ?? "apartment"}`)}
                  </p>
                  {(p.city || p.country) && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" />
                      {[p.city, p.country].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {p.approval_status === "pending" && (
                    <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/30">
                      ⏳ {t("properties.approval.pending")}
                    </Badge>
                  )}
                  {p.approval_status === "rejected" && (
                    <Badge variant="destructive">{t("properties.approval.rejected")}</Badge>
                  )}
                  {p.approval_status === "approved" && (
                    <Badge variant={p.status === "active" ? "default" : "secondary"}>
                      {p.status === "active" ? t("properties.active") : t("properties.inactive")}
                    </Badge>
                  )}
                </div>
              </div>
              {p.approval_status === "rejected" && p.rejection_reason && (
                <p className="text-xs text-destructive mb-2 italic">"{p.rejection_reason}"</p>
              )}
              <div className="text-xs text-muted-foreground mb-3">
                {p.bedrooms ?? 0} 🛏 · {p.bathrooms ?? 0} 🛁 · {p.max_guests ?? 0} 👤
              </div>
              {p.categories && p.categories.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {p.categories.map((c) => {
                    const cat = PROPERTY_CATEGORIES.find((x) => x.value === c);
                    return (
                      <Badge key={c} variant="secondary" className="text-[10px]">
                        {cat?.emoji} {t(`properties.categoryLabels.${c}`, c)}
                      </Badge>
                    );
                  })}
                </div>
              )}
              {p.listing_platforms && p.listing_platforms.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {p.listing_platforms.map((pl) => (
                    <Badge key={pl} variant="outline" className="text-[10px]">{pl}</Badge>
                  ))}
                </div>
              )}
              {canApprove && p.approval_status === "pending" && (
                <div className="flex gap-2 mb-2">
                  <Button size="sm" className="flex-1" onClick={() => approveProperty(p)}>
                    ✓ {t("properties.approval.approve")}
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setRejectFor(p)}>
                    ✕ {t("properties.approval.reject")}
                  </Button>
                </div>
              )}
              {lastEvents[p.id] ? (
                <button
                  type="button"
                  onClick={() => setHistoryFor(p)}
                  className="w-full text-left text-[11px] text-muted-foreground mb-2 px-2 py-1 rounded bg-muted/40 hover:bg-muted transition-colors flex items-center gap-1.5 truncate"
                  title={t("properties.approval.history")}
                >
                  <History className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {t(`properties.approval.events.${lastEvents[p.id].event}`)}
                    {lastEvents[p.id].actor_name && <> · {lastEvents[p.id].actor_name}</>}
                    {" · "}
                    {format(new Date(lastEvents[p.id].created_at), "dd MMM HH:mm")}
                  </span>
                </button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="w-full text-[11px] text-muted-foreground/70 italic mb-2 px-2 py-1 rounded border border-dashed border-border flex items-center gap-1.5 truncate cursor-help">
                      <History className="h-3 w-3 shrink-0" />
                      <span className="truncate">{t("properties.approval.noEventsYet")}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    {t("properties.approval.noEventsYetTooltip")}
                  </TooltipContent>
                </Tooltip>
              )}
              {canApprove && (
                <div className="mb-2 flex items-center gap-2 text-[11px]">
                  <UserCog className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground shrink-0">{t("properties.cohostAssign.label")}</span>
                  <Select
                    value={propertyCohosts[p.id] ?? "none"}
                    disabled={savingCohost === p.id}
                    onValueChange={(v) => assignCohost(p, v === "none" ? null : v)}
                  >
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue placeholder={t("properties.cohostAssign.placeholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("properties.cohostAssign.unassigned")}</SelectItem>
                      {cohosts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.full_name || t("properties.cohostAssign.unnamed")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => openEdit(p)}
                  disabled={p.approval_status === "pending" && !canApprove}
                  title={p.approval_status === "pending" && !canApprove ? t("properties.approval.lockedHint") : undefined}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" /> {t("properties.edit")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIcalProperty(p)} title={t("ical.title")}>
                  <Calendar className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setHistoryFor(p)} title={t("properties.approval.history")}>
                  <History className="h-3.5 w-3.5" />
                </Button>
                {(p as any).qr_token && (
                  <PropertyQRCode propertyName={p.name} qrToken={(p as any).qr_token} />
                )}
                <Button variant="outline" size="sm" onClick={() => setDeleteId(p.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("properties.deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("properties.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>{t("properties.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!rejectFor} onOpenChange={(o) => { if (!o) { setRejectFor(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("properties.approval.reject")} — {rejectFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t("properties.approval.rejectReason")}</Label>
            <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectFor(null); setRejectReason(""); }}>{t("properties.cancel")}</Button>
            <Button variant="destructive" onClick={rejectProperty}>{t("properties.approval.reject")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {icalProperty && (
        <IcalManager
          propertyId={icalProperty.id}
          organizationId={icalProperty.org_id}
          open={!!icalProperty}
          onOpenChange={(o) => !o && setIcalProperty(null)}
        />
      )}

      {historyFor && (
        <PropertyApprovalTimeline
          propertyId={historyFor.id}
          propertyName={historyFor.name}
          open={!!historyFor}
          onOpenChange={(o) => !o && setHistoryFor(null)}
        />
      )}
    </div>
  );
};

export default Properties;
