import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, Gift } from "lucide-react";

type Redemption = {
  id: string;
  code: string;
  status: "claimed" | "redeemed" | "expired";
  claimed_at: string;
  redeemed_at: string | null;
  coupon_id: string;
  partner_id: string;
  guest_account_id: string;
};

type Coupon = {
  id: string;
  title: string;
  discount_label: string;
  description: string | null;
  terms: string | null;
  valid_until: string | null;
  active: boolean;
};

type Partner = { id: string; name: string; category: string | null };
type Guest = { id: string; full_name: string | null };

export default function RedeemCoupon() {
  const { code } = useParams<{ code: string }>();
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [redemption, setRedemption] = useState<Redemption | null>(null);
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    void load();
  }, [code]);

  async function load() {
    setLoading(true);
    setError(null);
    const { data: r, error: rErr } = await supabase
      .from("coupon_redemptions")
      .select("*")
      .eq("code", code!)
      .maybeSingle();
    if (rErr || !r) {
      setError("Code introuvable. Vérifiez le QR ou demandez à l'invité de le régénérer.");
      setLoading(false);
      return;
    }
    setRedemption(r as Redemption);

    const [{ data: c }, { data: p }, { data: g }] = await Promise.all([
      supabase.from("partner_coupons").select("id,title,discount_label,description,terms,valid_until,active").eq("id", r.coupon_id).maybeSingle(),
      supabase.from("partner_services").select("id,name,category").eq("id", r.partner_id).maybeSingle(),
      supabase.from("guest_accounts").select("id,full_name").eq("id", r.guest_account_id).maybeSingle(),
    ]);
    setCoupon(c as Coupon | null);
    setPartner(p as Partner | null);
    setGuest(g as Guest | null);
    setLoading(false);
  }

  async function markRedeemed() {
    if (!redemption) return;
    setRedeeming(true);
    const { error: uErr } = await supabase
      .from("coupon_redemptions")
      .update({ status: "redeemed", redeemed_at: new Date().toISOString() })
      .eq("code", code!)
      .eq("status", "claimed");
    setRedeeming(false);
    if (uErr) {
      setError(uErr.message);
      return;
    }
    await load();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !redemption) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center space-y-3">
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="font-semibold text-lg">Coupon invalide</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isUsed = redemption.status === "redeemed";
  const isExpired = redemption.status === "expired" ||
    (coupon?.valid_until && new Date(coupon.valid_until) < new Date());
  const isInactive = coupon && coupon.active === false;
  const canRedeem = !isUsed && !isExpired && !isInactive;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="max-w-md w-full shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Gift className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">{coupon?.title ?? "Coupon"}</CardTitle>
          {partner && (
            <p className="text-sm text-muted-foreground">
              {partner.name}
              {partner.category && ` · ${partner.category}`}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-3 bg-primary/5 rounded-lg border border-primary/20">
            <p className="text-2xl font-bold text-primary">{coupon?.discount_label}</p>
          </div>

          {guest?.full_name && (
            <div className="text-sm">
              <span className="text-muted-foreground">Invité :</span>{" "}
              <span className="font-medium">{guest.full_name}</span>
            </div>
          )}

          <div className="text-sm">
            <span className="text-muted-foreground">Code :</span>{" "}
            <span className="font-mono font-medium">{redemption.code}</span>
          </div>

          {coupon?.description && (
            <p className="text-sm text-muted-foreground border-l-2 border-muted pl-3">
              {coupon.description}
            </p>
          )}

          {coupon?.terms && (
            <div className="text-xs text-muted-foreground">
              <strong>Conditions :</strong> {coupon.terms}
            </div>
          )}

          {/* Status block */}
          {isUsed && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-center space-y-1">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">Déjà utilisé</p>
              <p className="text-xs text-muted-foreground">
                {redemption.redeemed_at && new Date(redemption.redeemed_at).toLocaleString("fr-FR")}
              </p>
            </div>
          )}

          {!isUsed && (isExpired || isInactive) && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center space-y-1">
              <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
              <p className="font-semibold text-destructive">
                {isInactive ? "Coupon désactivé" : "Coupon expiré"}
              </p>
            </div>
          )}

          {canRedeem && (
            <>
              <Badge variant="outline" className="w-full justify-center py-2 bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400">
                Coupon valide ✓
              </Badge>
              <Button
                onClick={markRedeemed}
                disabled={redeeming}
                size="lg"
                className="w-full"
              >
                {redeeming ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Validation…</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4 mr-2" /> Marquer comme utilisé</>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                À valider devant l'invité après application de la réduction.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
