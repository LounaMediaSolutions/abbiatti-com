import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus, BarChart3, Calendar, Sparkles, Trash2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { seedDemoData, clearDemoData, type SeedOptions } from "@/lib/seedDemo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

type PartnerStat = {
  partner_id: string;
  partner_name: string;
  category: string | null;
  tier: "gold" | "silver" | "standard";
  active_coupons: number;
  claimed_30d: number;
  redeemed_30d: number;
  claimed_total: number;
  redeemed_total: number;
  subscription_active: boolean;
  subscription_until: string | null;
};

type RedemptionRow = {
  id: string;
  code: string;
  status: string;
  claimed_at: string;
  redeemed_at: string | null;
  guest_name: string | null;
  coupon_title: string | null;
};

export function PartnerPerformance({ orgId }: { orgId: string }) {
  const { user } = useAuth();
  const [stats, setStats] = useState<PartnerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [detailFor, setDetailFor] = useState<PartnerStat | null>(null);
  const [detailRows, setDetailRows] = useState<RedemptionRow[]>([]);

  const [showOptions, setShowOptions] = useState(false);
  const [optPartners, setOptPartners] = useState(3);
  const [optCoupons, setOptCoupons] = useState(2);
  const [optReds, setOptReds] = useState(3);
  const [optRate, setOptRate] = useState(60); // percent

  const handleSeed = async () => {
    if (!user) return;
    setSeeding(true);
    try {
      const opts: SeedOptions = {
        partnersCount: optPartners,
        couponsPerPartner: optCoupons,
        redemptionsPerCoupon: optReds,
        redeemedRate: optRate / 100,
      };
      const r = await seedDemoData(orgId, user.id, opts);
      toast.success(`Démo créée : ${r.partners} partenaires, ${r.coupons} coupons, ${r.redemptions} réclamations`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Erreur génération démo");
    } finally {
      setSeeding(false);
    }
  };

  const handleClear = async () => {
    if (!confirm("Supprimer toutes les données [DEMO] (partenaires, coupons, réclamations, invités factices) ?")) return;
    setClearing(true);
    try {
      const r = await clearDemoData(orgId);
      toast.success(`Démo nettoyée : ${r.partners} partenaires + ${r.guests} invités supprimés`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Erreur nettoyage");
    } finally {
      setClearing(false);
    }
  };

  const load = async () => {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceISO = since.toISOString();

    const { data: partners } = await supabase
      .from("partner_services")
      .select("id,name,category,tier,subscription_active,subscription_until")
      .eq("organization_id", orgId)
      .order("tier", { ascending: true });

    const { data: coupons } = await supabase
      .from("partner_coupons")
      .select("id,partner_id,active")
      .eq("organization_id", orgId);

    const { data: reds } = await supabase
      .from("coupon_redemptions")
      .select("partner_id,status,claimed_at")
      .eq("organization_id", orgId);

    const out: PartnerStat[] = (partners ?? []).map((p: any) => {
      const partnerCoupons = (coupons ?? []).filter((c: any) => c.partner_id === p.id);
      const partnerReds = (reds ?? []).filter((r: any) => r.partner_id === p.id);
      const recent = partnerReds.filter((r: any) => r.claimed_at >= sinceISO);
      return {
        partner_id: p.id,
        partner_name: p.name,
        category: p.category,
        tier: p.tier,
        active_coupons: partnerCoupons.filter((c: any) => c.active).length,
        claimed_30d: recent.length,
        redeemed_30d: recent.filter((r: any) => r.status === "redeemed").length,
        claimed_total: partnerReds.length,
        redeemed_total: partnerReds.filter((r: any) => r.status === "redeemed").length,
        subscription_active: p.subscription_active,
        subscription_until: p.subscription_until,
      };
    });
    setStats(out);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [orgId]);

  const openDetail = async (p: PartnerStat) => {
    setDetailFor(p);
    const { data } = await supabase
      .from("coupon_redemptions")
      .select("id,code,status,claimed_at,redeemed_at,guest_account_id,coupon_id")
      .eq("partner_id", p.partner_id)
      .order("claimed_at", { ascending: false })
      .limit(50);

    const rows = data ?? [];
    const guestIds = [...new Set(rows.map((r: any) => r.guest_account_id))];
    const couponIds = [...new Set(rows.map((r: any) => r.coupon_id))];
    const [{ data: guests }, { data: coupons }] = await Promise.all([
      guestIds.length
        ? supabase.from("guest_accounts").select("id,full_name").in("id", guestIds)
        : Promise.resolve({ data: [] }),
      couponIds.length
        ? supabase.from("partner_coupons").select("id,title").in("id", couponIds)
        : Promise.resolve({ data: [] }),
    ]);
    const gMap = new Map((guests ?? []).map((g: any) => [g.id, g.full_name]));
    const cMap = new Map((coupons ?? []).map((c: any) => [c.id, c.title]));
    setDetailRows(
      rows.map((r: any) => ({
        id: r.id,
        code: r.code,
        status: r.status,
        claimed_at: r.claimed_at,
        redeemed_at: r.redeemed_at,
        guest_name: gMap.get(r.guest_account_id) ?? null,
        coupon_title: cMap.get(r.coupon_id) ?? null,
      })),
    );
  };

  const estimatedReds = optPartners * optCoupons * optReds;
  const estimatedRedeemed = Math.round(estimatedReds * (optRate / 100));

  const DemoBanner = (
    <Card className="border-dashed border-primary/40 bg-primary/5 p-3 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium flex items-center gap-1">
            <Sparkles className="h-4 w-4 text-primary" /> Mode test
          </span>
          <p className="text-xs text-muted-foreground mt-0.5">
            ~{optPartners} partenaire(s), {optPartners * optCoupons} coupon(s), ~{estimatedReds} réclamations
            (~{estimatedRedeemed} utilisées) — préfixe <code>[DEMO]</code>.
          </p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          <Button size="sm" variant="ghost" onClick={() => setShowOptions((v) => !v)}>
            {showOptions ? "Masquer options" : "Options"}
          </Button>
          <Button size="sm" onClick={handleSeed} disabled={seeding}>
            {seeding ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
            Générer
          </Button>
          <Button size="sm" variant="outline" onClick={handleClear} disabled={clearing}>
            {clearing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
            Nettoyer
          </Button>
        </div>
      </div>

      {showOptions && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-primary/20">
          <div className="space-y-1">
            <Label className="text-xs">Partenaires : <span className="font-semibold">{optPartners}</span> <span className="text-muted-foreground">(max 3)</span></Label>
            <Slider value={[optPartners]} min={1} max={3} step={1} onValueChange={(v) => setOptPartners(v[0])} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Coupons par partenaire : <span className="font-semibold">{optCoupons}</span></Label>
            <Slider value={[optCoupons]} min={1} max={3} step={1} onValueChange={(v) => setOptCoupons(v[0])} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Réclamations par coupon : <span className="font-semibold">{optReds}</span></Label>
            <Slider value={[optReds]} min={0} max={10} step={1} onValueChange={(v) => setOptReds(v[0])} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Taux d'utilisation : <span className="font-semibold">{optRate}%</span></Label>
            <Slider value={[optRate]} min={0} max={100} step={5} onValueChange={(v) => setOptRate(v[0])} />
          </div>
        </div>
      )}
    </Card>
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }

  if (stats.length === 0) {
    return (
      <div className="space-y-3">
        {DemoBanner}
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Aucun partenaire pour le moment. Utilise le mode test ci-dessus pour générer un jeu de données démo.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Totals
  const totals = stats.reduce(
    (acc, s) => {
      acc.claimed += s.claimed_30d;
      acc.redeemed += s.redeemed_30d;
      acc.coupons += s.active_coupons;
      return acc;
    },
    { claimed: 0, redeemed: 0, coupons: 0 },
  );
  const globalConv = totals.claimed > 0 ? Math.round((totals.redeemed / totals.claimed) * 100) : 0;

  return (
    <div className="space-y-3">
      {DemoBanner}
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Coupons actifs</p>
          <p className="text-2xl font-bold">{totals.coupons}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Réclamés (30j)</p>
          <p className="text-2xl font-bold">{totals.claimed}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Utilisés (30j)</p>
          <p className="text-2xl font-bold text-emerald-600">{totals.redeemed}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Conversion</p>
          <p className={`text-2xl font-bold ${globalConv >= 50 ? "text-emerald-600" : globalConv >= 25 ? "text-amber-600" : "text-destructive"}`}>
            {globalConv}%
          </p>
        </Card>
      </div>

      {/* Per-partner table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Performance par partenaire (30 derniers jours)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {stats.map((p) => {
            const conv = p.claimed_30d > 0 ? Math.round((p.redeemed_30d / p.claimed_30d) * 100) : 0;
            const trend = p.claimed_30d === 0 ? "neutral" : conv >= 50 ? "up" : conv >= 25 ? "neutral" : "down";
            const subExpiringSoon =
              p.subscription_until && new Date(p.subscription_until).getTime() - Date.now() < 14 * 24 * 3600 * 1000;
            return (
              <div
                key={p.partner_id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-lg border hover:bg-muted/30 cursor-pointer"
                onClick={() => openDetail(p)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{p.partner_name}</span>
                    {p.tier === "gold" && <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-xs">Gold</Badge>}
                    {p.tier === "silver" && <Badge variant="outline" className="text-xs">Silver</Badge>}
                    {p.category && <Badge variant="secondary" className="text-xs">{p.category}</Badge>}
                    {p.subscription_active ? (
                      <Badge
                        variant="outline"
                        className={`text-xs ${subExpiringSoon ? "bg-amber-500/10 text-amber-700 border-amber-500/30" : "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"}`}
                      >
                        <Calendar className="h-2.5 w-2.5 mr-1" />
                        Abo {p.subscription_until ? `→ ${new Date(p.subscription_until).toLocaleDateString("fr-FR")}` : "actif"}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">Sans abo</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {p.active_coupons} coupon(s) actif(s) · {p.claimed_total} total réclamés · {p.redeemed_total} utilisés
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm">
                    <span className="font-semibold">{p.redeemed_30d}</span>
                    <span className="text-muted-foreground">/{p.claimed_30d}</span>
                  </div>
                  <div className={`text-xs font-medium flex items-center justify-end gap-1 ${
                    trend === "up" ? "text-emerald-600" : trend === "down" ? "text-destructive" : "text-muted-foreground"
                  }`}>
                    {trend === "up" && <TrendingUp className="h-3 w-3" />}
                    {trend === "down" && <TrendingDown className="h-3 w-3" />}
                    {trend === "neutral" && <Minus className="h-3 w-3" />}
                    {conv}%
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!detailFor} onOpenChange={(o) => !o && setDetailFor(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Détail · {detailFor?.partner_name}</DialogTitle>
          </DialogHeader>
          {detailRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune réclamation pour le moment.</p>
          ) : (
            <div className="space-y-1.5">
              {detailRows.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-sm p-2 rounded border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{r.guest_name ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">{r.coupon_title}</span>
                      <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Réclamé {new Date(r.claimed_at).toLocaleString("fr-FR")}
                      {r.redeemed_at && ` · Utilisé ${new Date(r.redeemed_at).toLocaleString("fr-FR")}`}
                    </div>
                  </div>
                  {r.status === "redeemed" ? (
                    <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white">Utilisé</Badge>
                  ) : r.status === "expired" ? (
                    <Badge variant="destructive">Expiré</Badge>
                  ) : (
                    <Badge variant="outline">En attente</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
