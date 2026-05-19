import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCohostKpis } from "@/hooks/useCohostKpis";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft, Calendar, DollarSign, BedDouble, TrendingUp,
  Clock, CheckCircle2, Wrench, Star, Phone, Home,
} from "lucide-react";

const ROLE_EMOJI: Record<string, string> = {
  cleaner: "🧹", driver: "🚗", decorator: "🎨", maintenance: "🔧", staff: "👤",
};

function fmtPct(v: number | null) { return v == null ? "—" : `${Math.round(v * 100)}%`; }
function fmtMin(v: number | null) { return v == null ? "—" : v < 60 ? `${Math.round(v)}min` : `${(v / 60).toFixed(1)}h`; }
function fmtHours(v: number | null) { return v == null ? "—" : v < 24 ? `${v.toFixed(1)}h` : `${(v / 24).toFixed(1)}j`; }

function ratingBadge(score: number) {
  if (score >= 80) return { label: "Excellent", color: "bg-green-500/10 text-green-700 dark:text-green-400" };
  if (score >= 60) return { label: "Bon", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400" };
  if (score >= 40) return { label: "Moyen", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" };
  return { label: "À améliorer", color: "bg-red-500/10 text-red-700 dark:text-red-400" };
}

export default function CohostDetail() {
  const { id } = useParams();
  const [profile, setProfile] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [employeeProfiles, setEmployeeProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const [profR, pmR] = await Promise.all([
        supabase.from("profiles").select("id,full_name,phone,avatar_url,org_id").eq("id", id).maybeSingle(),
        supabase.from("property_members").select("id,property_id,role,user_id,organization_id").or(`user_id.eq.${id}`),
      ]);
      setProfile(profR.data);

      const myAssign = (pmR.data ?? []).filter(m => m.user_id === id && m.role === "cohost");
      const propIds = myAssign.map(m => m.property_id);
      if (propIds.length) {
        const propsR = await supabase.from("properties").select("id,name,city,cover_image_url").in("id", propIds);
        setProperties(propsR.data ?? []);
        const allMembersR = await supabase.from("property_members").select("id,user_id,property_id,role").in("property_id", propIds);
        const emps = (allMembersR.data ?? []).filter(m => m.user_id !== id);
        setEmployees(emps);
        const empIds = Array.from(new Set(emps.map(e => e.user_id)));
        if (empIds.length) {
          const profs = await supabase.from("profiles").select("id,full_name,phone,avatar_url").in("id", empIds);
          const map: Record<string, any> = {};
          (profs.data ?? []).forEach(p => { map[p.id] = p; });
          setEmployeeProfiles(map);
        }
      }
      setLoading(false);
    })();
  }, [id]);

  const propertyIds = properties.map(p => p.id);
  const { total, currentMonth, loading: kpiLoading } = useCohostKpis(id ?? null, propertyIds);

  if (loading) return <div className="p-6">Chargement…</div>;
  if (!profile) return <div className="p-6">Co-hôte introuvable.</div>;

  // Score global service (0-100)
  const serviceScore = Math.round(
    ((total.tasksOnTimeRate ?? 0) * 30) +
    ((total.avgGuestRating ?? 0) / 5 * 30) +
    (total.avgResponseMinutes != null ? Math.max(0, 20 - total.avgResponseMinutes / 30) : 0) +
    (total.ticketsOpenCount === 0 ? 20 : Math.max(0, 20 - total.ticketsOpenCount * 2))
  );
  const sb = ratingBadge(serviceScore);

  const KpiCard = ({ icon: Icon, label, total: tv, month, color }: any) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className={`h-4 w-4 ${color ?? ""}`} /> {label}
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <div>
            <div className="text-2xl font-bold">{tv}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</div>
          </div>
          <div className="text-right">
            <div className="text-base font-semibold text-muted-foreground">{month}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Ce mois</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3">
          <Link to="/team"><ArrowLeft className="h-4 w-4 mr-1" /> Co-hôtes</Link>
        </Button>
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={profile.avatar_url ?? undefined} />
            <AvatarFallback className="text-2xl">🏠</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{profile.full_name || "—"}</h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
              {profile.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{profile.phone}</span>}
              <span>·</span>
              <span>{properties.length} propriété(s)</span>
              <span>·</span>
              <span>{employees.length} employé(s)</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground uppercase">Score service</div>
            <div className="text-3xl font-bold">{serviceScore}</div>
            <Badge className={sb.color}>{sb.label}</Badge>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">📊 Business</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={Calendar} label="Réservations" total={total.reservationsCount} month={currentMonth.reservationsCount} color="text-blue-500" />
          <KpiCard icon={DollarSign} label="Revenu généré" total={`${total.revenue.toFixed(0)}€`} month={`${currentMonth.revenue.toFixed(0)}€`} color="text-green-600" />
          <KpiCard icon={BedDouble} label="Nuits vendues" total={total.nightsSold} month={currentMonth.nightsSold} color="text-purple-500" />
          <KpiCard icon={TrendingUp} label="Taux occupation" total={fmtPct(total.occupancyRate)} month={fmtPct(currentMonth.occupancyRate)} color="text-amber-500" />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">⭐ Service client</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={Clock} label="Temps de réponse" total={fmtMin(total.avgResponseMinutes)} month={fmtMin(currentMonth.avgResponseMinutes)} color="text-cyan-500" />
          <KpiCard
            icon={CheckCircle2}
            label="Tâches à temps"
            total={`${fmtPct(total.tasksOnTimeRate)} (${total.tasksDoneCount}/${total.tasksTotalCount})`}
            month={`${fmtPct(currentMonth.tasksOnTimeRate)} (${currentMonth.tasksDoneCount}/${currentMonth.tasksTotalCount})`}
            color="text-emerald-500"
          />
          <KpiCard
            icon={Wrench}
            label="Tickets"
            total={`${total.ticketsResolvedCount} ✓ / ${total.ticketsOpenCount} ⏳`}
            month={`${currentMonth.ticketsResolvedCount} ✓ / ${currentMonth.ticketsOpenCount} ⏳`}
            color="text-orange-500"
          />
          <KpiCard
            icon={Star}
            label={`Note guests (${total.guestRatingCount})`}
            total={total.avgGuestRating ? `${total.avgGuestRating.toFixed(2)} / 5` : "—"}
            month={currentMonth.avgGuestRating ? `${currentMonth.avgGuestRating.toFixed(2)} / 5` : "—"}
            color="text-yellow-500"
          />
        </div>
        {total.avgTicketResolutionHours != null && (
          <p className="text-xs text-muted-foreground mt-2">
            Temps moyen de résolution des tickets : {fmtHours(total.avgTicketResolutionHours)}
          </p>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Home className="h-5 w-5" /> Propriétés gérées</CardTitle></CardHeader>
        <CardContent>
          {properties.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune propriété assignée.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {properties.map(p => (
                <div key={p.id} className="border rounded-lg p-3 flex items-center gap-3">
                  {p.cover_image_url ? (
                    <img src={p.cover_image_url} alt={p.name} className="h-14 w-14 rounded object-cover" />
                  ) : (
                    <div className="h-14 w-14 rounded bg-muted flex items-center justify-center"><Home className="h-6 w-6 text-muted-foreground" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    {p.city && <div className="text-xs text-muted-foreground">{p.city}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Équipe gérée ({employees.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun employé assigné aux propriétés de ce co-hôte.</p>
          ) : (
            employees.map(e => {
              const prof = employeeProfiles[e.user_id];
              const prop = properties.find(p => p.id === e.property_id);
              return (
                <div key={e.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={prof?.avatar_url ?? undefined} />
                      <AvatarFallback>{ROLE_EMOJI[e.role] ?? "👤"}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-sm font-medium">{prof?.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{prof?.phone}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{e.role}</Badge>
                    <span className="text-xs text-muted-foreground">{prop?.name ?? "?"}</span>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
