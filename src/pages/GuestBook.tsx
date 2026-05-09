import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Wifi, KeyRound, LogOut, Phone, AlertTriangle, Utensils, MapPin, BookOpen, Loader2, Copy, MessageCircle, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { AdBanner } from "@/components/AdBanner";
import { toast } from "sonner";

interface GuestBook {
  id: string;
  property_id: string;
  organization_id: string;
  language: string;
  wifi_name: string | null;
  wifi_password: string | null;
  check_in_instructions: string | null;
  check_out_instructions: string | null;
  house_rules: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  emergency_phone: string | null;
  restaurants: Array<{ name: string; description?: string; phone?: string }>;
  attractions: Array<{ name: string; description?: string }>;
  extra_notes: string | null;
}

interface Property {
  name: string;
  city: string | null;
  cover_image_url: string | null;
}

type Lang = "fr" | "en" | "ar";

const T: Record<Lang, Record<string, string>> = {
  fr: {
    notFound: "Livret introuvable", invalidLink: "Ce lien est invalide ou désactivé.",
    wifi: "WiFi", network: "Réseau", password: "Mot de passe",
    checkin: "Check-in", checkout: "Check-out", rules: "Règles de la maison",
    restaurants: "Restaurants recommandés", attractions: "À visiter",
    needHelp: "Besoin d'aide ?", emergency: "Urgence", report: "Signaler un problème",
    copied: "Copié !", whatsapp: "Contacter sur WhatsApp",
  },
  en: {
    notFound: "Guest book not found", invalidLink: "This link is invalid or disabled.",
    wifi: "WiFi", network: "Network", password: "Password",
    checkin: "Check-in", checkout: "Check-out", rules: "House rules",
    restaurants: "Recommended restaurants", attractions: "Things to do",
    needHelp: "Need help?", emergency: "Emergency", report: "Report an issue",
    copied: "Copied!", whatsapp: "Contact via WhatsApp",
  },
  ar: {
    notFound: "الدليل غير موجود", invalidLink: "هذا الرابط غير صالح أو معطّل.",
    wifi: "واي فاي", network: "الشبكة", password: "كلمة المرور",
    checkin: "تسجيل الدخول", checkout: "تسجيل الخروج", rules: "قواعد المنزل",
    restaurants: "مطاعم موصى بها", attractions: "أماكن للزيارة",
    needHelp: "تحتاج مساعدة؟", emergency: "طوارئ", report: "الإبلاغ عن مشكلة",
    copied: "تم النسخ!", whatsapp: "تواصل عبر واتساب",
  },
};

const GuestBook = () => {
  const { slug } = useParams<{ slug: string }>();
  const [book, setBook] = useState<GuestBook | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<Lang>("fr");
  const [copied, setCopied] = useState<string | null>(null);

  const t = useMemo(() => T[lang], [lang]);
  const isRtl = lang === "ar";

  useEffect(() => {
    const load = async () => {
      if (!slug) return;
      const { data: bookRows } = await (supabase as any).rpc("get_public_guest_book", { _slug: slug });
      const bookData = Array.isArray(bookRows) ? bookRows[0] : bookRows;
      if (!bookData) { setLoading(false); return; }
      setBook(bookData as any);
      setLang(((bookData as any).language as Lang) || "fr");
      const { data: prop } = await supabase
        .from("properties").select("name, city, cover_image_url").eq("id", bookData.property_id).maybeSingle();
      setProperty(prop as any);
      setLoading(false);
    };
    load();
  }, [slug]);

  const copy = (val: string, key: string) => {
    navigator.clipboard.writeText(val);
    setCopied(key);
    toast.success(t.copied);
    setTimeout(() => setCopied(null), 1500);
  };

  const whatsappUrl = (phone: string) => {
    const clean = phone.replace(/[^0-9+]/g, "").replace(/^\+/, "");
    return `https://wa.me/${clean}`;
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!book) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="p-8 text-center max-w-md">
          <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-xl font-semibold mb-2">{t.notFound}</h1>
          <p className="text-muted-foreground">{t.invalidLink}</p>
        </Card>
      </div>
    );
  }

  return (
    <div dir={isRtl ? "rtl" : "ltr"} className="min-h-screen bg-background pb-12">
      {/* Hero */}
      <div className="relative h-48 md:h-64 bg-gradient-to-br from-primary to-primary-glow">
        {property?.cover_image_url && (
          <img src={property.cover_image_url} alt={property.name} className="absolute inset-0 w-full h-full object-cover opacity-40" />
        )}
        {/* Lang switcher */}
        <div className="absolute top-3 right-3 z-10 flex gap-1 bg-background/95 rounded-full p-1 shadow">
          {(["fr", "en", "ar"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="relative h-full flex flex-col items-center justify-center text-primary-foreground p-6 text-center">
          <BookOpen className="w-8 h-8 mb-2" />
          <h1 className="text-2xl md:text-3xl font-bold">{property?.name}</h1>
          {property?.city && <p className="text-sm opacity-90 mt-1">{property.city}</p>}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-6 space-y-4">
        <AdBanner placement="public_book" organizationId={book?.organization_id} />
        {/* WiFi */}
        {(book.wifi_name || book.wifi_password) && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Wifi className="w-5 h-5 text-primary" />
              <h2 className="font-semibold">{t.wifi}</h2>
            </div>
            <div className="space-y-2 text-sm">
              {book.wifi_name && (
                <button onClick={() => copy(book.wifi_name!, "name")} className="w-full flex justify-between items-center p-3 bg-muted hover:bg-muted/70 rounded-lg transition">
                  <span className="text-muted-foreground">{t.network}</span>
                  <span className="flex items-center gap-2 font-mono font-medium">{book.wifi_name}{copied === "name" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3 opacity-50" />}</span>
                </button>
              )}
              {book.wifi_password && (
                <button onClick={() => copy(book.wifi_password!, "pwd")} className="w-full flex justify-between items-center p-3 bg-muted hover:bg-muted/70 rounded-lg transition">
                  <span className="text-muted-foreground">{t.password}</span>
                  <span className="flex items-center gap-2 font-mono font-medium">{book.wifi_password}{copied === "pwd" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3 opacity-50" />}</span>
                </button>
              )}
            </div>
          </Card>
        )}

        {book.check_in_instructions && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3"><KeyRound className="w-5 h-5 text-primary" /><h2 className="font-semibold">{t.checkin}</h2></div>
            <p className="text-sm whitespace-pre-wrap">{book.check_in_instructions}</p>
          </Card>
        )}

        {book.check_out_instructions && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3"><LogOut className="w-5 h-5 text-primary" /><h2 className="font-semibold">{t.checkout}</h2></div>
            <p className="text-sm whitespace-pre-wrap">{book.check_out_instructions}</p>
          </Card>
        )}

        {book.house_rules && (
          <Card className="p-5">
            <h2 className="font-semibold mb-3">{t.rules}</h2>
            <p className="text-sm whitespace-pre-wrap">{book.house_rules}</p>
          </Card>
        )}

        {book.restaurants && book.restaurants.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3"><Utensils className="w-5 h-5 text-primary" /><h2 className="font-semibold">{t.restaurants}</h2></div>
            <div className="space-y-3">
              {book.restaurants.map((r, i) => (
                <div key={i} className="border-l-2 border-primary pl-3">
                  <div className="font-medium text-sm">{r.name}</div>
                  {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                  {r.phone && <a href={`tel:${r.phone}`} className="text-xs text-primary">{r.phone}</a>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {book.attractions && book.attractions.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3"><MapPin className="w-5 h-5 text-primary" /><h2 className="font-semibold">{t.attractions}</h2></div>
            <div className="space-y-3">
              {book.attractions.map((a, i) => (
                <div key={i} className="border-l-2 border-secondary pl-3">
                  <div className="font-medium text-sm">{a.name}</div>
                  {a.description && <div className="text-xs text-muted-foreground">{a.description}</div>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {book.extra_notes && (
          <Card className="p-5"><p className="text-sm whitespace-pre-wrap">{book.extra_notes}</p></Card>
        )}

        {/* Contact + Report */}
        <Card className="p-5 bg-primary text-primary-foreground">
          <h2 className="font-semibold mb-3">{t.needHelp}</h2>
          {book.contact_name && <p className="text-sm mb-2">{book.contact_name}</p>}
          {book.contact_phone && (
            <div className="flex flex-col gap-2 mb-3">
              <a href={`tel:${book.contact_phone}`} className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4" /> {book.contact_phone}
              </a>
              <a href={whatsappUrl(book.contact_phone)} target="_blank" rel="noreferrer">
                <Button variant="secondary" className="w-full bg-[#25D366] hover:bg-[#20BD5A] text-white border-0">
                  <MessageCircle className="w-4 h-4 mr-2" />{t.whatsapp}
                </Button>
              </a>
            </div>
          )}
          {book.emergency_phone && (
            <Badge variant="destructive" className="mb-3">
              <AlertTriangle className="w-3 h-3 mr-1" /> {t.emergency} : {book.emergency_phone}
            </Badge>
          )}
          <Link to={`/r/${slug}`}>
            <Button variant="secondary" className="w-full mt-2">
              <AlertTriangle className="w-4 h-4 mr-2" />{t.report}
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
};

export default GuestBook;
