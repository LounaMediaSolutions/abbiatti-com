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
import { CalendarRange, CalendarCheck, ChevronLeft, ChevronRight, MapPin, Link2, Users } from "lucide-react";
import { addDays, addMonths, endOfMonth, format, getDay, isSameDay, isWithinInterval, parseISO, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { PROPERTY_CATEGORIES } from "./Properties";
import { cn } from "@/lib/utils";
import { IcalManager } from "@/components/IcalManager";

type Property = {
  id: string;
  org_id: string;
  name: string;
  city: string | null;
  country: string | null;
  max_guests: number | null;
  categories: string[] | null;
};

// Map of column-name → fallback value used when the live schema doesn't have
// that column. Lets us keep rendering the page even when the deployed
// `properties` shape lags behind what this file would like to select.
const PROPERTY_COLUMN_DEFAULTS: Record<string, unknown> = {
  city: null,
  country: null,
  max_guests: null,
  categories: null,
  active: true,
};

const extractMissingPropertyColumn = (error: { message?: string } | null) => {
  const message = error?.message ?? "";
  const schemaCacheMatch = message.match(/'([^']+)' column of 'properties'/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];
  const postgresMatch = message.match(/column properties\.([a-z_]+)/i);
  return postgresMatch?.[1] ?? null;
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
const LONG_VIEW_MONTHS = 1; // nombre de mois affichés en mode long verrouillé
const CONFIRMED_STATUSES = ["confirmed", "in_progress", "completed"];

// Monday-first weekday labels for the calendar header. Derived from date-fns
// so they follow the active locale rather than being hand-listed.
const WEEKDAY_LABELS = Array.from({ length: 7 }, (_, i) =>
  format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), i), "EEEEEE"),
);

export default function Availability({ propertyId, embedded = false }: { propertyId?: string; embedded?: boolean } = {}) {
  const { t } = useTranslation();
  const [activeCats, setActiveCats] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<Date>(startOfDay(new Date()));
  // Vue verrouillée sur le mode long (plusieurs mois) par défaut
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [monthAnchor, setMonthAnchor] = useState<Date>(startOfMonth(new Date()));
  const [from, setFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(addDays(new Date(), 7), "yyyy-MM-dd"));
  const [icalProperty, setIcalProperty] = useState<Property | null>(null);

  const { data: allProperties = [] } = useQuery({
    queryKey: ["avail-properties"],
    queryFn: async () => {
      // The live schema has drifted from this file's expectations more than
      // once (e.g. no `status` column, no `property_type` column). Rather
      // than hand-coding the right column list per deployment, we ask for
      // every column we'd like and strip whichever the schema cache rejects,
      // retrying until success — exactly what Properties.tsx does. RLS
      // already scopes the rows to the user's org + cohost assignments.
      const WANTED_COLUMNS = [
        "id",
        "org_id",
        "name",
        "city",
        "country",
        "max_guests",
        "categories",
        "active",
      ];
      const missing = new Set<string>();
      let rows: Array<Property & { active?: boolean | null }> = [];
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const cols = WANTED_COLUMNS.filter((c) => !missing.has(c));
        const { data, error } = await supabase
          .from("properties")
          .select(cols.join(", "))
          .order("name");
        if (!error) {
          rows = ((data ?? []) as unknown) as Array<
            Property & { active?: boolean | null }
          >;
          // Backfill any column we couldn't ask for so downstream code
          // (filters, calendar coloring) still gets a sensible shape.
          rows = rows.map((row) => {
            const filled: Record<string, unknown> = { ...row };
            for (const col of missing) {
              if (!(col in filled)) {
                filled[col] = PROPERTY_COLUMN_DEFAULTS[col] ?? null;
              }
            }
            return filled as Property & { active?: boolean | null };
          });
          break;
        }
        const missingCol = extractMissingPropertyColumn(error);
        if (!missingCol || missing.has(missingCol) || !cols.includes(missingCol)) {
          // Different kind of error (RLS, network, …) — surface and bail
          // with whatever we already had, so the page still renders.
          toast.error(`Availability: ${error.message}`);
          break;
        }
        missing.add(missingCol);
      }
      // Show every property unless it's been explicitly deactivated.
      return rows.filter((p) => p.active !== false) as Property[];
    },
  });

  // When rendered scoped to a single property (e.g. inside the property detail
  // tabs), narrow the list to just that property so every downstream view
  // (calendar grid + availability list) only shows it.
  const properties = useMemo(
    () => (propertyId ? allProperties.filter((p) => p.id === propertyId) : allProperties),
    [allProperties, propertyId],
  );

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
    <div className={cn("space-y-6", !embedded && "max-w-7xl mx-auto")}>
      {!embedded && (
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <CalendarRange className="h-6 w-6" /> {t("availability.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("availability.subtitle")}</p>
        </div>
      )}

      {/* Category filter — only useful when browsing all properties */}
      {!embedded && (
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
      )}

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">{t("availability.calendar")}</TabsTrigger>
          <TabsTrigger value="list">{t("availability.list")}</TabsTrigger>
        </TabsList>

        {/* CALENDAR */}
        <TabsContent value="calendar">
          <Card className="p-3 sm:p-4">
            {/* Toolbar — month navigation + jump-to-today */}
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 cursor-pointer"
                  onClick={goPrev}
                  aria-label={t("availability.prevMonth", { defaultValue: "Previous month" })}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 cursor-pointer"
                  onClick={goNext}
                  aria-label={t("availability.nextMonth", { defaultValue: "Next month" })}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <h2 className="ml-1 text-base font-semibold capitalize text-secondary">
                  {format(days[0], "MMMM yyyy")}
                </h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 cursor-pointer gap-1.5 text-xs"
                onClick={() => setMonthAnchor(startOfMonth(new Date()))}
              >
                <CalendarCheck className="h-3.5 w-3.5" />
                {t("availability.today", { defaultValue: "Today" })}
              </Button>
            </div>

            {filteredProps.length === 0 ? (
              <div className="py-12 text-center">
                <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <CalendarRange className="h-6 w-6" />
                </div>
                <p className="text-sm text-muted-foreground">{t("availability.noneAvailable")}</p>
              </div>
            ) : (
              <div className="max-w-md">
                {/* Shared weekday header — aligns with every property's grid below */}
                <div className="mb-1.5 grid grid-cols-7 gap-1 px-0.5">
                  {WEEKDAY_LABELS.map((w) => (
                    <div
                      key={w}
                      className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {w}
                    </div>
                  ))}
                </div>
                <div className="divide-y divide-border/60">
                  {filteredProps.map((p) => (
                    <StackedPropertyRow key={p.id} p={p} days={days} getDayStatus={getDayStatus} onSync={() => setIcalProperty(p)} />
                  ))}
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-200 bg-emerald-100" /> {t("availability.free")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" /> Non confirmée
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-500" /> {t("availability.booked")}
              </span>
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
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" /> {p.max_guests ?? "?"} max
                  </p>
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
  const today = new Date();
  // Leading empty cells so day 1 lands under its real weekday column
  // (Monday-first, matching the shared header above).
  const leadingPad = days.length > 0 ? (getDay(days[0]) + 6) % 7 : 0;

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="block truncate text-sm font-semibold text-secondary">{p.name}</span>
          {(p.city || p.country) && (
            <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              {[p.city, p.country].filter(Boolean).join(", ")}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 cursor-pointer text-muted-foreground hover:text-primary"
          onClick={onSync}
          title="iCal"
        >
          <Link2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingPad }).map((_, i) => (
          <div key={`pad-${i}`} aria-hidden="true" />
        ))}
        {days.map((d) => {
          const status = getDayStatus(p.id, d);
          const isToday = isSameDay(d, today);
          const label =
            status === "confirmed" ? "Réservé" : status === "pending" ? "Non confirmée" : "Libre";
          return (
            <div
              key={d.toISOString()}
              title={`${p.name} · ${format(d, "dd MMM")} · ${label}`}
              className={cn(
                "relative flex h-8 items-center justify-center rounded-md border text-xs transition-colors",
                status === "confirmed" && "border-transparent bg-rose-500/90 text-white",
                status === "pending" && "border-transparent bg-amber-400 text-amber-950",
                !status && "border-emerald-100 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
                isToday && "font-bold ring-2 ring-primary ring-offset-1 ring-offset-card",
              )}
            >
              <span className="font-semibold leading-none">{format(d, "d")}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
