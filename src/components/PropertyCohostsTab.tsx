import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCog, UserX, ShieldCheck } from "lucide-react";
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
import { getUserAccess } from "@/lib/access";

// Permissions granted to a cohost when assigned to a property. Mirrors the
// payload used by the (now removed) inline picker in Properties.tsx so the
// data model stays identical wherever a cohost is assigned.
const COHOST_PERMISSIONS = [
  "manage_properties",
  "manage_reservations",
  "manage_tasks",
  "manage_staff",
  "view_financials",
  "manage_settings",
];

type Cohost = { id: string; full_name: string | null };

export function PropertyCohostsTab({
  propertyId,
  orgId,
}: {
  propertyId: string;
  orgId?: string | null;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: access } = useQuery({
    queryKey: ["userAccess", user?.id],
    queryFn: async () => getUserAccess(user!.id),
    enabled: !!user,
  });
  const canManage = !!(access?.isAdmin || access?.isSuperAdmin);

  // Currently assigned cohost (single-cohost-per-property model).
  const { data: assignedId = null } = useQuery({
    queryKey: ["property-cohost", propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("property_cohosts")
        .select("user_id")
        .eq("property_id", propertyId)
        .maybeSingle();
      return ((data as { user_id?: string } | null)?.user_id ?? null) as string | null;
    },
    enabled: !!propertyId,
  });

  // Name of the assigned cohost, for read-only display to every role.
  const { data: assignedProfile = null } = useQuery({
    queryKey: ["cohost-profile", assignedId],
    queryFn: async () => {
      if (!assignedId) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", assignedId)
        .maybeSingle();
      return (data as Cohost | null) ?? null;
    },
    enabled: !!assignedId,
  });

  // Cohosts that can be assigned (managers only). Super-admins see all cohosts;
  // org admins are scoped to their organization.
  const { data: cohosts = [] } = useQuery({
    queryKey: ["assignable-cohosts", access?.isSuperAdmin, orgId],
    queryFn: async () => {
      let q = supabase.from("profiles").select("id, full_name").eq("role", "cohost");
      if (!access?.isSuperAdmin && orgId) q = q.eq("org_id", orgId);
      const { data } = await q;
      return (data ?? []) as Cohost[];
    },
    enabled: !!access && canManage,
  });

  const assign = async (newUserId: string | null) => {
    setSaving(true);
    try {
      // Reset any existing assignment for this property first.
      const { error: delErr } = await supabase
        .from("property_cohosts")
        .delete()
        .eq("property_id", propertyId);
      if (delErr) throw delErr;

      const { error: delMemberErr } = await supabase
        .from("property_members")
        .delete()
        .eq("property_id", propertyId)
        .eq("role", "cohost");
      if (delMemberErr) throw delMemberErr;

      if (newUserId) {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (!authUser) throw new Error("Not authenticated");

        const { error: insErr } = await supabase.from("property_cohosts").insert([
          {
            property_id: propertyId,
            user_id: newUserId,
            assigned_by: authUser.id,
            permissions: COHOST_PERMISSIONS,
          },
        ] as never);
        if (insErr) throw insErr;

        const { error: memberErr } = await supabase.from("property_members").insert([
          {
            property_id: propertyId,
            user_id: newUserId,
            organization_id: orgId,
            role: "cohost",
            assigned_by: authUser.id,
          },
        ] as never);
        if (memberErr) throw memberErr;
      }

      qc.invalidateQueries({ queryKey: ["property-cohost", propertyId] });
      qc.invalidateQueries({ queryKey: ["cohost-profile"] });
      toast.success(t("properties.cohostAssign.saved"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const assignedName =
    assignedProfile?.full_name ||
    cohosts.find((c) => c.id === assignedId)?.full_name ||
    (assignedId ? t("properties.cohostAssign.unnamed", { defaultValue: "Cohost sans nom" }) : null);

  return (
    <Card className="p-5 space-y-5 max-w-2xl">
      <div className="flex items-center gap-2">
        <UserCog className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">
          {t("propertyDetail.cohosts", { defaultValue: "Cohosts" })}
        </h2>
      </div>

      {/* Current assignment */}
      <div className="flex items-center gap-3 rounded-lg border p-3">
        {assignedName ? (
          <>
            <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase text-muted-foreground">
                {t("propertyDetail.assignedCohost", { defaultValue: "Cohost assigné" })}
              </p>
              <p className="font-medium truncate">{assignedName}</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("properties.cohostAssign.unassigned", { defaultValue: "— Non assigné —" })}
          </p>
        )}
      </div>

      {/* Management controls (admins / super-admins only) */}
      {canManage ? (
        <div className="space-y-2">
          <p className="text-xs uppercase text-muted-foreground">
            {t("properties.cohostAssign.label", { defaultValue: "Cohost" })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={assignedId ?? "none"}
              disabled={saving}
              onValueChange={(v) => assign(v === "none" ? null : v)}
            >
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder={t("properties.cohostAssign.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {t("properties.cohostAssign.unassigned")}
                </SelectItem>
                {cohosts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name || t("properties.cohostAssign.unnamed")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {assignedId && (
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => assign(null)}
              >
                <UserX className="h-4 w-4 mr-1.5" />
                {t("propertyDetail.unassign", { defaultValue: "Retirer" })}
              </Button>
            )}
          </div>
          {cohosts.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t("propertyDetail.noCohostsAvailable", {
                defaultValue: "Aucun cohost disponible. Créez-en un dans l'équipe.",
              })}
            </p>
          )}
        </div>
      ) : (
        <Badge variant="secondary" className="text-[11px]">
          {t("propertyDetail.readOnly", { defaultValue: "Lecture seule" })}
        </Badge>
      )}
    </Card>
  );
}
