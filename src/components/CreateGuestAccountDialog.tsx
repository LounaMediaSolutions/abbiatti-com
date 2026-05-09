import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  reservation: {
    id: string;
    guest_name: string | null;
    guest_phone: string | null;
    guest_language: string | null;
    property_id: string;
  };
}

function generatePassword() {
  return Math.random().toString(36).slice(-4) + Math.random().toString(36).slice(-4).toUpperCase() + "!1";
}

export function CreateGuestAccountDialog({ open, onOpenChange, reservation }: Props) {
  const [loading, setLoading] = useState(false);
  const [identifierType, setIdentifierType] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState(reservation.guest_phone ?? "");
  const [fullName, setFullName] = useState(reservation.guest_name ?? "");
  const [language, setLanguage] = useState(reservation.guest_language ?? "fr");
  const [password, setPassword] = useState(generatePassword());
  const [credentials, setCredentials] = useState<{ login: string; password: string } | null>(null);

  const handleCreate = async () => {
    if (identifierType === "email" && !email) return toast.error("Email requis");
    if (identifierType === "phone" && !phone) return toast.error("Téléphone requis");
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("create-guest-account", {
      body: {
        email: identifierType === "email" ? email : undefined,
        phone: identifierType === "phone" ? phone : undefined,
        password,
        full_name: fullName,
        language,
        reservation_id: reservation.id,
        property_id: reservation.property_id,
      },
    });
    setLoading(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Erreur");
      return;
    }
    setCredentials({ login: identifierType === "email" ? email : phone, password });
    toast.success("Compte invité créé");
  };

  const copyAll = () => {
    if (!credentials) return;
    const portalUrl = `${window.location.origin}/guest`;
    const txt = `Bonjour ${fullName},\nVotre espace invité :\n${portalUrl}\nIdentifiant : ${credentials.login}\nMot de passe : ${credentials.password}`;
    navigator.clipboard.writeText(txt);
    toast.success("Copié");
  };

  const handleClose = (o: boolean) => {
    if (!o) {
      setCredentials(null);
      setPassword(generatePassword());
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Créer un compte invité</DialogTitle>
        </DialogHeader>

        {credentials ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Partagez ces identifiants avec votre invité. Le compte sera supprimé 3 jours après le check-out.
            </p>
            <div className="rounded-md border p-3 space-y-1 text-sm">
              <div><strong>Lien :</strong> {window.location.origin}/guest</div>
              <div><strong>Identifiant :</strong> {credentials.login}</div>
              <div><strong>Mot de passe :</strong> {credentials.password}</div>
            </div>
            <Button variant="outline" onClick={copyAll} className="w-full">
              <Copy className="h-4 w-4 mr-2" /> Copier le message
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Méthode</Label>
              <Select value={identifierType} onValueChange={(v) => setIdentifierType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Téléphone (SMS/WhatsApp)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {identifierType === "email" ? (
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Téléphone (format international, ex: +33...)</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            )}
            <div className="space-y-1">
              <Label>Nom complet</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Langue</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Mot de passe temporaire</Label>
              <div className="flex gap-2">
                <Input value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button variant="outline" type="button" onClick={() => setPassword(generatePassword())}>
                  Régénérer
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {credentials ? (
            <Button onClick={() => handleClose(false)}>Fermer</Button>
          ) : (
            <Button onClick={handleCreate} disabled={loading}>
              {loading ? "Création..." : "Créer le compte"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
