import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Shield, Trash2, Pause, Play, Pencil, Search, Receipt, Users, Plus, Building2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Unauthorized } from "@/components/Unauthorized";
import { isSuperAdminUser } from "@/lib/access";

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
  admin_count: number;
};

export default function SuperAdmin() {
  const { t } = useTranslation();
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
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#1e40af");
  const [newMaxCohosts, setNewMaxCohosts] = useState(1);
  const [newMaxEmployees, setNewMaxEmployees] = useState(2);
  const [newTrialDays, setNewTrialDays] = useState(14);
  const [invitingOrg, setInvitingOrg] = useState<Org | null>(null);
  const [inviteRole, setInviteRole] = useState<"cohost" | "admin">("cohost");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setIsSuper(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (cancelled) return;
        setIsSuper(await isSuperAdminUser(user.id));
      } catch (e) {
        if (cancelled) return;
        console.error("[SuperAdmin] role check threw:", e);
        setIsSuper(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, loading]);

  const loadOrgs = async () => {
    const { data: orgsData, error } = await supabase
      .from("organizations")
      .select("id, name, brand_color, logo_url, suspended, created_at, max_cohosts, max_employees, trial_ends_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      return;
    }
    const ids = (orgsData ?? []).map((o) => o.id);
    // profiles.role is the source of truth in this deployment; user_roles may
    // not exist. Read roles from profiles so the filter below works on both
    // schemas.
    const [{ data: profileRoles }, { data: props }] = await Promise.all([
      supabase.from("profiles").select("org_id, role").in("org_id", ids),
      supabase.from("properties").select("org_id").in("org_id", ids),
    ]);
    const employeeRoles = ["cleaner", "driver", "decorator", "maintenance", "staff"];
    const adminRoles = ["admin", "co_admin"];
    const enriched: OrgWithStats[] = (orgsData ?? []).map((o) => {
      const orgRoles = (profileRoles ?? []).filter((r: any) => r.org_id === o.id);
      return {
        ...o,
        member_count: orgRoles.length,
        admin_count: orgRoles.filter((r: any) => adminRoles.includes(r.role)).length,
        cohost_count: orgRoles.filter((r: any) => r.role === "cohost").length,
        employee_count: orgRoles.filter((r: any) => employeeRoles.includes(r.role)).length,
        property_count: (props ?? []).filter((p: any) => p.org_id === o.id).length,
      };
    });
    setOrgs(enriched);
  };

  useEffect(() => {
    if (isSuper) loadOrgs();
  }, [isSuper]);

  const createOrg = async () => {
    if (!newName.trim()) {
      return toast({ title: t("superAdmin.requiredName"), variant: "destructive" });
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
      return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    }
    toast({ title: t("superAdmin.agencyCreated") });
    setCreating(false);
    setNewName("");
    setNewColor("#1e40af");
    setNewMaxCohosts(1);
    setNewMaxEmployees(2);
    setNewTrialDays(14);
    loadOrgs();
  };

  const toggleSuspend = async (org: OrgWithStats) => {
    const { error } = await supabase
      .from("organizations")
      .update({ suspended: !org.suspended })
      .eq("id", org.id);
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    toast({ title: org.suspended ? t("superAdmin.agencyReactivated") : t("superAdmin.agencySuspended") });
    loadOrgs();
  };

  const deleteOrg = async (org: OrgWithStats) => {
    const { error } = await supabase.from("organizations").delete().eq("id", org.id);
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    toast({ title: t("superAdmin.agencyDeleted") });
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
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    toast({ title: t("superAdmin.agencyUpdated") });
    setEditing(null);
    loadOrgs();
  };

  const openInvite = (org: Org, role: "cohost" | "admin" = "cohost") => {
    setInvitingOrg(org);
    setInviteRole(role);
    setInviteEmail("");
    setInvitePassword("");
    setInviteFullName("");
  };

  const sendInvite = async () => {
    if (!invitingOrg) return;
    if (!inviteEmail.trim()) {
      return toast({ title: t("common.error"), description: "Email is required", variant: "destructive" });
    }
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-team-member", {
        body: {
          email: inviteEmail.trim(),
          // Password is only sent when provided. The edge function requires it
          // for brand-new accounts but skips it when the email already belongs
          // to an existing user.
          password: invitePassword.trim() ? invitePassword : undefined,
          full_name: inviteFullName.trim(),
          role: inviteRole,
          target_org_id: invitingOrg.id,
        },
      });
      if (error) {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
        return;
      }
      const reusedExisting = (data as { existing_user?: boolean } | null)?.existing_user;
      toast({
        title: inviteRole === "admin" ? "Admin invited" : "Cohost invited",
        description:
          inviteRole === "admin"
            ? reusedExisting
              ? `${inviteEmail} already has an account — they must accept the invitation to manage ${invitingOrg.name}`
              : `${inviteEmail} must accept the invitation to join ${invitingOrg.name}`
            : reusedExisting
              ? `${inviteEmail} (existing user) added to ${invitingOrg.name}`
              : `${inviteEmail} added to ${invitingOrg.name}`,
      });
      setInvitingOrg(null);
      loadOrgs();
    } finally {
      setInviting(false);
    }
  };

  const extendTrial = async (org: OrgWithStats, days: number) => {
    const base = new Date(org.trial_ends_at) > new Date() ? new Date(org.trial_ends_at) : new Date();
    base.setDate(base.getDate() + days);
    const { error } = await supabase
      .from("organizations")
      .update({ trial_ends_at: base.toISOString() })
      .eq("id", org.id);
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    toast({ title: t("superAdmin.trialExtended", { days }) });
    loadOrgs();
  };

  if (loading || isSuper === null) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">{t("common.loading")}</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuper) return <Unauthorized />;

  const filtered = orgs.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-secondary">{t("superAdmin.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("superAdmin.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => setCreating(true)}
            data-testid="superadmin-new-agency-button"
          >
            <Plus className="mr-2 h-4 w-4" /> {t("superAdmin.newAgency")}
          </Button>
          <Link to="/super-admin/profiles">
            <Button size="sm" variant="outline">
              <Users className="mr-2 h-4 w-4" /> {t("nav.profiles")}
            </Button>
          </Link>
          <Link to="/super-admin/billing">
            <Button size="sm" variant="outline">
              <Receipt className="mr-2 h-4 w-4" /> {t("superAdmin.billing")}
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4 shadow-card">
          <p className="text-xs uppercase text-muted-foreground">{t("superAdmin.stats.totalAgencies")}</p>
          <p className="mt-1 text-2xl font-bold text-secondary">{orgs.length}</p>
        </Card>
        <Card className="p-4 shadow-card">
          <p className="text-xs uppercase text-muted-foreground">{t("superAdmin.stats.active")}</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {orgs.filter((o) => !o.suspended).length}
          </p>
        </Card>
        <Card className="p-4 shadow-card">
          <p className="text-xs uppercase text-muted-foreground">{t("superAdmin.stats.suspended")}</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {orgs.filter((o) => o.suspended).length}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5 shadow-card">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h2 className="font-semibold text-secondary">{t("superAdmin.cards.samePortalTitle")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("superAdmin.cards.samePortalBody")}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-5 shadow-card">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Shield className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h2 className="font-semibold text-secondary">{t("superAdmin.cards.extraSectionsTitle")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("superAdmin.cards.extraSectionsBody")}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="shadow-card">
        <div className="space-y-4 p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("superAdmin.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="divide-y">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">{t("superAdmin.empty")}</div>
            ) : (
              filtered.map((org) => (
                <div
                  key={org.id}
                  className="flex flex-wrap items-center gap-4 py-4"
                  data-testid="org-row"
                  data-org-id={org.id}
                  data-org-name={org.name}
                >
                  {/* Hidden descendant so Playwright's filter({ has: [data-org-name=...] }) matches
                      this row. `filter({ has })` only looks at descendants, not the row itself. */}
                  <span
                    data-org-name={org.name}
                    data-org-id={org.id}
                    className="sr-only"
                    aria-hidden="true"
                  />
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
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/super-admin/orgs/${org.id}`}
                        className="truncate font-semibold text-secondary hover:text-primary hover:underline"
                      >
                        {org.name}
                      </Link>
                      {org.suspended && (
                        <Badge variant="outline" className="border-amber-500 text-amber-700">
                          {t("superAdmin.suspendedBadge")}
                        </Badge>
                      )}
                      {(() => {
                        const days = Math.ceil(
                          (new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000
                        );
                        if (days < 0) return <Badge variant="destructive">{t("superAdmin.trialExpired")}</Badge>;
                        if (days <= 3) {
                          return <Badge variant="outline" className="border-amber-500 text-amber-700">{t("superAdmin.trialDays", { days })}</Badge>;
                        }
                        return <Badge variant="outline" className="border-emerald-500 text-emerald-700">{t("superAdmin.trialDays", { days })}</Badge>;
                      })()}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("superAdmin.orgSummary", {
                        cohosts: org.cohost_count,
                        maxCohosts: org.max_cohosts,
                        employees: org.employee_count,
                        maxEmployees: org.max_employees,
                        properties: org.property_count,
                      })}{" · "}
                      {t("superAdmin.createdOn")}{" "}
                      {new Date(org.created_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openInvite(org, "admin")}
                      data-testid="org-invite-admin-button"
                    >
                      <Shield className="mr-1 h-4 w-4" /> Invite admin
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => extendTrial(org, 7)}>
                      +7j
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => extendTrial(org, 30)}>
                      +30j
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(org)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toggleSuspend(org)}>
                      {org.suspended ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          data-testid="org-delete-trigger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("superAdmin.deleteTitle", { name: org.name })}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("superAdmin.deleteDescription")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteOrg(org)}
                            className="bg-rose-600 hover:bg-rose-700"
                            data-testid="org-delete-confirm"
                          >
                            {t("common.delete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent data-testid="org-create-dialog">
          <DialogHeader>
            <DialogTitle>{t("superAdmin.createDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("superAdmin.nameLabel")} *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("superAdmin.namePlaceholder")}
                data-testid="org-create-name-input"
              />
            </div>
            <div>
              <Label>{t("superAdmin.brandColor")}</Label>
              <div className="flex gap-2">
                <Input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-10 w-20" />
                <Input value={newColor} onChange={(e) => setNewColor(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("superAdmin.maxCohosts")}</Label>
                <Input type="number" min={0} value={newMaxCohosts}
                  onChange={(e) => setNewMaxCohosts(parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <Label>{t("superAdmin.maxEmployees")}</Label>
                <Input type="number" min={0} value={newMaxEmployees}
                  onChange={(e) => setNewMaxEmployees(parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <div>
              <Label>{t("superAdmin.trialDuration")}</Label>
              <Input type="number" min={1} value={newTrialDays}
                onChange={(e) => setNewTrialDays(parseInt(e.target.value) || 14)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>{t("common.cancel")}</Button>
            <Button onClick={createOrg} data-testid="org-create-submit">
              {t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!invitingOrg} onOpenChange={(o) => !o && setInvitingOrg(null)}>
        <DialogContent data-testid="invite-dialog">
          <DialogHeader>
            <DialogTitle>
              Invite admin{invitingOrg ? ` to ${invitingOrg.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              The admin will receive an in-app invitation on first login and
              must <strong>accept</strong> before they can manage this organization.
            </p>
            <div>
              <Label>Full name</Label>
              <Input
                value={inviteFullName}
                onChange={(e) => setInviteFullName(e.target.value)}
                placeholder="Jane Doe"
                data-testid="invite-fullname-input"
              />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="admin@example.com"
                data-testid="invite-email-input"
              />
            </div>
            <div>
              <Label>Temporary password</Label>
              <Input
                type="text"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                placeholder="Leave blank if user already has an account"
                data-testid="invite-password-input"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Required only for brand-new accounts (min 6 characters). If the email already
                belongs to a user, leave this blank — they'll keep their existing password.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvitingOrg(null)} disabled={inviting}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={sendInvite}
              disabled={inviting}
              data-testid="invite-submit"
            >
              {inviting ? t("common.loading") : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("superAdmin.editDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("superAdmin.nameLabel")}</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <Label>{t("superAdmin.brandColor")}</Label>
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
                <Label>{t("superAdmin.maxCohosts")}</Label>
                <Input type="number" min={0} value={editMaxCohosts}
                  onChange={(e) => setEditMaxCohosts(parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <Label>{t("superAdmin.maxEmployees")}</Label>
                <Input type="number" min={0} value={editMaxEmployees}
                  onChange={(e) => setEditMaxEmployees(parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <div>
              <Label>{t("superAdmin.trialEnd")}</Label>
              <Input type="date" value={editTrialEndsAt}
                onChange={(e) => setEditTrialEndsAt(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
            <Button onClick={saveEdit}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
