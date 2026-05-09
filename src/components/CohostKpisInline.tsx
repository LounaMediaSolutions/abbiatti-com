import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCohostKpis } from "@/hooks/useCohostKpis";
import { Calendar, DollarSign, BedDouble, TrendingUp, Clock, CheckCircle2, Wrench, Star, ExternalLink } from "lucide-react";

interface Props {
  cohostUserId: string;
  propertyIds: string[];
}

function fmtPct(v: number | null) {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}
function fmtMin(v: number | null) {
  if (v == null) return "—";
  if (v < 60) return `${Math.round(v)}min`;
  return `${(v / 60).toFixed(1)}h`;
}
function fmtHours(v: number | null) {
  if (v == null) return "—";
  if (v < 24) return `${v.toFixed(1)}h`;
  return `${(v / 24).toFixed(1)}j`;
}

export function CohostKpisInline({ cohostUserId, propertyIds }: Props) {
  const { total, currentMonth, loading } = useCohostKpis(cohostUserId, propertyIds);

  if (loading) {
    return <div className="text-xs text-muted-foreground">Chargement KPIs…</div>;
  }

  const Kpi = ({ icon: Icon, label, total: t, month: m, color }: any) => (
    <div className="bg-background rounded-md p-2.5 border">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${color ?? ""}`} /> {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-base font-semibold">{t}</span>
        <span className="text-[10px] text-muted-foreground">ce mois: {m}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi icon={Calendar} label="Réservations" total={total.reservationsCount} month={currentMonth.reservationsCount} color="text-blue-500" />
        <Kpi icon={DollarSign} label="Revenu" total={`${total.revenue.toFixed(0)}€`} month={`${currentMonth.revenue.toFixed(0)}€`} color="text-green-600" />
        <Kpi icon={BedDouble} label="Nuits" total={total.nightsSold} month={currentMonth.nightsSold} color="text-purple-500" />
        <Kpi icon={TrendingUp} label="Occupation" total={fmtPct(total.occupancyRate)} month={fmtPct(currentMonth.occupancyRate)} color="text-amber-500" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi icon={Clock} label="Réponse moy." total={fmtMin(total.avgResponseMinutes)} month={fmtMin(currentMonth.avgResponseMinutes)} color="text-cyan-500" />
        <Kpi icon={CheckCircle2} label="Tâches à temps" total={fmtPct(total.tasksOnTimeRate)} month={fmtPct(currentMonth.tasksOnTimeRate)} color="text-emerald-500" />
        <Kpi icon={Wrench} label="Tickets résolus" total={total.ticketsResolvedCount} month={currentMonth.ticketsResolvedCount} color="text-orange-500" />
        <Kpi icon={Star} label="Note guests" total={total.avgGuestRating ? `${total.avgGuestRating.toFixed(1)}⭐` : "—"} month={currentMonth.avgGuestRating ? `${currentMonth.avgGuestRating.toFixed(1)}⭐` : "—"} color="text-yellow-500" />
      </div>
      <div className="flex justify-end pt-1">
        <Button asChild size="sm" variant="outline">
          <Link to={`/cohosts/${cohostUserId}`}>
            Voir détails <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
