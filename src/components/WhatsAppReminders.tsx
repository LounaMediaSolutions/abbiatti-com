import { useEffect, useState } from "react";
import { MessageCircle, Calendar, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface Reservation {
  id: string;
  guest_name: string | null;
  guest_phone: string | null;
  guest_language: string | null;
  check_in: string;
  check_out: string;
  property_id: string;
  organization_id: string;
}

interface Template {
  key: string;
  body_fr: string;
  body_en: string;
  body_ar: string;
}

interface Reminder {
  reservation: Reservation;
  type: "pre_arrival" | "arrival_day" | "post_checkout";
  label: string;
  badgeVariant: any;
  templateKey: string;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

const PORTAL_BASE =
  (typeof window !== "undefined" && window.location?.origin) || "https://escapar.net";

const fillTemplate = (
  body: string,
  r: Reservation,
  propName: string,
  portalSlug?: string | null,
) => {
  const portalLink = portalSlug ? `${PORTAL_BASE}/g/${portalSlug}` : "";
  return body
    .replace(/\{\{guest_name\}\}/gi, r.guest_name || "")
    .replace(/\{\{property\}\}/gi, propName)
    .replace(/\{\{check_in\}\}/gi, r.check_in)
    .replace(/\{\{check_out\}\}/gi, r.check_out)
    .replace(/\{\{portal_link\}\}/gi, portalLink);
};

const cleanPhone = (p: string) => p.replace(/[^\d+]/g, "").replace(/^\+/, "");

export const WhatsAppReminders = ({ orgId }: { orgId: string | null }) => {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [props, setProps] = useState<Record<string, string>>({});
  const [portalSlugs, setPortalSlugs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!orgId) return;
      const today = new Date();
      const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
      const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

      const { data: resas } = await supabase
        .from("reservations")
        .select("*")
        .eq("organization_id", orgId)
        .in("status", ["confirmed", "in_progress"])
        .or(`check_in.eq.${ymd(today)},check_in.eq.${ymd(tomorrow)},check_out.eq.${ymd(yesterday)}`);

      const { data: tpls } = await supabase
        .from("message_templates")
        .select("key, body_fr, body_en, body_ar")
        .eq("organization_id", orgId);

      const { data: properties } = await supabase
        .from("properties").select("id, name").eq("org_id", orgId);

      const propMap: Record<string, string> = {};
      (properties || []).forEach((p) => { propMap[p.id] = p.name; });
      setProps(propMap);
      setTemplates((tpls as any) || []);

      // Resolve guest-book slugs per property so {{portal_link}} can be filled.
      const { data: books } = await supabase
        .from("guest_books")
        .select("property_id, slug, active")
        .eq("organization_id", orgId)
        .eq("active", true);
      const slugMap: Record<string, string> = {};
      const bookRows = (books ?? []) as unknown as Array<{
        property_id: string;
        slug: string;
      }>;
      bookRows.forEach((b) => {
        slugMap[b.property_id] = b.slug;
      });
      setPortalSlugs(slugMap);

      const list: Reminder[] = [];
      const todayStr = ymd(today);
      const tomorrowStr = ymd(tomorrow);
      const yesterdayStr = ymd(yesterday);

      (resas || []).forEach((r: any) => {
        if (r.check_in === tomorrowStr) {
          list.push({ reservation: r, type: "pre_arrival", label: "Arrivée demain", badgeVariant: "default", templateKey: "pre_arrival" });
        } else if (r.check_in === todayStr) {
          list.push({ reservation: r, type: "arrival_day", label: "Arrive aujourd'hui", badgeVariant: "destructive", templateKey: "welcome" });
        } else if (r.check_out === yesterdayStr) {
          list.push({ reservation: r, type: "post_checkout", label: "Parti hier", badgeVariant: "secondary", templateKey: "post_checkout" });
        }
      });

      setReminders(list);
      setLoading(false);
    };
    load();
  }, [orgId]);

  const sendWhatsApp = (rem: Reminder) => {
    const r = rem.reservation;
    if (!r.guest_phone) return;
    const lang = r.guest_language || "fr";
    let tpl = templates.find((t) => t.key === rem.templateKey);
    if (!tpl) tpl = templates.find((t) => t.key.includes(rem.type));

    const fallback: Record<string, string> = {
      pre_arrival: `Bonjour ${r.guest_name || ""}, nous vous attendons demain à ${props[r.property_id] || ""} pour votre check-in. Bon voyage !`,
      arrival_day: `Bonjour ${r.guest_name || ""}, bienvenue ! Voici les infos pour votre arrivée à ${props[r.property_id] || ""}.`,
      post_checkout: `Bonjour ${r.guest_name || ""}, merci pour votre séjour à ${props[r.property_id] || ""}. À bientôt !`,
    };

    const body = tpl
      ? fillTemplate(
          lang === "ar" ? tpl.body_ar : lang === "en" ? tpl.body_en : tpl.body_fr,
          r,
          props[r.property_id] || "",
          portalSlugs[r.property_id],
        )
      : fallback[rem.type];

    const url = `https://wa.me/${cleanPhone(r.guest_phone)}?text=${encodeURIComponent(body)}`;
    window.open(url, "_blank");
  };

  if (loading || reminders.length === 0) return null;

  return (
    <Card className="p-5 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-secondary flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" /> Messages à envoyer
        </h2>
        <Badge variant="outline">{reminders.length}</Badge>
      </div>
      <div className="space-y-2">
        {reminders.map((rem, i) => {
          const r = rem.reservation;
          return (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant={rem.badgeVariant} className="text-xs">{rem.label}</Badge>
                  <span className="text-sm font-medium truncate">{r.guest_name || "Voyageur"}</span>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {props[r.property_id] || "—"} · {r.check_in} → {r.check_out}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => sendWhatsApp(rem)}
                disabled={!r.guest_phone}
                title={!r.guest_phone ? "Téléphone manquant" : ""}
              >
                <MessageCircle className="w-4 h-4 mr-1" />
                WhatsApp <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
