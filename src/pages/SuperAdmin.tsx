import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Shield, Trash2, Pause, Play, Pencil, LogOut, Search, Receipt, Users, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Unauthorized } from "@/components/Unauthorized";

type Org = {
  id: string;
  name: string;
  brand_color: string | null;
  logo_url: string | null;
  suspended: boolean;
  created_at: string;
  max_cohosts: number;
  max_employees: number;
  trial_ends_at: string;
};

type OrgWithStats = Org & {
  member_count: number;
  property_count: number;
  cohost_count: number;
  employee_count: number;
};

export default function SuperAdmin() {
  const { user, loading } = useAuth();
  const [isSuper, setIsSuper] = useState<boolean | null>(null);
  const [orgs, setOrgs] = useState<OrgWithStats[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Org | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#1e40af");
  const [editMaxCohosts, setEditMaxCohosts] = useState(1);
  const [editMaxEmployees, setEditMaxEmployees] = useState(2);
  const [editTrialEndsAt, setEditTrialEndsAt] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setIsSuper(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "super_admin")
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.error("[SuperAdmin] role check failed:", error);
          setIsSuper(false);
          return;
        }
        setIsSuper(!!data);
      } catch (e) {
        if (cancelled) return;
        console.error("[SuperAdmin] role check threw:", e);
        setIsSuper(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, loading]);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#1e40af");
  const [newMaxCohosts, setNewMaxCohosts] = useState(1);
  const [newMaxEmployees, setNewMaxEmployees] = useState(2);
  const [newTrialDays, setNewTrialDays] = useState(14);

  const createOrg = async () => {
    if (!newName.trim()) {
      return toast({ title: "Nom requis", variant: "destructive" });
    }
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + (newTrialDays || 14));
    const { error } = await supabase.from("organizations").insert({
      name: newName.trim(),
      brand_color: newColor,
      max_cohosts: newMaxCohosts,
      max_employees: newMaxEmployees,
      trial_ends_at: trialEnd.toISOString(),
    });
    if (error) {
      return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
    toast({ title: "Agence créée" });
    setCreating(false);
    setNewName("");
    setNewColor("#1e40af");
    setNewMaxCohosts(1);
    setNewMaxEmployees(2);
    setNewTrialDays(14);
    loadOrgs();
  };

  const loadOrgs = async () => {
    const { data: orgsData, error } = await supabase
      .from("organizations")
      .select("id, name, brand_color, logo_url, suspended, created_at, max_cohosts, max_employees, trial_ends_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    const ids = (orgsData ?? []).map((o) => o.id);
    const [{ data: roles }, { data: props }] = await Promise.all([
      supabase.from("user_roles").select("organization_id, role").in("organization_id", ids),
      supabase.from("properties").select("organization_id").in("organization_id", ids),
    ]);
    const employeeRoles = ["cleaner", "driver", "decorator", "maintenance", "staff"];
    const enriched: OrgWithStats[] = (orgsData ?? []).map((o) => {
      const orgRoles = (roles ?? []).filter((r: any) => r.organization_id === o.id);
      return {
        ...o,
        member_count: orgRoles.length,
        cohost_count: orgRoles.filter((r: any) => r.role === "cohost").length,
        employee_count: orgRoles.filter((r: any) => employeeRoles.includes(r.role)).length,
        property_count: (props ?? []).filter((p: any) => p.organization_id === o.id).length,
      };
    });
    setOrgs(enriched);
  };

  useEffect(() => {
    if (isSuper) loadOrgs();
  }, [isSuper]);

  if (loading || isSuper === null) {
    return <div className="flex min-h-screen items-center justify-center text-slate-300">Chargement…</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuper) return <Unauthorized />;

  const toggleSuspend = async (org: OrgWithStats) => {
    const { error } = await supabase
      .from("organizations")
      .update({ suspended: !org.suspended })
      .eq("id", org.id);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: org.suspended ? "Agence réactivée" : "Agence suspendue" });
    loadOrgs();
  };

  const deleteOrg = async (org: OrgWithStats) => {
    const { error } = await supabase.from("organizations").delete().eq("id", org.id);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: "Agence supprimée" });
    loadOrgs();
  };

  const openEdit = (org: Org) => {
    setEditing(org);
    setEditName(org.name);
    setEditColor(org.brand_color ?? "#1e40af");
    setEditMaxCohosts(org.max_cohosts ?? 1);
    setEditMaxEmployees(org.max_employees ?? 2);
    setEditTrialEndsAt(org.trial_ends_at ? org.trial_ends_at.slice(0, 10) : "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase
      .from("organizations")
      .update({
        name: editName,
        brand_color: editColor,
        max_cohosts: editMaxCohosts,
        max_employees: editMaxEmployees,
        trial_ends_at: editTrialEndsAt ? new Date(editTrialEndsAt).toISOString() : null,
      })
      .eq("id", editing.id);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: "Agence mise à jour" });
    setEditing(null);
    loadOrgs();
  };

  const extendTrial = async (org: OrgWithStats, days: number) => {
    const base = new Date(org.trial_ends_at) > new Date() ? new Date(org.trial_ends_at) : new Date();
    base.setDate(base.getDate() + days);
    const { error } = await supabase
      .from("organizations")
      .update({ trial_ends_at: base.toISOString() })
      .eq("id", org.id);
    if (error) return toast({ title: "Erreur", description: error.message, variant: "destructive" });
    toast({ title: `Essai prolongé de ${days} jours` });
    loadOrgs();
  };

  const filtered = orgs.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-rose-600">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Super Admin</h1>
              <p className="text-xs text-slate-400">Gestion de toutes les agences</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setCreating(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="mr-2 h-4 w-4" /> Nouvelle agence
            </Button>
            <Link to="/super-admin/staff">
              <Button size="sm" variant="outline" className="border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700">
                <Users className="mr-2 h-4 w-4" /> Équipe plateforme
              </Button>
            </Link>
            <Link to="/super-admin/billing">
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                <Receipt className="mr-2 h-4 w-4" /> Facturation
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => supabase.auth.signOut()}
              className="text-slate-300 hover:text-white"
            >
              <LogOut className="mr-2 h-4 w-4" /> Déconnexion
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card className="border-slate-800 bg-slate-900/50 p-4">
            <p className="text-xs uppercase text-slate-400">Total agences</p>
            <p className="mt-1 text-2xl font-bold">{orgs.length}</p>
          </Card>
          <Card className="border-slate-800 bg-slate-900/50 p-4">
            <p className="text-xs uppercase text-slate-400">Actives</p>
            <p className="mt-1 text-2xl font-bold text-emerald-400">
              {orgs.filter((o) => !o.suspended).length}
            </p>
          </Card>
          <Card className="border-slate-800 bg-slate-900/50 p-4">
            <p className="text-xs uppercase text-slate-400">Suspendues</p>
            <p className="mt-1 text-2xl font-bold text-amber-400">
              {orgs.filter((o) => o.suspended).length}
            </p>
          </Card>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Rechercher une agence…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-slate-700 bg-slate-900/50 pl-9 text-slate-100 placeholder:text-slate-500"
            />
          </div>
        </div>

        <Card className="border-slate-800 bg-slate-900/50">
          <div className="divide-y divide-slate-800">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-slate-400">Aucune agence</div>
            ) : (
              filtered.map((org) => (
                <div key={org.id} className="flex flex-wrap items-center gap-4 p-4">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                    style={{ background: org.brand_color ?? "#475569" }}
                  >
                    {org.logo_url ? (
                      <img src={org.logo_url} alt="" className="h-full w-full rounded-lg object-cover" />
                    ) : (
                      org.name.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold">{org.name}</p>
                      {org.suspended && (
                        <Badge variant="outline" className="border-amber-500 text-amber-400">
                          Suspendue
                        </Badge>
                      )}
                      {(() => {
                        const days = Math.ceil(
                          (new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000
                        );
                        if (days < 0)
                          return <Badge variant="outline" className="border-rose-500 text-rose-400">Essai expiré</Badge>;
                        if (days <= 3)
                          return <Badge variant="outline" className="border-amber-500 text-amber-400">Essai: {days}j</Badge>;
                        return <Badge variant="outline" className="border-emerald-700 text-emerald-400">Essai: {days}j</Badge>;
                      })()}
                    </div>
                    <p className="text-xs text-slate-400">
                      {org.cohost_count}/{org.max_cohosts} co-host · {org.employee_count}/{org.max_employees} employé(s) ·
                      {" "}{org.property_count} propriété(s) · Créée le{" "}
                      {new Date(org.created_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => extendTrial(org, 7)}
                      className="border-emerald-800 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900"
                    >
                      +7j
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => extendTrial(org, 30)}
                      className="border-emerald-800 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900"
                    >
                      +30j
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(org)}
                      className="border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleSuspend(org)}
                      className="border-slate-700 bg-slate-800 text-amber-400 hover:bg-slate-700"
                    >
                      {org.suspended ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-rose-900 bg-rose-950/50 text-rose-400 hover:bg-rose-900"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer "{org.name}" ?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Cette action est irréversible. Toutes les données liées seront supprimées.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteOrg(org)}
                            className="bg-rose-600 hover:bg-rose-700"
                          >
                            Supprimer
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer une agence</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nom *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: Mon Agence" />
            </div>
            <div>
              <Label>Couleur de marque</Label>
              <div className="flex gap-2">
                <Input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-10 w-20" />
                <Input value={newColor} onChange={(e) => setNewColor(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Co-hosts max</Label>
                <Input type="number" min={0} value={newMaxCohosts}
                  onChange={(e) => setNewMaxCohosts(parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Employés max</Label>
                <Input type="number" min={0} value={newMaxEmployees}
                  onChange={(e) => setNewMaxEmployees(parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <div>
              <Label>Durée d'essai (jours)</Label>
              <Input type="number" min={1} value={newTrialDays}
                onChange={(e) => setNewTrialDays(parseInt(e.target.value) || 14)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Annuler</Button>
            <Button onClick={createOrg} className="bg-emerald-600 hover:bg-emerald-700">Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Éditer l'agence</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nom</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <Label>Couleur de marque</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="h-10 w-20"
                />
                <Input value={editColor} onChange={(e) => setEditColor(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Co-hosts max</Label>
                <Input type="number" min={0} value={editMaxCohosts}
                  onChange={(e) => setEditMaxCohosts(parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Employés max</Label>
                <Input type="number" min={0} value={editMaxEmployees}
                  onChange={(e) => setEditMaxEmployees(parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <div>
              <Label>Fin d'essai (lecture seule après cette date)</Label>
              <Input type="date" value={editTrialEndsAt}
                onChange={(e) => setEditTrialEndsAt(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
            <Button onClick={saveEdit}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
