import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, UserCog, Briefcase, Plus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  getUserAccess,
  ADMIN_ROLES,
  EMPLOYEE_ROLES,
} from "@/lib/access";

// Permissions granted when a cohost is attached to a property. Mirrors the
// payload the app already used so cohost access control keeps working.
const COHOST_PERMISSIONS = [
  "manage_properties",
  "manage_reservations",
  "manage_tasks",
  "manage_staff",
  "view_financials",
  "manage_settings",
];

type Profile = { id: string; full_name: string | null; role: string | null };
type Member = { user_id: string; role: string };

const isAdmin = (role: string | null | undefined) =>
  !!role && (ADMIN_ROLES as readonly string[]).includes(role);
const isEmployee = (role: string | null | undefined) =>
  !!role && (EMPLOYEE_ROLES as readonly string[]).includes(role);

export function PropertyTeamTab({
  propertyId,
  orgId,
}: {
  propertyId: string;
  orgId?: string | null;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: access } = useQuery({
    queryKey: ["userAccess", user?.id],
    queryFn: async () => getUserAccess(user!.id),
    enabled: !!user,
  });
  const canManage = !!(access?.isAdmin || access?.isSuperAdmin);

  // Candidate people to assign — everyone in the property's organization.
  const { data: orgProfiles = [] } = useQuery({
    queryKey: ["org-profiles", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("org_id", orgId);
      return (data ?? []) as Profile[];
    },
    enabled: !!orgId && canManage,
  });

  // Admins + employees are tracked in property_members.
  const { data: members = [] } = useQuery({
    queryKey: ["property-members", propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("property_members")
        .select("user_id, role")
        .eq("property_id", propertyId);
      return (data ?? []) as Member[];
    },
    enabled: !!propertyId,
  });

  // Cohosts are tracked in property_cohosts (this is what drives access control).
  const { data: cohostIds = [] } = useQuery({
    queryKey: ["property-cohosts", propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("property_cohosts")
        .select("user_id")
        .eq("property_id", propertyId);
      return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
    },
    enabled: !!propertyId,
  });

  // Resolve names for everyone currently assigned (works for read-only roles
  // that can't load the full org directory).
  const assignedIds = Array.from(
    new Set([...members.map((m) => m.user_id), ...cohostIds]),
  );
  const { data: assignedProfiles = [] } = useQuery({
    queryKey: ["assigned-profiles", assignedIds.join(",")],
    queryFn: async () => {
      if (assignedIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("id", assignedIds);
      return (data ?? []) as Profile[];
    },
    enabled: assignedIds.length > 0,
  });

  const profileOf = (id: string): Profile | undefined =>
    assignedProfiles.find((p) => p.id === id) || orgProfiles.find((p) => p.id === id);
  const nameOf = (id: string) =>
    profileOf(id)?.full_name ||
    t("properties.cohostAssign.unnamed", { defaultValue: "Sans nom" });
  const roleLabel = (role: string | null | undefined) =>
    role ? t(`roles.${role}`, { defaultValue: role }) : "";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["property-members", propertyId] });
    qc.invalidateQueries({ queryKey: ["property-cohosts", propertyId] });
  };

  // ---- mutations -----------------------------------------------------------

  const addMember = async (userId: string) => {
    if (!orgId) return toast.error("Missing organization");
    const profile = orgProfiles.find((p) => p.id === userId);
    if (!profile) return;
    setBusy(true);
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("property_members").insert([
        {
          property_id: propertyId,
          user_id: userId,
          role: profile.role ?? "staff",
          organization_id: orgId,
          assigned_by: authUser?.id ?? null,
        },
      ] as never);
      if (error) throw error;
      toast.success(t("propertyTeam.added", { defaultValue: "Ajouté" }));
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (userId: string) => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("property_members")
        .delete()
        .eq("property_id", propertyId)
        .eq("user_id", userId);
      if (error) throw error;
      toast.success(t("propertyTeam.removed", { defaultValue: "Retiré" }));
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addCohost = async (userId: string) => {
    if (!orgId) return toast.error("Missing organization");
    setBusy(true);
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from("property_cohosts").insert([
        {
          property_id: propertyId,
          user_id: userId,
          assigned_by: authUser?.id ?? null,
          permissions: COHOST_PERMISSIONS,
        },
      ] as never);
      if (insErr) throw insErr;
      // Mirror into property_members so cohosts show up in the unified roster.
      await supabase.from("property_members").insert([
        {
          property_id: propertyId,
          user_id: userId,
          role: "cohost",
          organization_id: orgId,
          assigned_by: authUser?.id ?? null,
        },
      ] as never);
      toast.success(t("properties.cohostAssign.saved", { defaultValue: "Cohost assigné" }));
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeCohost = async (userId: string) => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("property_cohosts")
        .delete()
        .eq("property_id", propertyId)
        .eq("user_id", userId);
      if (error) throw error;
      await supabase
        .from("property_members")
        .delete()
        .eq("property_id", propertyId)
        .eq("user_id", userId)
        .eq("role", "cohost");
      toast.success(t("propertyTeam.removed", { defaultValue: "Retiré" }));
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // ---- per-section derived data -------------------------------------------

  const adminMembers = members.filter((m) => isAdmin(m.role));
  const employeeMembers = members.filter((m) => isEmployee(m.role));

  const adminCandidates = orgProfiles.filter(
    (p) => isAdmin(p.role) && !adminMembers.some((m) => m.user_id === p.id),
  );
  const cohostCandidates = orgProfiles.filter(
    (p) => p.role === "cohost" && !cohostIds.includes(p.id),
  );
  const employeeCandidates = orgProfiles.filter(
    (p) => isEmployee(p.role) && !employeeMembers.some((m) => m.user_id === p.id),
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <Section
        icon={<ShieldCheck className="h-5 w-5 text-primary" />}
        title={t("propertyTeam.admins", { defaultValue: "Admins" })}
        assignedIds={adminMembers.map((m) => m.user_id)}
        candidates={adminCandidates}
        canManage={canManage}
        busy={busy}
        nameOf={nameOf}
        roleLabel={(id) => roleLabel(profileOf(id)?.role)}
        onAdd={addMember}
        onRemove={removeMember}
        emptyHint={t("propertyTeam.noAdmins", { defaultValue: "Aucun admin assigné" })}
        addPlaceholder={t("propertyTeam.addAdmin", { defaultValue: "Ajouter un admin" })}
      />

      <Section
        icon={<UserCog className="h-5 w-5 text-primary" />}
        title={t("propertyDetail.cohosts", { defaultValue: "Cohosts" })}
        assignedIds={cohostIds}
        candidates={cohostCandidates}
        canManage={canManage}
        busy={busy}
        nameOf={nameOf}
        roleLabel={() => ""}
        onAdd={addCohost}
        onRemove={removeCohost}
        emptyHint={t("properties.cohostAssign.unassigned", { defaultValue: "— Non assigné —" })}
        addPlaceholder={t("propertyTeam.addCohost", { defaultValue: "Ajouter un cohost" })}
      />

      <Section
        icon={<Briefcase className="h-5 w-5 text-primary" />}
        title={t("propertyTeam.employees", { defaultValue: "Employés" })}
        assignedIds={employeeMembers.map((m) => m.user_id)}
        candidates={employeeCandidates}
        canManage={canManage}
        busy={busy}
        nameOf={nameOf}
        roleLabel={(id) => roleLabel(profileOf(id)?.role)}
        onAdd={addMember}
        onRemove={removeMember}
        emptyHint={t("propertyTeam.noEmployees", { defaultValue: "Aucun employé assigné" })}
        addPlaceholder={t("propertyTeam.addEmployee", { defaultValue: "Ajouter un employé" })}
      />

      {!canManage && (
        <Badge variant="secondary" className="text-[11px]">
          {t("propertyDetail.readOnly", { defaultValue: "Lecture seule" })}
        </Badge>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  assignedIds,
  candidates,
  canManage,
  busy,
  nameOf,
  roleLabel,
  onAdd,
  onRemove,
  emptyHint,
  addPlaceholder,
}: {
  icon: React.ReactNode;
  title: string;
  assignedIds: string[];
  candidates: Profile[];
  canManage: boolean;
  busy: boolean;
  nameOf: (id: string) => string;
  roleLabel: (id: string) => string;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  emptyHint: string;
  addPlaceholder: string;
}) {
  const { t } = useTranslation();
  const [toAdd, setToAdd] = useState<string>("");

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-semibold">{title}</h3>
        <Badge variant="outline" className="ml-auto text-[11px]">
          {assignedIds.length}
        </Badge>
      </div>

      {assignedIds.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      ) : (
        <div className="space-y-1.5">
          {assignedIds.map((id) => {
            const rl = roleLabel(id);
            return (
              <div
                key={id}
                className="flex items-center gap-2 rounded-md border px-3 py-2"
              >
                <span className="font-medium truncate">{nameOf(id)}</span>
                {rl && (
                  <Badge variant="secondary" className="text-[10px]">
                    {rl}
                  </Badge>
                )}
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 ml-auto shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={busy}
                    onClick={() => onRemove(id)}
                    aria-label={t("propertyTeam.remove", { defaultValue: "Retirer" })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canManage && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Select value={toAdd} onValueChange={setToAdd} disabled={busy}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder={addPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {candidates.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  {t("propertyTeam.noCandidates", { defaultValue: "Personne de disponible" })}
                </SelectItem>
              ) : (
                candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name ||
                      t("properties.cohostAssign.unnamed", { defaultValue: "Sans nom" })}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={busy || !toAdd || toAdd === "__none__"}
            onClick={() => {
              onAdd(toAdd);
              setToAdd("");
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("propertyTeam.add", { defaultValue: "Ajouter" })}
          </Button>
        </div>
      )}
    </Card>
  );
}
