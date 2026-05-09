import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export type AdPlacement = "guest_hero" | "guest_inline" | "public_book" | "welcome_footer";

interface AdBannerProps {
  placement: AdPlacement;
  /** Provide orgId for guest/public contexts where it's known */
  organizationId?: string;
  className?: string;
}

interface BannerRow {
  id: string;
  organization_id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  placement: AdPlacement;
}

/** Ensures a stable per-browser session key for impression dedup */
function getSessionKey(): string {
  try {
    let k = localStorage.getItem("ad_session_key");
    if (!k) {
      k = crypto.randomUUID();
      localStorage.setItem("ad_session_key", k);
    }
    return k;
  } catch {
    return "anon";
  }
}

export function AdBanner({ placement, organizationId, className = "" }: AdBannerProps) {
  const [banner, setBanner] = useState<BannerRow | null>(null);
  const loggedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchBanner = async () => {
      const today = new Date().toISOString().slice(0, 10);
      let q = supabase
        .from("ad_banners")
        .select("id,organization_id,title,subtitle,image_url,cta_label,cta_url,placement")
        .eq("placement", placement)
        .eq("active", true)
        .eq("visible_to_guest", true)
        .lte("start_date", today)
        .gte("end_date", today)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
      if (organizationId) q = q.eq("organization_id", organizationId);
      const { data } = await q.maybeSingle();
      if (!cancelled) setBanner((data as BannerRow) ?? null);
    };
    void fetchBanner();
    return () => {
      cancelled = true;
    };
  }, [placement, organizationId]);

  // Log one impression per session per banner
  useEffect(() => {
    if (!banner) return;
    if (loggedRef.current === banner.id) return;
    loggedRef.current = banner.id;
    const sessionKey = getSessionKey();
    const dedupKey = `ad_imp_${banner.id}_${new Date().toISOString().slice(0, 10)}`;
    try {
      if (sessionStorage.getItem(dedupKey)) return;
      sessionStorage.setItem(dedupKey, "1");
    } catch { /* ignore */ }
    void supabase.from("ad_impressions").insert({
      organization_id: banner.organization_id,
      banner_id: banner.id,
      placement: banner.placement,
      session_key: sessionKey,
    });
  }, [banner]);

  if (!banner) return null;

  const isHero = placement === "guest_hero" || placement === "public_book";

  return (
    <Card
      className={`overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5 ${className}`}
    >
      <div className={`flex ${isHero ? "flex-col sm:flex-row" : "flex-row"} gap-3 items-center p-3`}>
        {banner.image_url && (
          <img
            src={banner.image_url}
            alt={banner.title}
            className={`object-cover rounded-md ${isHero ? "h-32 sm:h-28 w-full sm:w-44" : "h-16 w-16"}`}
            loading="lazy"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Sponsorisé
            </span>
          </div>
          <h3 className={`font-semibold ${isHero ? "text-base sm:text-lg" : "text-sm"} mt-0.5`}>
            {banner.title}
          </h3>
          {banner.subtitle && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{banner.subtitle}</p>
          )}
        </div>
        {banner.cta_url && banner.cta_label && (
          <Button
            asChild
            size={isHero ? "default" : "sm"}
            className="shrink-0"
          >
            <a href={banner.cta_url} target="_blank" rel="noopener noreferrer">
              {banner.cta_label}
              <ExternalLink className="h-3.5 w-3.5 ml-1" />
            </a>
          </Button>
        )}
      </div>
    </Card>
  );
}
