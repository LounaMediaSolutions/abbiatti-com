import { useEffect, useMemo, useState } from "react";
import { Navigate, Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Mail,
  Pause,
  Play,
  Shield,
  UserPlus,
  Users,
} from "lucide-react";
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

export default function SuperAdminOrg() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [isSuper, setIsSuper] = useState<boolean | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingMembers, setPendingMembers] = useState<Member[]>([]);
  const [propertyCount, setPropertyCount] = useState(0);
  const [fetching, setFetching] = useState(true);

  // Invite-admin dialog
  const [inviting, setInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");

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
        toast({
          title: t("common.error"),
          description: orgErr.message,
          variant: "destructive",
        });
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

  useEffect(() => {
    if (isSuper) loadOrg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuper, id]);

  const sendInvite = async () => {
    if (!org) return;
    if (!inviteEmail.trim()) {
      return toast({
        title: t("common.error"),
        description: "Email is required",
        variant: "destructive",
      });
    }
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-team-member", {
        body: {
          email: inviteEmail.trim(),
          // Only sent when present — the edge function skips the create-user
          // step entirely if the email already belongs to an existing account.
          password: invitePassword.trim() ? invitePassword : undefined,
          full_name: inviteFullName.trim(),
          role: "admin",
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
      toast({
        title: "Admin invited",
        description: reusedExisting
          ? `${inviteEmail} already has an account — they must accept the invitation to manage ${org.name}`
          : `${inviteEmail} must accept the invitation to join ${org.name}`,
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
          <Button onClick={() => setInviteOpen(true)}>
            <Shield className="mr-2 h-4 w-4" /> Invite admin
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
            <DialogTitle>Invite admin to {org.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              The admin will receive an in-app invitation on first login and
              must <strong>accept</strong> before they can manage this
              organization.
            </p>
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
    </div>
  );
}
