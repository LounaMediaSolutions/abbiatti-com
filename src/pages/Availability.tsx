import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarRange, ChevronLeft, ChevronRight, MapPin, Link2 } from "lucide-react";
import { addDays, addMonths, endOfMonth, format, isWithinInterval, parseISO, startOfDay, startOfMonth } from "date-fns";
import { PROPERTY_CATEGORIES } from "./Properties";
import { cn } from "@/lib/utils";
import { IcalManager } from "@/components/IcalManager";

type Property = {
  id: string;
  org_id: string;
  name: string;
  city: string | null;
  country: string | null;
  property_type: string;
  max_guests: number | null;
  categories: string[] | null;
};

type Reservation = {
  id: string;
  property_id: string;
  check_in: string;
  check_out: string;
  status: string;
  guest_name: string | null;
};

type ViewMode = "14d" | "30d" | "month" | "3mo";
const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "month", label: "1 mois" },
];
const LONG_VIEW_MONTHS = 1; // nombre de mois affichés en mode long verrouillé
const CONFIRMED_STATUSES = ["confirmed", "in_progress", "completed"];

export default function Availability() {
  const { t } = useTranslation();
  const [activeCats, setActiveCats] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<Date>(startOfDay(new Date()));
  // Vue verrouillée sur le mode long (plusieurs mois) par défaut
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [monthAnchor, setMonthAnchor] = useState<Date>(startOfMonth(new Date()));
  const [from, setFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(addDays(new Date(), 7), "yyyy-MM-dd"));
  const [icalProperty, setIcalProperty] = useState<Property | null>(null);

  const { data: properties = [] } = useQuery({
    queryKey: ["avail-properties"],
    queryFn: async () => {
      // Previously: .eq("status", "active"). The live schema doesn't have a
      // `status` column on properties (only `active: boolean`, see types.ts),
      // so that filter errored silently and returned zero rows — which is why
      // the page rendered empty. RLS already scopes the rows to the user's
      // org + cohost assignments, so we just ask for everything visible and
      // optionally narrow by `active=true` in JS once the rows arrive.
      //
      // The live `properties` table uses `org_id`, not `organization_id`,
      // and the earlier comment here had it reversed — which is exactly
      // why the page errored with "column properties.organization_id does
      // not exist". Properties.tsx works around this by probing both names,
      // but here we just commit to the live column name. RLS already
      // scopes the rows to the user's org + cohost assignments.
      const { data, error } = await supabase
        .from("properties")
        .select(
          "id, org_id, name, city, country, property_type, max_guests, categories, active",
        )
        .order("name");
      if (error) {
        // Surface the failure instead of silently swallowing it. If the
        // column shape genuinely doesn't match the schema cache we still
        // return what we have so the page renders something.
        toast.error(`Availability: ${error.message}`);
      }
      const rows = ((data ?? []) as unknown) as Array<
        Property & { active?: boolean | null }
      >;
      // Show every property unless it's been explicitly deactivated.
      return rows.filter((p) => p.active !== false) as Property[];
    },
  });

  // Visible date window — derive from the current view so we don't ask the
  // server for the entire reservation history just to color a single month.
  const reservationWindow = useMemo(() => {
    if (viewMode === "3mo" || viewMode === "month") {
      const months = viewMode === "3mo" ? LONG_VIEW_MONTHS : 1;
      const start = startOfMonth(monthAnchor);
      const end = endOfMonth(addMonths(start, months - 1));
      return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
    }
    const len = viewMode === "30d" ? 30 : 14;
    return {
      from: format(startDate, "yyyy-MM-dd"),
      to: format(addDays(startDate, len), "yyyy-MM-dd"),
    };
  }, [viewMode, startDate, monthAnchor]);

  const { data: reservations = [] } = useQuery({
    queryKey: ["avail-bookings", reservationWindow.from, reservationWindow.to],
    queryFn: async () => {
      // The live schema's table is `bookings` (columns: checkin / checkout /
      // customer_name / status), not `reservations`. An older migration in
      // this repo provisions `public.reservations` but it isn't applied to
      // this deployment — PostgREST reports it as missing from the schema
      // cache. We query bookings and remap the field names so the rest of
      // the file keeps using its `Reservation { check_in, check_out,
      // guest_name }` shape.
      //
      // Window predicate: reservation overlaps the visible range when
      // (checkin < window.to) AND (checkout > window.from) — standard Allen
      // overlap. Keeps the payload tiny.
      const { data, error } = await supabase
        .from("bookings")
        .select("id, property_id, checkin, checkout, status, customer_name")
        .neq("status", "cancelled")
        .lt("checkin", reservationWindow.to)
        .gt("checkout", reservationWindow.from);
      if (error) {
        toast.error(`Availability: ${error.message}`);
      }
      const rows = (data ?? []) as Array<{
        id: string;
        property_id: string;
        checkin: string | null;
        checkout: string | null;
        status: string | null;
        customer_name: string | null;
      }>;
      // Skip rows missing dates — they'd crash parseISO downstream.
      return rows
        .filter((r) => r.checkin && r.checkout)
        .map<Reservation>((r) => ({
          id: r.id,
          property_id: r.property_id,
          check_in: r.checkin as string,
          check_out: r.checkout as string,
          status: r.status ?? "confirmed",
          guest_name: r.customer_name,
        }));
    },
  });

  const filteredProps = useMemo(() => {
    if (activeCats.length === 0) return properties;
    return properties.filter((p) => (p.categories ?? []).some((c) => activeCats.includes(c)));
  }, [properties, activeCats]);

  const days = useMemo(() => {
    if (viewMode === "3mo" || viewMode === "month") {
      const months = viewMode === "3mo" ? LONG_VIEW_MONTHS : 1;
      const start = startOfMonth(monthAnchor);
      const end = endOfMonth(addMonths(start, months - 1));
      const out: Date[] = [];
      let d = start;
      while (d <= end) {
        out.push(d);
        d = addDays(d, 1);
      }
      return out;
    }
    const len = viewMode === "30d" ? 30 : 14;
    return Array.from({ length: len }, (_, i) => addDays(startDate, i));
  }, [viewMode, startDate, monthAnchor]);

  const goPrev = () => {
    if (viewMode === "3mo") setMonthAnchor(startOfMonth(addMonths(monthAnchor, -LONG_VIEW_MONTHS)));
    else if (viewMode === "month") setMonthAnchor(startOfMonth(addMonths(monthAnchor, -1)));
    else setStartDate(addDays(startDate, viewMode === "30d" ? -30 : -7));
  };
  const goNext = () => {
    if (viewMode === "3mo") setMonthAnchor(startOfMonth(addMonths(monthAnchor, LONG_VIEW_MONTHS)));
    else if (viewMode === "month") setMonthAnchor(startOfMonth(addMonths(monthAnchor, 1)));
    else setStartDate(addDays(startDate, viewMode === "30d" ? 30 : 7));
  };

  // Returns "confirmed" | "pending" | null
  const getDayStatus = (propId: string, day: Date): "confirmed" | "pending" | null => {
    const match = reservations.find(
      (r) =>
        r.property_id === propId &&
        isWithinInterval(day, {
          start: parseISO(r.check_in),
          end: addDays(parseISO(r.check_out), -1),
        })
    );
    if (!match) return null;
    return CONFIRMED_STATUSES.includes(match.status) ? "confirmed" : "pending";
  };

  const availableInRange = useMemo(() => {
    if (!from || !to) return filteredProps;
    const f = parseISO(from);
    const tt = parseISO(to);
    return filteredProps.filter((p) => {
      const overlapping = reservations.some((r) => {
        if (r.property_id !== p.id) return false;
        const ci = parseISO(r.check_in);
        const co = parseISO(r.check_out);
        return ci < tt && co > f;
      });
      return !overlapping;
    });
  }, [filteredProps, reservations, from, to]);

  const toggleCat = (c: string) =>
    setActiveCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <CalendarRange className="h-6 w-6" /> {t("availability.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("availability.subtitle")}</p>
      </div>

      {/* Category filter */}
      <Card className="p-4">
        <p className="text-xs uppercase text-muted-foreground mb-2">{t("availability.filterByPackage")}</p>
        <div className="flex flex-wrap gap-2">
          {PROPERTY_CATEGORIES.map((c) => (
            <Badge
              key={c.value}
              variant={activeCats.includes(c.value) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleCat(c.value)}
            >
              {c.emoji} {t(`properties.categoryLabels.${c.value}`)}
            </Badge>
          ))}
          {activeCats.length > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setActiveCats([])}>
              {t("availability.clear")}
            </Button>
          )}
        </div>
      </Card>

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">{t("availability.calendar")}</TabsTrigger>
          <TabsTrigger value="list">{t("availability.list")}</TabsTrigger>
        </TabsList>

        {/* CALENDAR */}
        <TabsContent value="calendar">
          <Card className="p-3 overflow-x-auto">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={goPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">
                {viewMode === "month" || viewMode === "3mo"
                  ? `${format(days[0], "MMM yyyy")} → ${format(days[days.length - 1], "MMM yyyy")}`
                  : `${format(days[0], "dd MMM")} → ${format(days[days.length - 1], "dd MMM yyyy")}`}
              </span>
              <div className="flex items-center gap-2">
                <div className="flex rounded-md border overflow-hidden text-xs">
                  {VIEW_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setViewMode(opt.value)}
                      className={cn(
                        "px-2.5 py-1 transition",
                        viewMode === opt.value ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={goNext}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-4">
              {filteredProps.map((p) => (
                <StackedPropertyRow key={p.id} p={p} days={days} getDayStatus={getDayStatus} onSync={() => setIcalProperty(p)} />
              ))}
              {filteredProps.length === 0 && (
                <p className="text-center text-muted-foreground py-8 text-sm">{t("availability.noneAvailable")}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-success/30 inline-block" /> {t("availability.free")}</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block" /> Non confirmée</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-destructive/70 inline-block" /> {t("availability.booked")}</span>
            </div>
          </Card>
        </TabsContent>

        {/* LIST */}
        <TabsContent value="list">
          <Card className="p-4">
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs text-muted-foreground">{t("availability.from")}</label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("availability.to")}</label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {t("availability.foundCount", { count: availableInRange.length })}
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {availableInRange.map((p) => (
                <Card key={p.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{p.name}</h3>
                    <Button variant="outline" size="sm" onClick={() => setIcalProperty(p)} title={t("ical.title")}>
                      <Link2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {(p.city || p.country) && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" /> {[p.city, p.country].filter(Boolean).join(", ")}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">👤 {p.max_guests ?? "?"} max</p>
                  {p.categories && p.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
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
                </Card>
              ))}
              {availableInRange.length === 0 && (
                <p className="col-span-full text-center text-muted-foreground py-8">
                  {t("availability.noneAvailable")}
                </p>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {icalProperty && (
        <IcalManager
          propertyId={icalProperty.id}
          organizationId={icalProperty.org_id}
          open={!!icalProperty}
          onOpenChange={(o) => !o && setIcalProperty(null)}
        />
      )}
    </div>
  );
}

function StackedPropertyRow({
  p,
  days,
  getDayStatus,
  onSync,
}: {
  p: Property;
  days: Date[];
  getDayStatus: (id: string, d: Date) => "confirmed" | "pending" | null;
  onSync: () => void;
}) {
  // Chunk days into bands of 7
  const bands: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) bands.push(days.slice(i, i + 7));

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="min-w-0">
          <span className="font-medium truncate block text-sm">{p.name}</span>
          {(p.city || p.country) && (
            <span className="text-muted-foreground text-[11px] truncate block">
              {[p.city, p.country].filter(Boolean).join(", ")}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onSync} title="iCal">
          <Link2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-2">
        {bands.map((band, bi) => (
          <div key={bi} className="grid grid-cols-7 gap-1.5">
            {band.map((d) => {
              const status = getDayStatus(p.id, d);
              const label = status === "confirmed" ? "Réservé" : status === "pending" ? "Non confirmée" : "Libre";
              return (
                <div
                  key={d.toISOString()}
                  title={`${p.name} · ${format(d, "dd MMM")} · ${label}`}
                  className={cn(
                    "rounded-md min-h-[68px] sm:min-h-[80px] flex flex-col items-center justify-center text-xs border",
                    status === "confirmed" && "bg-destructive/70 text-destructive-foreground border-destructive/70",
                    status === "pending" && "bg-amber-400 text-amber-950 border-amber-400",
                    !status && "bg-success/15 border-success/20 text-foreground/70",
                  )}
                >
                  <span className="font-semibold leading-none text-base">{format(d, "dd")}</span>
                  <span className="opacity-70 leading-none mt-1 text-[11px]">{format(d, "EEE")}</span>
                </div>
              );
            })}
            {/* Fill empty cells if last band shorter */}
            {band.length < 7 &&
              Array.from({ length: 7 - band.length }).map((_, i) => <div key={`pad-${i}`} />)}
          </div>
        ))}
      </div>
    </Card>
  );
}
