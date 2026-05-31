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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CalendarDays, MessageCircle, Plus, RefreshCw, Link2, Pencil, BookOpen, Bell, UserPlus, Eye, MapPin, Phone, Users, Moon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ReservationRentals } from "@/components/ReservationRentals";
import { CreateGuestAccountDialog } from "@/components/CreateGuestAccountDialog";
import { format, differenceInCalendarDays } from "date-fns";
import { getUserAccess } from "@/lib/access";
import { cn } from "@/lib/utils";

function getInitials(name?: string | null) {
  // Guard against whitespace-only names (e.g. " " imported from an iCal feed):
  // trimming first means a blank name falls through to the "?" placeholder
  // instead of rendering an empty avatar pill.
  const trimmed = name?.trim();
  if (!trimmed) return "?";
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

type Reservation = {
  id: string;
  property_id: string;
  source: string;
  external_code: string | null;
  check_in: string;
  check_out: string;
  guest_name: string | null;
  guest_phone: string | null;
  guest_language: string | null;
  guests_count: number | null;
  expected_arrival_time: string | null;
  status: string;
  notes: string | null;
};

type Property = { id: string; name: string };
type Feed = { id: string; property_id: string; label: string; source: string; ical_url: string; last_synced_at: string | null; last_error: string | null };
type Template = { id: string; key: string; label: string; icon: string | null; body_fr: string; body_en: string; body_ar: string; sort_order: number };

const DEFAULT_TEMPLATES = [
  { key: "welcome", label: "Bienvenue", icon: "👋", body_fr: "Bonjour {{guest}}, bienvenue ! Nous sommes ravis de vous accueillir à {{property}} du {{checkin}} au {{checkout}}. À très bientôt !", body_en: "Hi {{guest}}, welcome! We're happy to host you at {{property}} from {{checkin}} to {{checkout}}. See you soon!", body_ar: "مرحبا {{guest}}، نحن سعداء باستقبالكم في {{property}} من {{checkin}} إلى {{checkout}}." },
  { key: "guidebook", label: "Envoyer le livret", icon: "📖", body_fr: "Bonjour {{guest}} 👋\nVoici votre livret d'accueil pour {{property}} avec toutes les infos pratiques (wifi, règles, restaurants, urgences) :\n👉 {{guidebook_url}}\n\nÀ très bientôt !", body_en: "Hi {{guest}} 👋\nHere is your guest book for {{property}} with all practical info (wifi, rules, restaurants, emergency):\n👉 {{guidebook_url}}\n\nSee you soon!", body_ar: "مرحبا {{guest}} 👋\nإليكم دليل الإقامة في {{property}} مع جميع المعلومات (واي فاي، القواعد، المطاعم، الطوارئ):\n👉 {{guidebook_url}}" },
  { key: "arrival_reminder", label: "Rappel J-1 arrivée", icon: "⏰", body_fr: "Bonjour {{guest}}, on a hâte de vous accueillir demain à {{property}} 🌟\n🕐 Heure d'arrivée prévue : {{arrival_time}}\n🔢 Code d'accès : {{access_code}}\n🔑 Récupération des clés : {{key_handover}}\n📖 Votre livret : {{guidebook_url}}\n\nN'hésitez pas si vous avez la moindre question !", body_en: "Hi {{guest}}, we look forward to welcoming you tomorrow at {{property}} 🌟\n🕐 Expected arrival: {{arrival_time}}\n🔢 Access code: {{access_code}}\n🔑 Key handover: {{key_handover}}\n📖 Your guest book: {{guidebook_url}}\n\nLet me know if you have any question!", body_ar: "مرحبا {{guest}}، نحن متحمسون لاستقبالكم غدا في {{property}} 🌟\n🕐 وقت الوصول المتوقع: {{arrival_time}}\n🔢 رمز الدخول: {{access_code}}\n🔑 تسليم المفاتيح: {{key_handover}}\n📖 الدليل: {{guidebook_url}}" },
  { key: "checkin", label: "Instructions check-in", icon: "🔑", body_fr: "Voici les infos pour votre arrivée à {{property}} :\n📍 Adresse : \n🔢 Code d'accès : \n🅿️ Parking : \nÉtage : \nN'hésitez pas à m'écrire si besoin.", body_en: "Check-in info for {{property}}:\n📍 Address: \n🔢 Access code: \n🅿️ Parking: \nFloor: \nText me anytime if you need help.", body_ar: "معلومات الوصول إلى {{property}}:\n📍 العنوان: \n🔢 رمز الدخول: \n🅿️ موقف السيارات: \nالطابق: " },
  { key: "wifi", label: "Wifi & équipements", icon: "📶", body_fr: "Wifi : \nMot de passe : \nClim, machine à café, chauffe-eau : tout est à votre disposition. Bon séjour !", body_en: "Wifi: \nPassword: \nAC, coffee machine, water heater - all yours. Enjoy!", body_ar: "واي فاي: \nكلمة السر: \nالمكيف، آلة القهوة، السخان - كلها متاحة. استمتعوا!" },
  { key: "transport", label: "Proposer transport", icon: "🚗", body_fr: "Souhaitez-vous un transport depuis l'aéroport ? Nous avons un chauffeur de confiance disponible.", body_en: "Would you like airport pickup? We have a trusted driver available.", body_ar: "هل ترغبون في خدمة النقل من المطار؟ لدينا سائق موثوق متاح." },
  { key: "services", label: "Services additionnels", icon: "🧺", body_fr: "Services possibles pendant votre séjour :\n🧹 Ménage en cours de séjour\n🛒 Courses livrées à l'arrivée\n🍽️ Réservations restaurants\n🗺️ Excursions\nDites-moi ce qui vous intéresse !", body_en: "Extra services available:\n🧹 Mid-stay cleaning\n🛒 Grocery delivery on arrival\n🍽️ Restaurant bookings\n🗺️ Tours\nLet me know!", body_ar: "خدمات إضافية:\n🧹 تنظيف خلال الإقامة\n🛒 توصيل المشتريات\n🍽️ حجز مطاعم\n🗺️ جولات سياحية" },
  { key: "departure", label: "Départ & avis", icon: "👋", body_fr: "Merci pour votre séjour ! Avant de partir, merci de fermer les fenêtres et laisser les clés sur la table. Une petite étoile sur Airbnb nous ferait très plaisir 🌟", body_en: "Thanks for staying with us! Before leaving, please close the windows and leave keys on the table. A 5-star Airbnb review would mean a lot 🌟", body_ar: "شكرا على إقامتكم! قبل المغادرة، يرجى إغلاق النوافذ وترك المفاتيح على الطاولة. تقييم 5 نجوم سيسعدنا كثيرا 🌟" },
];

function fillTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function normalizePhone(p: string) {
  return p.replace(/[^\d]/g, "");
}

export default function Reservations({ propertyId, embedded = false }: { propertyId?: string; embedded?: boolean } = {}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [feedDialog, setFeedDialog] = useState<string | null>(null); // property_id
  const [waOpen, setWaOpen] = useState<Reservation | null>(null);
  const [waPreset, setWaPreset] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [guestAcctFor, setGuestAcctFor] = useState<Reservation | null>(null);

  const { data: access } = useQuery({
    queryKey: ["userAccess", user?.id],
    queryFn: async () => getUserAccess(user!.id),
    enabled: !!user,
  });

  const { data: orgId } = useQuery({
    queryKey: ["myOrg", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("org_id").eq("id", user!.id).single();
      return data?.org_id as string;
    },
    enabled: !!user,
  });

  const { data: properties = [], isLoading: isLoadingProperties } = useQuery({
    queryKey: ["properties", access?.role, user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("id, name").order("name");
      const allProperties = (data ?? []) as Property[];

      if (!user || !access?.isCohost) return allProperties;

      const { data: assignments } = await supabase
        .from("property_cohosts")
        .select("property_id")
        .eq("user_id", user.id);
      const allowedIds = new Set((assignments ?? []).map((row) => row.property_id));

      return allProperties.filter((property) => allowedIds.has(property.id));
    },
    enabled: !!access,
  });

  const propertyIdsKey = properties.map((property) => property.id).sort().join(",");

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ["reservations", access?.role, user?.id, propertyIdsKey],
    queryFn: async () => {
      // The live schema uses `bookings` — not `reservations`. The legacy
      // `reservations` table that earlier migrations provisioned isn't
      // deployed here (PostgREST reports it missing from the schema cache),
      // which is the same drift Availability.tsx already worked around. We
      // query `bookings` and map the column names to this file's
      // `Reservation` shape at the data layer so the rest of the UI
      // (cards, edit dialog, propertyMap) keeps working unchanged.
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, property_id, channel_slug, channel_ref, checkin, checkout, customer_name, customer_phone, guests, status, notes",
        )
        .order("checkin", { ascending: true });
      if (error) {
        toast.error(`Reservations: ${error.message}`);
        return [] as Reservation[];
      }
      const rows = (data ?? []) as Array<{
        id: string;
        property_id: string;
        channel_slug: string | null;
        channel_ref: string | null;
        checkin: string | null;
        checkout: string | null;
        customer_name: string | null;
        customer_phone: string | null;
        guests: number | null;
        status: string | null;
        notes: string | null;
      }>;
      // Skip bookings without dates — they'd crash format(new Date(...)) on
      // the cards. Sync-ical never writes those, but manual rows might.
      const allReservations: Reservation[] = rows
        .filter((r) => r.checkin && r.checkout)
        .map((r) => ({
          id: r.id,
          property_id: r.property_id,
          source: r.channel_slug ?? "manual",
          external_code: r.channel_ref,
          check_in: r.checkin as string,
          check_out: r.checkout as string,
          guest_name: r.customer_name,
          guest_phone: r.customer_phone,
          // bookings has no `guest_language` / `expected_arrival_time`
          // columns; the manual edit dialog still uses these in-memory but
          // the values aren't persisted (they were already dropped on
          // previous saves through the old `reservations` table too, since
          // it didn't exist).
          guest_language: null,
          guests_count: r.guests,
          expected_arrival_time: null,
          status: r.status ?? "confirmed",
          notes: r.notes,
        }));

      if (!access?.isCohost) return allReservations;

      const allowedIds = new Set(properties.map((property) => property.id));
      return allReservations.filter((reservation) => allowedIds.has(reservation.property_id));
    },
    enabled: !!access && (!access.isCohost || !isLoadingProperties),
  });

  const { data: feeds = [] } = useQuery({
    queryKey: ["feeds"],
    queryFn: async () => {
      const { data } = await supabase.from("property_ical_feeds").select("*");
      return (data ?? []) as Feed[];
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["templates", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("message_templates").select("*").order("sort_order");
      return (data ?? []) as Template[];
    },
    enabled: !!orgId,
  });

  // Seed default templates + add missing ones
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const existingKeys = new Set(templates.map((t) => t.key));
      const missing = DEFAULT_TEMPLATES.filter((t) => !existingKeys.has(t.key));
      if (missing.length === 0) return;
      const rows = missing.map((tpl, i) => ({
        ...tpl,
        organization_id: orgId,
        sort_order: templates.length + i,
        is_default: true,
      }));
      await supabase.from("message_templates").insert(rows);
      qc.invalidateQueries({ queryKey: ["templates"] });
    })();
  }, [orgId, templates, qc]);

  const propertyMap = useMemo(() => Object.fromEntries(properties.map((p) => [p.id, p.name])), [properties]);

  // When scoped to a single property (property detail tabs), narrow the lists
  // shown to just that property. `propertyMap` stays built from the full list
  // so guest/property names always resolve.
  const displayProperties = useMemo(
    () => (propertyId ? properties.filter((p) => p.id === propertyId) : properties),
    [properties, propertyId],
  );
  const displayReservations = useMemo(
    () => (propertyId ? reservations.filter((r) => r.property_id === propertyId) : reservations),
    [reservations, propertyId],
  );

  const upsertRes = useMutation({
    mutationFn: async (r: Partial<Reservation> & { organization_id?: string }) => {
      // Map the dialog's Reservation shape onto the live `bookings` columns.
      // bookings.customer_name is NOT NULL — fall back to a placeholder for
      // blocks / partially-filled manual rows so the constraint passes.
      const bookingPayload: Record<string, unknown> = {
        property_id: r.property_id,
        channel_slug: r.source ?? "manual",
        channel_ref: r.external_code ?? null,
        checkin: r.check_in ?? null,
        checkout: r.check_out ?? null,
        customer_name:
          (r.guest_name && r.guest_name.trim()) ||
          (r.status === "blocked" ? "Owner block" : "Manual booking"),
        customer_phone: r.guest_phone ?? null,
        guests: r.guests_count ?? null,
        status: r.status ?? "confirmed",
        notes: r.notes ?? null,
      };

      if (r.id) {
        const { error } = await supabase
          .from("bookings")
          .update(bookingPayload as never)
          .eq("id", r.id);
        if (error) throw error;
      } else {
        // bookings.ref_number is NOT NULL with no DB default — generate one
        // for new manual bookings the same way sync-ical does for imports.
        const refNumber = `MAN-${Date.now().toString(36).toUpperCase()}-${Math.random()
          .toString(36)
          .slice(2, 6)
          .toUpperCase()}`;
        const { error } = await supabase
          .from("bookings")
          .insert({
            ...bookingPayload,
            ref_number: refNumber,
            org_id: orgId!,
          } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
      toast.success(t("reservations.saved"));
      setEditing(null);
      setAddOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncIcal = useMutation({
    mutationFn: async (feedId?: string) => {
      const { data, error } = await supabase.functions.invoke("sync-ical", { body: feedId ? { feed_id: feedId } : {} });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
      qc.invalidateQueries({ queryKey: ["feeds"] });
      toast.success(t("reservations.synced"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-6">{t("common.loading")}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {!embedded ? (
          <div className="space-y-1.5">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">
              <span className="h-px w-6 bg-gradient-gold" aria-hidden="true" />
              {t("reservations.eyebrow", { defaultValue: "Bookings" })}
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-secondary">
              {t("reservations.title")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("reservations.subtitle")}</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CalendarDays className="h-4 w-4 text-gold" aria-hidden="true" />
            <span>
              {displayReservations.length}{" "}
              {t("reservations.countLabel", { defaultValue: "reservations" })}
            </span>
          </div>
        )}
        <div className="flex gap-2 sm:ml-auto">
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={() => syncIcal.mutate(undefined)}
            disabled={syncIcal.isPending}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", syncIcal.isPending && "animate-spin")} />
            {t("reservations.syncAll")}
          </Button>
          <Button className="cursor-pointer" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t("reservations.add")}
          </Button>
        </div>
      </div>

      {/* iCal feeds per property */}
      <Card className="p-5 border border-border/60 shadow-card sm:p-6">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-border/40">
            <Link2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-secondary">
              {t("reservations.icalFeeds")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("reservations.icalFeedsHint", {
                defaultValue: "Sync calendars from Airbnb, Booking & more.",
              })}
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {displayProperties.map((p) => {
            const propFeeds = feeds.filter((f) => f.property_id === p.id);
            return (
              <div
                key={p.id}
                className="rounded-xl border border-border/60 bg-muted/20 p-3.5 transition-colors hover:border-gold/40"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-medium text-sm text-secondary truncate">{p.name}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 cursor-pointer"
                    onClick={() => setFeedDialog(p.id)}
                  >
                    <Plus className="h-3 w-3 mr-1" /> iCal
                  </Button>
                </div>
                {propFeeds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("reservations.noFeeds")}</p>
                ) : (
                  <div className="space-y-1.5">
                    {propFeeds.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-card px-2.5 py-1.5 ring-1 ring-inset ring-border/50"
                      >
                        <span className="flex min-w-0 items-center gap-1.5 text-xs">
                          <span className="truncate text-secondary">{f.label}</span>
                          <Badge variant="outline" className="shrink-0 font-normal">{f.source}</Badge>
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 shrink-0 cursor-pointer p-0"
                          onClick={() => syncIcal.mutate(f.id)}
                          aria-label={t("reservations.syncAll")}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Reservations list */}
      <div className="space-y-3">
        {displayReservations.length === 0 ? (
          <Card className="border border-dashed border-border/70 bg-muted/20 p-10 text-center shadow-none">
            <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground/70 ring-1 ring-inset ring-border/50">
              <CalendarDays className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="mt-4 text-sm font-medium text-secondary">{t("reservations.empty")}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 cursor-pointer"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {t("reservations.add")}
            </Button>
          </Card>
        ) : (
          displayReservations.map((r) => {
            const incomplete = !r.guest_name || !r.guest_phone;
            const isBlocked = r.status === "blocked";
            const nights = Math.max(
              0,
              differenceInCalendarDays(new Date(r.check_out), new Date(r.check_in)),
            );
            return (
              <Card
                key={r.id}
                className={cn(
                  "group overflow-hidden border border-border/60 p-0 shadow-card transition-all duration-300",
                  "hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-soft",
                )}
              >
                {/* status accent rail */}
                <div className="flex">
                  <span
                    className={cn(
                      "w-1 shrink-0",
                      isBlocked && "bg-muted-foreground/40",
                      !isBlocked && incomplete && "bg-amber-400",
                      !isBlocked && !incomplete && "bg-emerald-500",
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1 p-4 sm:p-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ring-1 ring-inset ring-border/40",
                          isBlocked
                            ? "bg-muted text-muted-foreground"
                            : "bg-primary/10 text-primary",
                        )}
                        aria-hidden="true"
                      >
                        {isBlocked ? <CalendarDays className="h-5 w-5" /> : getInitials(r.guest_name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-secondary truncate">
                            {r.guest_name || t("reservations.unknownGuest")}
                          </h3>
                          <Badge variant="outline" className="font-normal capitalize">{r.source}</Badge>
                          {r.external_code && (
                            <Badge variant="secondary" className="font-normal">{r.external_code}</Badge>
                          )}
                          {isBlocked && (
                            <Badge className="border-transparent bg-muted text-muted-foreground hover:bg-muted">
                              {t("reservations.blocked")}
                            </Badge>
                          )}
                          {!isBlocked && incomplete && (
                            <Badge className="gap-1 border-transparent bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 hover:bg-amber-50">
                              {t("reservations.incomplete")}
                            </Badge>
                          )}
                          {!isBlocked && !incomplete && (
                            <Badge className="gap-1 border-transparent bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-50">
                              {t("reservations.ready")}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            {propertyMap[r.property_id] || "—"}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            {format(new Date(r.check_in), "dd MMM")} → {format(new Date(r.check_out), "dd MMM yyyy")}
                          </span>
                          {!isBlocked && Number.isFinite(nights) && (
                            <span className="flex items-center gap-1.5">
                              <Moon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              {nights}
                            </span>
                          )}
                          {typeof r.guests_count === "number" && r.guests_count > 0 && (
                            <span className="flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              {r.guests_count}
                            </span>
                          )}
                          {r.guest_phone && (
                            <span className="flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              {r.guest_phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* action toolbar */}
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() => setEditing(r)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5" /> {t("reservations.complete")}
                      </Button>
                      {r.guest_phone && !isBlocked && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="cursor-pointer"
                            onClick={() => { setWaOpen(r); setWaPreset("guidebook"); }}
                          >
                            <BookOpen className="h-3.5 w-3.5 mr-1.5" /> {t("reservations.guidebook", { defaultValue: "Guidebook" })}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="cursor-pointer"
                            onClick={() => { setWaOpen(r); setWaPreset("arrival_reminder"); }}
                          >
                            <Bell className="h-3.5 w-3.5 mr-1.5" /> {t("reservations.arrivalReminder", { defaultValue: "Reminder" })}
                          </Button>
                          <Button
                            size="sm"
                            className="cursor-pointer bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={() => { setWaOpen(r); setWaPreset(null); }}
                          >
                            <MessageCircle className="h-3.5 w-3.5 mr-1.5" /> WhatsApp
                          </Button>
                        </>
                      )}
                      {!isBlocked && (
                        <>
                          <span className="mx-0.5 hidden h-5 w-px bg-border/70 sm:block" aria-hidden="true" />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="cursor-pointer text-muted-foreground hover:text-secondary"
                            onClick={() => setGuestAcctFor(r)}
                          >
                            <UserPlus className="h-3.5 w-3.5 mr-1.5" /> {t("reservations.guestAccount", { defaultValue: "Guest account" })}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="cursor-pointer text-muted-foreground hover:text-secondary"
                            onClick={() => navigate(`/guest-preview/${r.id}`)}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1.5" /> {t("reservations.guestPreview", { defaultValue: "Guest preview" })}
                          </Button>
                        </>
                      )}
                      {(r as any).guest_slug && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="cursor-pointer text-muted-foreground hover:text-secondary"
                          onClick={() => {
                            const url = `${window.location.origin}/s/${(r as any).guest_slug}`;
                            navigator.clipboard.writeText(url);
                            toast.success(t("reservations.guestLinkCopied", { defaultValue: "Guest link copied" }));
                          }}
                        >
                          <Link2 className="h-3.5 w-3.5 mr-1.5" /> {t("reservations.guestLink", { defaultValue: "Guest link" })}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Add/Edit Reservation Dialog */}
      <ReservationDialog
        open={addOpen || !!editing}
        onOpenChange={(o) => { if (!o) { setAddOpen(false); setEditing(null); } }}
        reservation={editing}
        properties={displayProperties}
        defaultPropertyId={propertyId}
        orgId={orgId}
        onSave={(r) => upsertRes.mutate(r)}
      />

      {/* Add Feed Dialog */}
      <FeedDialog
        propertyId={feedDialog}
        orgId={orgId}
        onClose={() => { setFeedDialog(null); qc.invalidateQueries({ queryKey: ["feeds"] }); }}
      />

      {/* WhatsApp Dialog */}
      {waOpen && (
        <WhatsAppDialog
          reservation={waOpen}
          propertyName={propertyMap[waOpen.property_id]}
          templates={templates}
          locale={i18n.language}
          presetKey={waPreset}
          onClose={() => { setWaOpen(null); setWaPreset(null); }}
        />
      )}

      {guestAcctFor && (
        <CreateGuestAccountDialog
          open={!!guestAcctFor}
          onOpenChange={(o) => !o && setGuestAcctFor(null)}
          reservation={guestAcctFor}
        />
      )}
    </div>
  );
}

function ReservationDialog({ open, onOpenChange, reservation, properties, defaultPropertyId, orgId, onSave }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  reservation: Reservation | null;
  properties: Property[];
  defaultPropertyId?: string;
  orgId?: string;
  onSave: (r: Partial<Reservation>) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Partial<Reservation>>({});

  useEffect(() => {
    setForm(
      reservation ?? {
        source: "manual",
        status: "confirmed",
        guest_language: "fr",
        guests_count: 1,
        // Pre-select the property when adding from within a property's detail.
        ...(defaultPropertyId ? { property_id: defaultPropertyId } : {}),
      },
    );
  }, [reservation, open, defaultPropertyId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{reservation ? t("reservations.edit") : t("reservations.add")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("reservations.property")}</Label>
            <Select value={form.property_id} onValueChange={(v) => setForm({ ...form, property_id: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>{t("reservations.checkIn")}</Label>
              <Input type="date" value={form.check_in ?? ""} onChange={(e) => setForm({ ...form, check_in: e.target.value })} />
            </div>
            <div>
              <Label>{t("reservations.checkOut")}</Label>
              <Input type="date" value={form.check_out ?? ""} onChange={(e) => setForm({ ...form, check_out: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>{t("reservations.guestName")}</Label>
            <Input value={form.guest_name ?? ""} onChange={(e) => setForm({ ...form, guest_name: e.target.value })} maxLength={100} />
          </div>
          <div>
            <Label>{t("reservations.guestPhone")} (+213...)</Label>
            <Input value={form.guest_phone ?? ""} onChange={(e) => setForm({ ...form, guest_phone: e.target.value })} placeholder="+213 555 12 34 56" maxLength={20} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>{t("reservations.language")}</Label>
              <Select value={form.guest_language ?? "fr"} onValueChange={(v) => setForm({ ...form, guest_language: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">FR</SelectItem>
                  <SelectItem value="en">EN</SelectItem>
                  <SelectItem value="ar">AR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("reservations.guestsCount")}</Label>
              <Input type="number" min={1} value={form.guests_count ?? 1} onChange={(e) => setForm({ ...form, guests_count: parseInt(e.target.value) || 1 })} />
            </div>
            <div>
              <Label>{t("reservations.arrivalTime")}</Label>
              <Input type="time" value={form.expected_arrival_time ?? ""} onChange={(e) => setForm({ ...form, expected_arrival_time: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>{t("reservations.notes")}</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} rows={2} />
          </div>

          {reservation?.id && orgId && (
            <ReservationRentals reservationId={reservation.id} organizationId={orgId} canEdit />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => onSave(form)} disabled={!form.property_id || !form.check_in || !form.check_out}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeedDialog({ propertyId, orgId, onClose }: { propertyId: string | null; orgId?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [label, setLabel] = useState("Airbnb");
  const [source, setSource] = useState("airbnb");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!propertyId || !orgId || !url) return;
    setSaving(true);
    const { error } = await supabase.from("property_ical_feeds").insert({
      organization_id: orgId,
      property_id: propertyId,
      label,
      source: source as never,
      ical_url: url,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("reservations.feedAdded"));
    setUrl(""); setLabel("Airbnb"); setSource("airbnb");
    onClose();
  };

  return (
    <Dialog open={!!propertyId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("reservations.addFeed")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("reservations.feedSource")}</Label>
            <Select value={source} onValueChange={(v) => { setSource(v); setLabel(v.charAt(0).toUpperCase() + v.slice(1)); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="airbnb">Airbnb</SelectItem>
                <SelectItem value="booking">Booking.com</SelectItem>
                <SelectItem value="vrbo">VRBO</SelectItem>
                <SelectItem value="abritel">Abritel</SelectItem>
                <SelectItem value="other">{t("reservations.other")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("reservations.feedLabel")}</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={50} />
          </div>
          <div>
            <Label>iCal URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.airbnb.com/calendar/ical/..." />
            <p className="text-xs text-muted-foreground mt-1">{t("reservations.icalHint")}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={!url || saving}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WhatsAppDialog({ reservation, propertyName, templates, locale, presetKey, onClose }: {
  reservation: Reservation;
  propertyName: string;
  templates: Template[];
  locale: string;
  presetKey?: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const lang = (reservation.guest_language || locale || "fr").substring(0, 2);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [extras, setExtras] = useState<{ guidebook_url: string; access_code: string; key_handover: string }>({
    guidebook_url: "", access_code: "", key_handover: "",
  });

  // Fetch guidebook slug + property access info
  useEffect(() => {
    (async () => {
      const [{ data: gb }, { data: prop }] = await Promise.all([
        supabase.from("guest_books").select("slug").eq("property_id", reservation.property_id).eq("active", true).maybeSingle(),
        supabase.from("properties").select("access_code, entry_instructions").eq("id", reservation.property_id).maybeSingle(),
      ]);
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setExtras({
        guidebook_url: gb?.slug ? `${origin}/guest-book/${gb.slug}` : "",
        access_code: prop?.access_code || "—",
        key_handover: prop?.entry_instructions || "—",
      });
    })();
  }, [reservation.property_id]);

  const vars = {
    guest: reservation.guest_name || "",
    property: propertyName || "",
    checkin: format(new Date(reservation.check_in), "dd/MM/yyyy"),
    checkout: format(new Date(reservation.check_out), "dd/MM/yyyy"),
    arrival_time: reservation.expected_arrival_time || "—",
    guidebook_url: extras.guidebook_url || "(livret non publié)",
    access_code: extras.access_code,
    key_handover: extras.key_handover,
  };

  const useTemplate = (tpl: Template) => {
    const body = (tpl as never as Record<string, string>)[`body_${lang}`] || tpl.body_fr;
    setMessage(fillTemplate(body, vars));
    setSelected(tpl.id);
  };

  // Auto-apply preset once data is ready
  useEffect(() => {
    if (!presetKey || templates.length === 0) return;
    const tpl = templates.find((t) => t.key === presetKey);
    if (tpl) useTemplate(tpl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey, templates, extras]);

  const send = async () => {
    const phone = normalizePhone(reservation.guest_phone || "");
    if (!phone) return;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    const sent = (Array.isArray((reservation as never as { messages_sent: unknown }).messages_sent)
      ? (reservation as never as { messages_sent: unknown[] }).messages_sent
      : []) as unknown[];
    await supabase.from("reservations").update({
      messages_sent: [...sent, { template: selected, at: new Date().toISOString(), preview: message.slice(0, 80) }] as never,
    }).eq("id", reservation.id);
    window.open(url, "_blank");
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>WhatsApp · {reservation.guest_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">{t("reservations.pickTemplate")}</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {templates.map((tpl) => (
                <Button key={tpl.id} type="button" variant={selected === tpl.id ? "default" : "outline"} size="sm" className="justify-start h-auto py-2" onClick={() => useTemplate(tpl)}>
                  <span className="mr-1">{tpl.icon}</span>
                  <span className="text-xs">{tpl.label}</span>
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label>{t("reservations.message")}</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8} maxLength={4000} />
            <p className="text-xs text-muted-foreground mt-1">{t("reservations.langDetected")}: {lang.toUpperCase()}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={send} disabled={!message.trim()} className="bg-green-600 hover:bg-green-700">
            <MessageCircle className="h-4 w-4 mr-2" /> {t("reservations.openWhatsApp")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
