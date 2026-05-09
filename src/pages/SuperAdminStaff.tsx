import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Shield, ArrowLeft, UserPlus, Trash2, Wrench, Code, Calculator, LifeBuoy, Crown } from "lucide-react";
import { Unauthorized } from "@/components/Unauthorized";
import { isAuthzError } from "@/lib/authzError";

const PLATFORM_ROLES = [
  { value: "technician", label: "Technicien", icon: Wrench, color: "bg-blue-600" },
  { value: "developer", label: "Développeur", icon: Code, color: "bg-violet-600" },
  { value: "accountant", label: "Comptable", icon: Calculator, color: "bg-emerald-600" },
  { value: "support", label: "Support", icon: LifeBuoy, color: "bg-amber-600" },
  { value: "super_admin", label: "Super Admin", icon: Crown, color: "bg-rose-600" },
] as const;

type StaffMember = {
  user_id: string;
  role: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

export default function SuperAdminStaff() {
  const { user, loading } = useAuth();
  const [isSuper, setIsSuper] = useState<boolean | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [denied, setDenied] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<string>("technician");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setIsSuper(false);
      return;
    }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle()
      .then(({ data }) => setIsSuper(!!data));
  }, [user?.id, loading]);

  const load = async () => {
    const platformRoleVals = PLATFORM_ROLES.map((r) => r.value);
    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", platformRoleVals as any)
      .is("organization_id", null);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    if (ids.length === 0) {
      setStaff([]);
      return;
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", ids);
    const merged: StaffMember[] = (roles ?? []).map((r) => {
      const p = (profiles ?? []).find((x) => x.id === r.user_id);
      return {
        user_id: r.user_id,
        role: r.role,
        full_name: p?.full_name ?? null,
        email: null,
        phone: p?.phone ?? null,
      };
    });
    setStaff(merged);
  };

  useEffect(() => {
    if (isSuper) load();
  }, [isSuper]);

  if (loading || isSuper === null) {
    return <div className="flex min-h-screen items-center justify-center text-slate-300">Chargement…</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuper) return <Unauthorized />;
  if (denied) return <Unauthorized message="Cette action est réservée aux Super Admins. Votre session ne dispose pas des droits requis." />;

  const createStaff = async () => {
    if (!email || !password || !role) {
      toast({ title: "Champs requis", description: "Email, mot de passe et rôle.", variant: "destructive" });
      return;
    }
    setCreating(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke("create-platform-staff", {
      body: { email, password, full_name: fullName, phone, role },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });
    setCreating(false);
    if (error || (data as any)?.error) {
      if (await isAuthzError(error, data)) {
        setOpen(false);
        setDenied(true);
        return;
      }
      toast({
        title: "Erreur",
        description: (data as any)?.error ?? error?.message ?? "Échec",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Compte créé", description: `${email} (${role})` });
    setOpen(false);
    setEmail(""); setPassword(""); setFullName(""); setPhone(""); setRole("technician");
    load();
  };

  const removeRole = async (m: StaffMember) => {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", m.user_id)
      .eq("role", m.role as any)
      .is("organization_id", null);
    if (error) {
      if (await isAuthzError(error, null)) {
        setDenied(true);
        return;
      }
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Rôle retiré" });
    load();
  };

  const roleMeta = (r: string) => PLATFORM_ROLES.find((x) => x.value === r);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link to="/super-admin">
              <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white">
                <ArrowLeft className="mr-2 h-4 w-4" /> Retour
              </Button>
            </Link>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-rose-600">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Équipe plateforme</h1>
              <p className="text-xs text-slate-400">Techniciens, développeurs, comptables, support</p>
            </div>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                <UserPlus className="mr-2 h-4 w-4" /> Nouveau compte
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 text-slate-100 border-slate-800">
              <DialogHeader>
                <DialogTitle>Créer un compte plateforme</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Rôle</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORM_ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nom complet</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)}
                    className="bg-slate-800 border-slate-700" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className="bg-slate-800 border-slate-700" />
                </div>
                <div>
                  <Label>Téléphone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)}
                    className="bg-slate-800 border-slate-700" />
                </div>
                <div>
                  <Label>Mot de passe temporaire</Label>
                  <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)}
                    className="bg-slate-800 border-slate-700" placeholder="Min 6 caractères" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
                <Button onClick={createStaff} disabled={creating}
                  className="bg-amber-600 hover:bg-amber-700 text-white">
                  {creating ? "Création…" : "Créer"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-3">
          {staff.length === 0 && (
            <Card className="border-slate-800 bg-slate-900/50 p-8 text-center text-slate-400">
              Aucun membre de l'équipe plateforme. Créez le premier compte.
            </Card>
          )}
          {staff.map((m) => {
            const meta = roleMeta(m.role);
            const Icon = meta?.icon ?? Shield;
            return (
              <Card key={`${m.user_id}-${m.role}`} className="border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${meta?.color ?? "bg-slate-700"}`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium">{m.full_name || "(Sans nom)"}</p>
                      <p className="text-xs text-slate-400">
                        {m.phone || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-slate-800 text-slate-200">{meta?.label ?? m.role}</Badge>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-rose-400 hover:text-rose-300">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-slate-900 text-slate-100 border-slate-800">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Retirer ce rôle ?</AlertDialogTitle>
                          <AlertDialogDescription className="text-slate-400">
                            Le rôle « {meta?.label ?? m.role} » sera retiré. Le compte utilisateur reste actif.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeRole(m)}
                            className="bg-rose-600 hover:bg-rose-700">
                            Retirer
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
