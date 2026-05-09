import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Wifi, KeyRound, MessageCircle, Camera, Sparkles, Phone, LogOut, Upload, Loader2, Eye, Smartphone, Monitor, ArrowLeft } from "lucide-react";
import { PHOTO_ACCEPT, validatePhotoFile } from "@/lib/photoUpload";
import { GuestCoupons } from "@/components/GuestCoupons";
import { AdBanner } from "@/components/AdBanner";

type PreviewMode = false | { reservationId: string };


type GuestAccount = {
  id: string;
  organization_id: string;
  reservation_id: string | null;
  property_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  language: string;
  marketing_consent: boolean;
};

export default function GuestPortal() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { reservationId } = useParams<{ reservationId?: string }>();
  const preview: PreviewMode = reservationId ? { reservationId } : false;
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [ga, setGa] = useState<GuestAccount | null>(null);
  const [book, setBook] = useState<any>(null);
  const [property, setProperty] = useState<any>(null);
  const [partners, setPartners] = useState<any[]>([]);
  const [rentals, setRentals] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [uploads, setUploads] = useState<any[]>([]);
  const [uploadComment, setUploadComment] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/auth"); return; }
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("role, organization_id").eq("user_id", user.id);
      const isGuest = (roles ?? []).some((r: any) => r.role === "guest");
      const isStaff = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "cohost");

      let g: GuestAccount | null = null;

      if (preview) {
        if (!isStaff) { navigate("/", { replace: true }); return; }
        // Load reservation, then guest_account (or fake one) for preview
        const { data: res } = await supabase.from("reservations").select("*").eq("id", preview.reservationId).maybeSingle();
        if (!res) { toast.error("Réservation introuvable"); navigate(-1 as any); return; }
        const { data: gExisting } = await supabase
          .from("guest_accounts").select("*")
          .eq("reservation_id", res.id).is("deleted_at", null).maybeSingle();
        g = (gExisting as any) ?? {
          id: "preview-" + res.id,
          organization_id: res.organization_id,
          reservation_id: res.id,
          property_id: res.property_id,
          full_name: res.guest_name ?? "Aperçu",
          email: null, phone: res.guest_phone ?? null,
          language: res.guest_language ?? "fr",
          marketing_consent: false,
        };
      } else {
        if (!isGuest) { navigate("/", { replace: true }); return; }
        const { data } = await supabase.from("guest_accounts").select("*").eq("user_id", user.id).maybeSingle();
        if (!data) {
          toast.error("Aucun compte invité");
          await signOut();
          navigate("/auth", { replace: true });
          return;
        }
        g = data as any;
      }

      setGa(g);
      if (g!.property_id) {
        const { data: p } = await supabase.from("properties").select("*").eq("id", g!.property_id).maybeSingle();
        setProperty(p);
        const { data: b } = await supabase.from("guest_books").select("*").eq("property_id", g!.property_id).eq("active", true).maybeSingle();
        setBook(b);
      }
      const { data: ps } = await supabase
        .from("partner_services")
        .select("*")
        .eq("organization_id", g!.organization_id)
        .eq("active", true)
        .eq("visible_to_guest", true)
        .order("sort_order", { ascending: true });
      const tierRank: Record<string, number> = { gold: 0, silver: 1, standard: 2 };
      const sorted = (ps ?? []).slice().sort((a, b) => {
        const ra = tierRank[a.tier ?? "standard"] ?? 99;
        const rb = tierRank[b.tier ?? "standard"] ?? 99;
        if (ra !== rb) return ra - rb;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
      setPartners(sorted);
      const { data: rs } = await supabase.from("rental_items").select("*").eq("organization_id", g!.organization_id).eq("active", true).order("sort_order");
      setRentals(rs ?? []);
      if (!String(g!.id).startsWith("preview-")) {
        await loadMessages(g!.id);
        await loadUploads(g!.id);
      }
      setBusy(false);
    })();
  }, [user, loading, reservationId]);


  async function loadMessages(gaId: string) {
    const { data } = await supabase.from("guest_messages").select("*").eq("guest_account_id", gaId).order("created_at");
    setMessages(data ?? []);
  }
  async function loadUploads(gaId: string) {
    const { data } = await supabase.from("guest_uploads").select("*").eq("guest_account_id", gaId).order("created_at", { ascending: false });
    setUploads(data ?? []);
  }

  const sendMessage = async () => {
    if (preview) return toast.info("Aperçu : envoi de message désactivé");
    if (!newMsg.trim() || !ga || !user) return;
    const { error } = await supabase.from("guest_messages").insert({
      organization_id: ga.organization_id,
      guest_account_id: ga.id,
      sender_role: "guest",
      sender_id: user.id,
      body: newMsg.trim(),
    });
    if (error) return toast.error(error.message);
    setNewMsg("");
    loadMessages(ga.id);
  };

  const handleUpload = async (file: File) => {
    if (preview) return toast.info("Aperçu : upload désactivé");
    if (!ga || !user) return;
    const v = validatePhotoFile(file);
    if (v.ok === false) return toast.error(v.error);
    setUploading(true);
    const path = `${ga.organization_id}/${ga.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("guest-uploads").upload(path, file);
    if (upErr) { setUploading(false); return toast.error(upErr.message); }
    const { error } = await supabase.from("guest_uploads").insert({
      organization_id: ga.organization_id,
      guest_account_id: ga.id,
      storage_path: path,
      comment: uploadComment || null,
    });
    setUploading(false);
    if (error) return toast.error(error.message);
    setUploadComment("");
    loadUploads(ga.id);
    toast.success("Merci pour votre partage !");
  };

  const toggleConsent = async (val: boolean) => {
    if (preview) return toast.info("Aperçu : modification désactivée");
    if (!ga) return;
    const { error } = await supabase.from("guest_accounts").update({ marketing_consent: val }).eq("id", ga.id);
    if (error) return toast.error(error.message);
    setGa({ ...ga, marketing_consent: val });
  };


  const publicUrl = (p: string) => supabase.storage.from("guest-uploads").getPublicUrl(p).data.publicUrl;

  if (busy) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  const wrapClass = preview && device === "mobile"
    ? "mx-auto my-4 w-[390px] max-w-full border rounded-2xl shadow-lg overflow-hidden bg-background"
    : "min-h-screen bg-background";

  return (
    <div className={preview ? "min-h-screen bg-muted/30 pb-8" : "min-h-screen bg-background"}>
      {preview && (
        <div className="sticky top-0 z-50 bg-amber-500 text-white text-sm px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            <span className="font-medium">Aperçu Guest</span>
            {property && <span className="opacity-90">· {property.name}</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md overflow-hidden bg-white/20">
              <button onClick={() => setDevice("mobile")} className={`px-2 py-1 ${device === "mobile" ? "bg-white text-amber-600" : ""}`}><Smartphone className="h-3.5 w-3.5" /></button>
              <button onClick={() => setDevice("desktop")} className={`px-2 py-1 ${device === "desktop" ? "bg-white text-amber-600" : ""}`}><Monitor className="h-3.5 w-3.5" /></button>
            </div>
            <Button size="sm" variant="secondary" onClick={() => navigate(-1)} className="h-7">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Retour
            </Button>
          </div>
        </div>
      )}
      <div className={wrapClass}>
        <header className="border-b bg-card">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div>
              <h1 className="font-bold text-lg">Bonjour {ga?.full_name || "Invité"} 👋</h1>
              {property && <p className="text-xs text-muted-foreground">{property.name}</p>}
            </div>
            {!preview && (
              <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate("/auth"); }}>
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </header>

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        {ga && <AdBanner placement="guest_hero" organizationId={ga.organization_id} />}
        <Tabs defaultValue="info">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="info">Infos</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="share">Partager</TabsTrigger>
            <TabsTrigger value="account">Compte</TabsTrigger>
          </TabsList>

          {/* INFO */}
          <TabsContent value="info" className="space-y-3 mt-4">
            {!book ? (
              <Card className="p-6 text-center text-muted-foreground">Livret non disponible</Card>
            ) : (
              <>
                {(book.wifi_name || book.wifi_password) && (
                  <Card className="p-4">
                    <div className="flex items-center gap-2 font-semibold mb-2"><Wifi className="h-4 w-4" /> WiFi</div>
                    <div className="text-sm space-y-1">
                      {book.wifi_name && <div><strong>Réseau :</strong> {book.wifi_name}</div>}
                      {book.wifi_password && <div><strong>Mot de passe :</strong> {book.wifi_password}</div>}
                    </div>
                  </Card>
                )}
                {book.check_in_instructions && (
                  <Card className="p-4">
                    <div className="flex items-center gap-2 font-semibold mb-2"><KeyRound className="h-4 w-4" /> Check-in</div>
                    <p className="text-sm whitespace-pre-wrap">{book.check_in_instructions}</p>
                  </Card>
                )}
                {book.check_out_instructions && (
                  <Card className="p-4">
                    <div className="font-semibold mb-2">Check-out</div>
                    <p className="text-sm whitespace-pre-wrap">{book.check_out_instructions}</p>
                  </Card>
                )}
                {book.house_rules && (
                  <Card className="p-4">
                    <div className="font-semibold mb-2">Règles de la maison</div>
                    <p className="text-sm whitespace-pre-wrap">{book.house_rules}</p>
                  </Card>
                )}
                {(book.contact_phone || book.emergency_phone) && (
                  <Card className="p-4">
                    <div className="flex items-center gap-2 font-semibold mb-2"><Phone className="h-4 w-4" /> Contacts</div>
                    {book.contact_phone && <div className="text-sm">Hôte : {book.contact_name} — {book.contact_phone}</div>}
                    {book.emergency_phone && <div className="text-sm">Urgence : {book.emergency_phone}</div>}
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* SERVICES */}
          <TabsContent value="services" className="space-y-4 mt-4">
            <div>
              <h2 className="font-semibold mb-2 flex items-center gap-2"><Sparkles className="h-4 w-4" /> Nos services</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {rentals.length === 0 && <p className="text-sm text-muted-foreground">Aucun service disponible.</p>}
                {rentals.map((r) => (
                  <Card key={r.id} className="p-4">
                    <div className="font-medium">{r.name}</div>
                    {r.notes && <p className="text-xs text-muted-foreground mt-1">{r.notes}</p>}
                    <div className="text-sm mt-2 space-x-2">
                      {r.price_day && <Badge variant="outline">{r.price_day}€/jour</Badge>}
                      {r.price_stay && <Badge variant="outline">{r.price_stay}€/séjour</Badge>}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
            {ga && <GuestCoupons orgId={ga.organization_id} guestAccountId={ga.id} />}
            {ga && <AdBanner placement="guest_inline" organizationId={ga.organization_id} />}
            <div>
              <h2 className="font-semibold mb-2">Nos partenaires recommandés</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {partners.length === 0 && <p className="text-sm text-muted-foreground">Aucun partenaire.</p>}
                {partners.map((p) => {
                  const tier = (p.tier ?? "standard") as "gold" | "silver" | "standard";
                  const isGold = tier === "gold";
                  const isSilver = tier === "silver";
                  const wa = p.whatsapp_phone || p.contact_phone;
                  const waDigits = wa ? String(wa).replace(/[^\d+]/g, "").replace(/^\+/, "") : "";
                  return (
                    <Card
                      key={p.id}
                      className={`p-4 ${
                        isGold
                          ? "border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-transparent shadow-md"
                          : isSilver
                          ? "border-slate-400/50"
                          : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium">{p.name}</div>
                        {isGold && (
                          <Badge className="bg-amber-500 text-white hover:bg-amber-500 gap-1">
                            <Sparkles className="h-3 w-3" /> Gold
                          </Badge>
                        )}
                        {isSilver && (
                          <Badge variant="outline" className="border-slate-400 text-slate-600 dark:text-slate-300">
                            Silver
                          </Badge>
                        )}
                      </div>
                      {p.category && <Badge variant="secondary" className="mt-1">{p.category}</Badge>}
                      {p.description && <p className="text-xs text-muted-foreground mt-2">{p.description}</p>}
                      {p.price && <p className="text-sm mt-1 font-medium">{p.price}</p>}

                      <div className="flex flex-wrap gap-2 mt-3">
                        {waDigits && (
                          <Button asChild size="sm" variant="outline" className="bg-emerald-500/10 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400">
                            <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noopener noreferrer">
                              WhatsApp
                            </a>
                          </Button>
                        )}
                        {p.contact_phone && (
                          <Button asChild size="sm" variant="outline">
                            <a href={`tel:${p.contact_phone}`}>
                              <Phone className="h-3 w-3 mr-1" /> Appeler
                            </a>
                          </Button>
                        )}
                        {p.website_url && (
                          <Button asChild size="sm" variant="outline">
                            <a href={p.website_url} target="_blank" rel="noopener noreferrer">
                              Site / Menu
                            </a>
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* CHAT */}
          <TabsContent value="chat" className="mt-4">
            <Card className="flex flex-col h-[60vh]">
              <div className="flex-1 overflow-auto p-4 space-y-2">
                {messages.length === 0 && <p className="text-sm text-muted-foreground text-center">Posez votre question ✨</p>}
                {messages.map((m) => (
                  <div key={m.id} className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.sender_role === "guest" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {m.body}
                  </div>
                ))}
              </div>
              <div className="border-t p-2 flex gap-2">
                <Input value={newMsg} onChange={(e) => setNewMsg(e.target.value)} placeholder="Votre message..." onKeyDown={(e) => e.key === "Enter" && sendMessage()} />
                <Button onClick={sendMessage}><MessageCircle className="h-4 w-4" /></Button>
              </div>
            </Card>
          </TabsContent>

          {/* SHARE */}
          <TabsContent value="share" className="space-y-4 mt-4">
            <Card className="p-4 space-y-3">
              <h2 className="font-semibold flex items-center gap-2"><Camera className="h-4 w-4" /> Partagez votre expérience</h2>
              <p className="text-sm text-muted-foreground">Vos photos et commentaires nous aident à faire connaître nos logements. Merci 💛</p>
              <Textarea placeholder="Votre commentaire (optionnel)" value={uploadComment} onChange={(e) => setUploadComment(e.target.value)} />
              <Label className="block">
                <input type="file" accept={PHOTO_ACCEPT} hidden onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                <Button asChild disabled={uploading}>
                  <span><Upload className="h-4 w-4 mr-2" />{uploading ? "Envoi..." : "Choisir une photo"}</span>
                </Button>
              </Label>
            </Card>
            {uploads.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {uploads.map((u) => (
                  <div key={u.id} className="relative">
                    {u.storage_path && <img src={publicUrl(u.storage_path)} alt="" className="w-full h-32 object-cover rounded" />}
                    {u.comment && <p className="text-xs mt-1 line-clamp-2">{u.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ACCOUNT */}
          <TabsContent value="account" className="space-y-3 mt-4">
            <Card className="p-4 space-y-2 text-sm">
              <div><strong>Nom :</strong> {ga?.full_name}</div>
              {ga?.email && <div><strong>Email :</strong> {ga.email}</div>}
              {ga?.phone && <div><strong>Téléphone :</strong> {ga.phone}</div>}
              <p className="text-xs text-muted-foreground pt-2">
                Votre accès sera désactivé 3 jours après votre check-out.
              </p>
            </Card>
            <Card className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">Recevoir nos offres</div>
                <p className="text-xs text-muted-foreground">Nous envoyer des offres et nouveautés par email/SMS</p>
              </div>
              <Switch checked={ga?.marketing_consent} onCheckedChange={toggleConsent} />
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      </div>
    </div>
  );
}
