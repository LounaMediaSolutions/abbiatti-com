import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Gift, CheckCircle2, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

type Coupon = {
  id: string;
  partner_id: string;
  title: string;
  description: string | null;
  discount_label: string;
  terms: string | null;
  valid_until: string | null;
};

type Partner = { id: string; name: string; category: string | null };

type Redemption = {
  id: string;
  coupon_id: string;
  code: string;
  status: "claimed" | "redeemed" | "expired";
  redeemed_at: string | null;
};

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `ABB-${s}`;
}

export function GuestCoupons({
  orgId,
  guestAccountId,
}: {
  orgId: string;
  guestAccountId: string;
}) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [partners, setPartners] = useState<Map<string, Partner>>(new Map());
  const [myRedemptions, setMyRedemptions] = useState<Map<string, Redemption>>(new Map());
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [showQR, setShowQR] = useState<Redemption | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: c }, { data: r }] = await Promise.all([
      supabase
        .from("partner_coupons")
        .select("id,partner_id,title,description,discount_label,terms,valid_until")
        .eq("organization_id", orgId),
      supabase
        .from("coupon_redemptions")
        .select("id,coupon_id,code,status,redeemed_at")
        .eq("guest_account_id", guestAccountId),
    ]);

    const couponList = (c ?? []) as Coupon[];
    setCoupons(couponList);

    const partnerIds = [...new Set(couponList.map((co) => co.partner_id))];
    if (partnerIds.length > 0) {
      const { data: p } = await supabase
        .from("partner_services")
        .select("id,name,category")
        .in("id", partnerIds);
      setPartners(new Map((p ?? []).map((x: any) => [x.id, x])));
    }

    setMyRedemptions(new Map(((r ?? []) as Redemption[]).map((x) => [x.coupon_id, x])));
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [orgId, guestAccountId]);

  const claim = async (coupon: Coupon) => {
    setClaiming(coupon.id);
    const code = generateCode();
    const { data, error } = await supabase
      .from("coupon_redemptions")
      .insert({
        organization_id: orgId,
        coupon_id: coupon.id,
        partner_id: coupon.partner_id,
        guest_account_id: guestAccountId,
        code,
        status: "claimed",
      })
      .select("id,coupon_id,code,status,redeemed_at")
      .single();
    setClaiming(null);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Coupon déjà réclamé" : error.message);
      return;
    }
    if (data) {
      const newMap = new Map(myRedemptions);
      newMap.set(coupon.id, data as Redemption);
      setMyRedemptions(newMap);
      setShowQR(data as Redemption);
    }
  };

  if (loading) {
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  }

  if (coupons.length === 0) {
    return null;
  }

  const redeemUrlBase = `${window.location.origin}/redeem/`;

  return (
    <div>
      <h2 className="font-semibold mb-2 flex items-center gap-2">
        <Gift className="h-4 w-4 text-primary" /> Coupons & offres exclusives
      </h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {coupons.map((c) => {
          const partner = partners.get(c.partner_id);
          const red = myRedemptions.get(c.id);
          const isUsed = red?.status === "redeemed";
          const isClaimed = red?.status === "claimed";
          const expired = c.valid_until && new Date(c.valid_until) < new Date();
          return (
            <Card
              key={c.id}
              className={`p-4 border-l-4 ${
                isUsed
                  ? "border-l-emerald-500 bg-emerald-500/5"
                  : isClaimed
                  ? "border-l-amber-500 bg-amber-500/5"
                  : "border-l-primary"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{c.title}</div>
                  {partner && (
                    <p className="text-xs text-muted-foreground">{partner.name}</p>
                  )}
                </div>
                <Badge className="bg-primary text-primary-foreground hover:bg-primary text-sm font-bold whitespace-nowrap">
                  {c.discount_label}
                </Badge>
              </div>
              {c.description && (
                <p className="text-xs text-muted-foreground mb-2">{c.description}</p>
              )}
              {c.terms && (
                <p className="text-xs text-muted-foreground italic mb-2">⚠ {c.terms}</p>
              )}
              {c.valid_until && (
                <p className="text-xs text-muted-foreground mb-2">
                  Valable jusqu'au {new Date(c.valid_until).toLocaleDateString("fr-FR")}
                </p>
              )}

              {isUsed ? (
                <Badge className="w-full justify-center py-2 bg-emerald-500 hover:bg-emerald-500 text-white">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Utilisé
                </Badge>
              ) : isClaimed ? (
                <Button
                  size="sm"
                  className="w-full"
                  variant="secondary"
                  onClick={() => setShowQR(red!)}
                >
                  <QrCode className="h-4 w-4 mr-2" /> Voir mon QR code
                </Button>
              ) : expired ? (
                <Badge variant="outline" className="w-full justify-center py-2 text-muted-foreground">
                  Expiré
                </Badge>
              ) : (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => claim(c)}
                  disabled={claiming === c.id}
                >
                  {claiming === c.id ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> …</>
                  ) : (
                    <><Gift className="h-4 w-4 mr-2" /> Réclamer ce coupon</>
                  )}
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      {/* QR dialog */}
      <Dialog open={!!showQR} onOpenChange={(o) => !o && setShowQR(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Présentez ce QR au partenaire</DialogTitle>
          </DialogHeader>
          {showQR && (
            <div className="space-y-3 text-center">
              <div className="bg-white p-4 rounded-lg flex items-center justify-center">
                <QRCodeSVG value={`${redeemUrlBase}${showQR.code}`} size={220} level="H" />
              </div>
              <div className="font-mono text-lg font-bold tracking-wider">{showQR.code}</div>
              <p className="text-xs text-muted-foreground">
                Le partenaire scanne ce code pour valider votre réduction.
                <br />
                Conservez-le visible jusqu'à la validation.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
