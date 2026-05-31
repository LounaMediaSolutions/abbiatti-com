import { useEffect, useMemo, useState } from "react";
import { Navigate, Link, useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Home,
  Mail,
  Pause,
  Pencil,
  Play,
  Shield,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  Briefcase,
} from "lucide-react";
import { toHexColor } from "@/lib/brandColor";
import { OrgPropertiesTab } from "@/components/OrgPropertiesTab";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isSuperAdminUser } from "@/lib/access";
import { Unauthorized } from "@/components/Unauthorized";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";

type Org = {
  id: string;
  name: string;
  brand_color: string | null;
  logo_url: string | null;
  suspended: boolean;
  created_at: string;
  max_cohosts: number | null;
  max_employees: number | null;
  trial_ends_at: string | null;
};

type Member = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  invitation_status: string | null;
};

const EMPLOYEE_ROLES = new Set([
  "cleaner",
  "driver",
  "decorator",
  "maintenance",
  "staff",
]);

const EMPLOYEE_ROLE_OPTIONS = [
  "cleaner",
  "driver",
  "decorator",
  "maintenance",
  "staff",
] as const;

// Which category each tab manages, and the role to invite for it.
type TeamKind = "admin" | "cohost" | "employee";

export default function SuperAdminOrg() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [isSuper, setIsSuper] = useState<boolean | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingMembers, setPendingMembers] = useState<Member[]>([]);
  const [propertyCount, setPropertyCount] = useState(0);
  const [fetching, setFetching] = useState(true);

  // Invite dialog (admins / cohosts / employees)
  const [inviting, setInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteKind, setInviteKind] = useState<TeamKind>("admin");
  const [inviteEmpRole, setInviteEmpRole] = useState<string>("cleaner");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");

  // Remove-from-org confirmation
  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);

  // Edit-organization dialog
  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#1e40af");
  const [editMaxCohosts, setEditMaxCohosts] = useState(0);
  const [editMaxEmployees, setEditMaxEmployees] = useState(0);
  const [editTrialEndsAt, setEditTrialEndsAt] = useState("");

  // Delete-organization confirmation
  const [confirmDeleteOrg, setConfirmDeleteOrg] = useState(false);
  const [deletingOrg, setDeletingOrg] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setIsSuper(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ok = await isSuperAdminUser(user.id);
        if (!cancelled) setIsSuper(ok);
      } catch (e) {
        if (!cancelled) {
          console.error("[SuperAdminOrg] role check threw:", e);
          setIsSuper(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, loading]);

  const loadOrg = async () => {
    if (!id) return;
    setFetching(true);
    try {
      const { data: orgData, error: orgErr } = await supabase
        .from("organizations")
        .select(
          "id, name, brand_color, logo_url, suspended, created_at, max_cohosts, max_employees, trial_ends_at",
        )
        .eq("id", id)
        .maybeSingle();
      if (orgErr) {
        // The fetch runs in parallel with the role check, so non-super-admins
        // who route through here briefly see RLS denials before Unauthorized
        // renders. Suppress the toast ONLY for confirmed non-super-admins;
        // when the role check is still resolving (`isSuper === null`) we
        // surface the error so a real super-admin on cold load still sees
        // legitimate failures. The closure here captures `isSuper` at the
        // moment loadOrg ran, so reading "not false" instead of "true" is
        // the safer side of the trade-off.
        if (isSuper === false) {
          console.warn("[SuperAdminOrg] loadOrg silenced for non-super-admin:", orgErr.message);
        } else {
          toast({
            title: t("common.error"),
            description: orgErr.message,
            variant: "destructive",
          });
        }
        return;
      }
      setOrg(orgData as Org | null);

      const [{ data: active }, { data: pending }, { count: propCount }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id, full_name, email, role, invitation_status")
            .eq("org_id", id),
          supabase
            .from("profiles")
            .select("id, full_name, email, pending_role, invitation_status")
            .eq("pending_org_id", id)
            .eq("invitation_status", "pending"),
          supabase
            .from("properties")
            .select("id", { count: "exact", head: true })
            .eq("org_id", id),
        ]);

      setMembers((active ?? []) as Member[]);
      setPendingMembers(
        ((pending ?? []) as any[]).map((p) => ({
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          role: p.pending_role,
          invitation_status: p.invitation_status,
        })),
      );
      setPropertyCount(propCount ?? 0);
    } finally {
      setFetching(false);
    }
  };

  // Kick off org data fetch in parallel with the role check, instead of after.
  // RLS still gates the response for non-super-admins (empty / denied), and the
  // page render is gated on `isSuper` separately, so nothing leaks. Wall-clock
  // win: one round-trip instead of two before the page shows data.
  useEffect(() => {
    if (loading || !user || !id) return;
    loadOrg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loading, id]);

  const openInviteFor = (kind: TeamKind) => {
    setInviteKind(kind);
    if (kind === "employee") setInviteEmpRole("cleaner");
    setInviteEmail("");
    setInvitePassword("");
    setInviteFullName("");
    setInviteOpen(true);
  };

  const sendInvite = async () => {
    if (!org) return;
    if (!inviteEmail.trim()) {
      return toast({
        title: t("common.error"),
        description: "Email is required",
        variant: "destructive",
      });
    }
    const role =
      inviteKind === "admin"
        ? "admin"
        : inviteKind === "cohost"
          ? "cohost"
          : inviteEmpRole;
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-team-member", {
        body: {
          email: inviteEmail.trim(),
          // Only sent when present — the edge function skips the create-user
          // step entirely if the email already belongs to an existing account.
          password: invitePassword.trim() ? invitePassword : undefined,
          full_name: inviteFullName.trim(),
          role,
          target_org_id: org.id,
        },
      });
      if (error) {
        toast({
          title: t("common.error"),
          description: error.message,
          variant: "destructive",
        });
        return;
      }
      const reusedExisting = (data as { existing_user?: boolean } | null)?.existing_user;
      // Super-admin admin invites are pending (must be accepted); cohosts and
      // employees are attached to the org immediately.
      toast({
        title: t("superAdminOrg.memberAdded", { defaultValue: "Membre ajouté" }),
        description: reusedExisting
          ? `${inviteEmail} — compte existant rattaché à ${org.name}`
          : `${inviteEmail} → ${org.name}`,
      });
      setInviteOpen(false);
      setInviteEmail("");
      setInvitePassword("");
      setInviteFullName("");
      loadOrg();
    } finally {
      setInviting(false);
    }
  };

  const removeMember = async () => {
    if (!confirmRemove) return;
    setRemoving(true);
    try {
      // Detach the user from this organization. Their account remains; they
      // simply no longer belong to the org. Property-level assignments tied to
      // this org's properties are also cleared.
      const { error } = await supabase
        .from("profiles")
        .update({ org_id: null } as never)
        .eq("id", confirmRemove.id);
      if (error) throw error;
      toast({ title: t("superAdminOrg.memberRemoved", { defaultValue: "Membre retiré" }) });
      setConfirmRemove(null);
      loadOrg();
    } catch (e: unknown) {
      toast({
        title: t("common.error"),
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setRemoving(false);
    }
  };

  const toggleSuspend = async () => {
    if (!org) return;
    const { error } = await supabase
      .from("organizations")
      .update({ suspended: !org.suspended })
      .eq("id", org.id);
    if (error) {
      return toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    }
    toast({
      title: org.suspended
        ? t("superAdmin.agencyReactivated")
        : t("superAdmin.agencySuspended"),
    });
    loadOrg();
  };

  const openEdit = () => {
    if (!org) return;
    setEditName(org.name);
    setEditColor(toHexColor(org.brand_color));
    setEditMaxCohosts(org.max_cohosts ?? 0);
    setEditMaxEmployees(org.max_employees ?? 0);
    setEditTrialEndsAt(org.trial_ends_at ? org.trial_ends_at.slice(0, 10) : "");
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!org) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({
          name: editName,
          brand_color: editColor,
          max_cohosts: editMaxCohosts,
          max_employees: editMaxEmployees,
          trial_ends_at: editTrialEndsAt ? new Date(editTrialEndsAt).toISOString() : null,
        })
        .eq("id", org.id);
      if (error) {
        return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      }
      toast({ title: t("superAdmin.agencyUpdated", { defaultValue: "Organisation mise à jour" }) });
      setEditOpen(false);
      loadOrg();
    } finally {
      setSavingEdit(false);
    }
  };

  const extendTrial = async (days: number) => {
    if (!org) return;
    const base =
      org.trial_ends_at && new Date(org.trial_ends_at) > new Date()
        ? new Date(org.trial_ends_at)
        : new Date();
    base.setDate(base.getDate() + days);
    const { error } = await supabase
      .from("organizations")
      .update({ trial_ends_at: base.toISOString() })
      .eq("id", org.id);
    if (error) {
      return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    }
    toast({ title: t("superAdmin.trialExtended", { days }) });
    loadOrg();
  };

  const deleteOrg = async () => {
    if (!org) return;
    setDeletingOrg(true);
    try {
      const { error } = await supabase.from("organizations").delete().eq("id", org.id);
      if (error) {
        return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      }
      toast({ title: t("superAdmin.agencyDeleted", { defaultValue: "Organisation supprimée" }) });
      navigate("/super-admin");
    } finally {
      setDeletingOrg(false);
    }
  };

  const cancelInvitation = async (profileId: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({
        pending_org_id: null,
        pending_role: null,
        invitation_status: null,
        invited_by: null,
      })
      .eq("id", profileId);
    if (error) {
      return toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    }
    toast({ title: "Invitation cancelled" });
    loadOrg();
  };

  const grouped = useMemo(() => {
    const admins: Member[] = [];
    const cohosts: Member[] = [];
    const employees: Member[] = [];
    const others: Member[] = [];
    for (const m of members) {
      if (m.role === "admin" || m.role === "co_admin") admins.push(m);
      else if (m.role === "cohost") cohosts.push(m);
      else if (m.role && EMPLOYEE_ROLES.has(m.role)) employees.push(m);
      else others.push(m);
    }
    return { admins, cohosts, employees, others };
  }, [members]);

  const renderMemberList = (list: Member[], emptyText: string) => {
    if (list.length === 0) {
      return <p className="text-sm text-muted-foreground">{emptyText}</p>;
    }
    return (
      <div className="divide-y">
        {list.map((m) => (
          <div
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-secondary">
                {m.full_name || m.email || m.id}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {m.email || "—"}
                {m.role ? ` · ${m.role}` : ""}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              onClick={() => setConfirmRemove(m)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t("superAdminOrg.remove", { defaultValue: "Remove" })}
            </Button>
          </div>
        ))}
      </div>
    );
  };

  if (loading || isSuper === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuper) return <Unauthorized />;
  if (fetching && !org) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }
  if (!org) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link to="/super-admin">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("common.back")}
          </Button>
        </Link>
        <Card className="p-6 text-center text-muted-foreground">
          Organization not found.
        </Card>
      </div>
    );
  }

  const trialDays = org.trial_ends_at
    ? Math.ceil(
        (new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000,
      )
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/super-admin">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("common.back")}
          </Button>
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openEdit}>
            <Pencil className="mr-2 h-4 w-4" /> {t("properties.edit", { defaultValue: "Edit" })}
          </Button>
          <Button variant="outline" onClick={() => extendTrial(7)}>
            +7j
          </Button>
          <Button variant="outline" onClick={() => extendTrial(30)}>
            +30j
          </Button>
          <Button variant="outline" onClick={toggleSuspend}>
            {org.suspended ? (
              <>
                <Play className="mr-2 h-4 w-4" /> Reactivate
              </>
            ) : (
              <>
                <Pause className="mr-2 h-4 w-4" /> Suspend
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => setConfirmDeleteOrg(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" /> {t("common.delete", { defaultValue: "Delete" })}
          </Button>
        </div>
      </div>

      <Card className="p-6 shadow-card">
        <div className="flex flex-wrap items-start gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-white"
            style={{ background: org.brand_color ?? "#475569" }}
          >
            {org.logo_url ? (
              <img
                src={org.logo_url}
                alt=""
                className="h-full w-full rounded-lg object-cover"
              />
            ) : (
              org.name.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-secondary">{org.name}</h1>
              {org.suspended && (
                <Badge
                  variant="outline"
                  className="border-amber-500 text-amber-700"
                >
                  {t("superAdmin.suspendedBadge")}
                </Badge>
              )}
              {trialDays !== null &&
                (trialDays < 0 ? (
                  <Badge variant="destructive">
                    {t("superAdmin.trialExpired")}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className={
                      trialDays <= 3
                        ? "border-amber-500 text-amber-700"
                        : "border-emerald-500 text-emerald-700"
                    }
                  >
                    {t("superAdmin.trialDays", { days: trialDays })}
                  </Badge>
                ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {t("superAdmin.createdOn")}{" "}
              {new Date(org.created_at).toLocaleDateString("fr-FR")}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4 shadow-card">
          <p className="text-xs uppercase text-muted-foreground">Admins</p>
          <p className="mt-1 text-2xl font-bold text-secondary">
            {grouped.admins.length}
          </p>
        </Card>
        <Card className="p-4 shadow-card">
          <p className="text-xs uppercase text-muted-foreground">Cohosts</p>
          <p className="mt-1 text-2xl font-bold text-secondary">
            {grouped.cohosts.length}
            {org.max_cohosts != null && (
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / {org.max_cohosts}
              </span>
            )}
          </p>
        </Card>
        <Card className="p-4 shadow-card">
          <p className="text-xs uppercase text-muted-foreground">Employees</p>
          <p className="mt-1 text-2xl font-bold text-secondary">
            {grouped.employees.length}
            {org.max_employees != null && (
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / {org.max_employees}
              </span>
            )}
          </p>
        </Card>
        <Card className="p-4 shadow-card">
          <p className="text-xs uppercase text-muted-foreground">Properties</p>
          <p className="mt-1 text-2xl font-bold text-secondary">
            {propertyCount}
          </p>
        </Card>
      </div>

      {/* Manage admins / cohosts / employees, all in one place */}
      <Card className="shadow-card" data-testid="org-team-tabs">
        <Tabs defaultValue="properties" className="p-5">
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="properties" className="gap-1.5">
              <Home className="h-4 w-4" /> Properties ({propertyCount})
            </TabsTrigger>
            <TabsTrigger value="admins" className="gap-1.5">
              <Shield className="h-4 w-4" /> Admins ({grouped.admins.length})
            </TabsTrigger>
            <TabsTrigger value="cohosts" className="gap-1.5">
              <UserCog className="h-4 w-4" /> Cohosts ({grouped.cohosts.length})
            </TabsTrigger>
            <TabsTrigger value="employees" className="gap-1.5">
              <Briefcase className="h-4 w-4" /> Employees ({grouped.employees.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="properties">
            {org && <OrgPropertiesTab orgId={org.id} onChanged={loadOrg} />}
          </TabsContent>

          <TabsContent value="admins" className="space-y-3 pt-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => openInviteFor("admin")}>
                <UserPlus className="mr-1.5 h-4 w-4" /> Add admin
              </Button>
            </div>
            {renderMemberList(grouped.admins, "No admins yet.")}
          </TabsContent>

          <TabsContent value="cohosts" className="space-y-3 pt-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => openInviteFor("cohost")}>
                <UserPlus className="mr-1.5 h-4 w-4" /> Add cohost
              </Button>
            </div>
            {renderMemberList(grouped.cohosts, "No cohosts yet.")}
          </TabsContent>

          <TabsContent value="employees" className="space-y-3 pt-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => openInviteFor("employee")}>
                <UserPlus className="mr-1.5 h-4 w-4" /> Add employee
              </Button>
            </div>
            {renderMemberList(grouped.employees, "No employees yet.")}
          </TabsContent>
        </Tabs>
      </Card>

      <Card className="shadow-card" data-testid="pending-invitations-card">
        <div className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-amber-600" />
            <h2 className="font-semibold text-secondary">
              Pending invitations
            </h2>
          </div>
          {pendingMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pending invitations.
            </p>
          ) : (
            <div className="divide-y">
              {pendingMembers.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-secondary">
                      {m.full_name || m.email || m.id}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.email} · pending {m.role}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => cancelInvitation(m.id)}
                  >
                    Cancel
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {inviteKind === "admin"
                ? "Add admin"
                : inviteKind === "cohost"
                  ? "Add cohost"
                  : "Add employee"}{" "}
              to {org.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {inviteKind === "admin" ? (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                The admin will receive an in-app invitation on first login and
                must <strong>accept</strong> before they can manage this
                organization.
              </p>
            ) : (
              <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
                The {inviteKind} will be attached to <strong>{org.name}</strong>{" "}
                immediately.
              </p>
            )}
            {inviteKind === "employee" && (
              <div>
                <Label>Employee role</Label>
                <Select value={inviteEmpRole} onValueChange={setInviteEmpRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYEE_ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`team.roles.${r}`, { defaultValue: r })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Full name</Label>
              <Input
                value={inviteFullName}
                onChange={(e) => setInviteFullName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <Label>Temporary password</Label>
              <Input
                type="text"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                placeholder="Leave blank if user already has an account"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Required only for brand-new accounts (min 6 characters). If the email already
                belongs to a user, leave this blank — they'll keep their existing password.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInviteOpen(false)}
              disabled={inviting}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={sendInvite} disabled={inviting}>
              {inviting ? t("common.loading") : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmRemove}
        onOpenChange={(o) => !o && !removing && setConfirmRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("superAdminOrg.removeConfirmTitle", { defaultValue: "Remove from organization?" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("superAdminOrg.removeConfirmBody", {
                defaultValue:
                  "This detaches the member from this organization. Their account is kept and can be re-added later.",
              })}
              {confirmRemove ? ` — ${confirmRemove.full_name || confirmRemove.email || ""}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={removeMember} disabled={removing}>
              {removing ? t("common.loading") : t("superAdminOrg.remove", { defaultValue: "Remove" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit organization */}
      <Dialog open={editOpen} onOpenChange={(o) => !o && !savingEdit && setEditOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("superAdmin.editDialogTitle", { defaultValue: "Edit organization" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("superAdmin.nameLabel", { defaultValue: "Name" })}</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <Label>{t("superAdmin.brandColor", { defaultValue: "Brand color" })}</Label>
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
                <Label>{t("superAdmin.maxCohosts", { defaultValue: "Max cohosts" })}</Label>
                <Input
                  type="number"
                  min={0}
                  value={editMaxCohosts}
                  onChange={(e) => setEditMaxCohosts(parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label>{t("superAdmin.maxEmployees", { defaultValue: "Max employees" })}</Label>
                <Input
                  type="number"
                  min={0}
                  value={editMaxEmployees}
                  onChange={(e) => setEditMaxEmployees(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
            <div>
              <Label>{t("superAdmin.trialEnd", { defaultValue: "Trial end" })}</Label>
              <Input
                type="date"
                value={editTrialEndsAt}
                onChange={(e) => setEditTrialEndsAt(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={savingEdit}>
              {t("common.cancel")}
            </Button>
            <Button onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete organization */}
      <AlertDialog
        open={confirmDeleteOrg}
        onOpenChange={(o) => !o && !deletingOrg && setConfirmDeleteOrg(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("superAdmin.deleteTitle", { name: org.name, defaultValue: `Delete ${org.name}?` })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("superAdmin.deleteDescription", {
                defaultValue:
                  "This permanently deletes the organization. This action cannot be undone.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingOrg}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteOrg}
              disabled={deletingOrg}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {deletingOrg ? t("common.loading") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
