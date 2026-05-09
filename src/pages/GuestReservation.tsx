import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Wifi, KeyRound, Phone, MapPin, BookOpen, CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export default function GuestReservation() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      if (!slug) return;
      const { data, error } = await supabase.rpc("get_public_reservation_book", { _slug: slug });
      if (!error && data && data.length) setData(data[0]);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-lg font-semibold">Lien invalide</p>
          <p className="text-muted-foreground text-sm mt-2">Ce lien n'est plus actif.</p>
        </div>
      </div>
    );
  }

  const gb = data.guest_book ?? {};
  return (
    <div className="min-h-screen bg-background pb-12">
      {data.property_cover && (
        <div className="h-48 md:h-64 w-full overflow-hidden">
          <img src={data.property_cover} alt={data.property_name} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
        <div>
          <Badge variant="secondary" className="mb-2">Votre séjour</Badge>
          <h1 className="text-2xl md:text-3xl font-bold">Bienvenue {data.guest_name ?? ""} 👋</h1>
          <p className="text-muted-foreground flex items-center gap-1 mt-1">
            <MapPin className="h-4 w-4" /> {data.property_name}{data.property_city ? ` · ${data.property_city}` : ""}
          </p>
        </div>

        <Card className="p-4">
          <div className="flex items-center gap-2 font-semibold mb-2">
            <CalendarDays className="h-5 w-5 text-primary" /> Dates
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Arrivée</div>
              <div className="font-medium">{data.check_in}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Départ</div>
              <div className="font-medium">{data.check_out}</div>
            </div>
          </div>
        </Card>

        {(gb.wifi_name || gb.wifi_password) && (
          <Card className="p-4">
            <div className="flex items-center gap-2 font-semibold mb-2">
              <Wifi className="h-5 w-5 text-primary" /> WiFi
            </div>
            {gb.wifi_name && <div className="text-sm"><span className="text-muted-foreground">Réseau : </span>{gb.wifi_name}</div>}
            {gb.wifi_password && <div className="text-sm"><span className="text-muted-foreground">Mot de passe : </span><code>{gb.wifi_password}</code></div>}
          </Card>
        )}

        {gb.check_in_instructions && (
          <Card className="p-4">
            <div className="flex items-center gap-2 font-semibold mb-2"><KeyRound className="h-5 w-5 text-primary" /> Check-in</div>
            <p className="text-sm whitespace-pre-line">{gb.check_in_instructions}</p>
          </Card>
        )}
        {gb.check_out_instructions && (
          <Card className="p-4">
            <div className="font-semibold mb-2">Check-out</div>
            <p className="text-sm whitespace-pre-line">{gb.check_out_instructions}</p>
          </Card>
        )}
        {gb.house_rules && (
          <Card className="p-4">
            <div className="flex items-center gap-2 font-semibold mb-2"><BookOpen className="h-5 w-5 text-primary" /> Règles</div>
            <p className="text-sm whitespace-pre-line">{gb.house_rules}</p>
          </Card>
        )}
        {(gb.contact_phone || gb.emergency_phone) && (
          <Card className="p-4">
            <div className="flex items-center gap-2 font-semibold mb-2"><Phone className="h-5 w-5 text-primary" /> Contact</div>
            {gb.contact_name && <div className="text-sm">{gb.contact_name}</div>}
            {gb.contact_phone && <a href={`tel:${gb.contact_phone}`} className="text-sm text-primary block">{gb.contact_phone}</a>}
            {gb.emergency_phone && <a href={`tel:${gb.emergency_phone}`} className="text-sm text-destructive block mt-1">Urgence : {gb.emergency_phone}</a>}
          </Card>
        )}
      </div>
    </div>
  );
}
