import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import {
  detachPropertyFromOrganization,
  isUnassignedPropertyOrgName,
} from "@/lib/propertyOrgFallback";

type Org = { id: string; name: string };
const UNASSIGNED_ORG_VALUE = "__unassigned__";

/**
 * Organization assignment for a property. Only the platform super-admin can
 * (re)assign a property to a different organization; everyone else sees the
 * current organization read-only.
 */
export function PropertyOrgCard({
  propertyId,
  orgId,
}: {
  propertyId: string;
  orgId?: string | null;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>(orgId ?? UNASSIGNED_ORG_VALUE);
  const [saving, setSaving] = useState(false);

  const { data: access } = useQuery({
    queryKey: ["userAccess", user?.id],
    queryFn: async () => getUserAccess(user!.id),
    enabled: !!user,
  });
  const isSuper = !!access?.isSuperAdmin;

  // Full org list for the super-admin picker.
  const { data: orgs = [] } = useQuery({
    queryKey: ["all-organizations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("organizations")
        .select("id, name")
        .order("name");
      return (data ?? []) as Org[];
    },
    enabled: isSuper,
  });

  // Read-only name for non-super-admins.
  const { data: currentOrg = null } = useQuery({
    queryKey: ["org-name", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", orgId)
        .maybeSingle();
      return (data as { name: string } | null) ?? null;
    },
    enabled: !!orgId && !isSuper,
  });

  const rawOrgName = isSuper
    ? orgs.find((o) => o.id === orgId)?.name
    : currentOrg?.name;
  const orgName = isUnassignedPropertyOrgName(rawOrgName)
    ? t("properties.cohostAssign.unassigned", { defaultValue: "— Unassigned —" })
    : rawOrgName;
  const selectedOrgId = selected === UNASSIGNED_ORG_VALUE ? null : selected;
  const isCurrentUnassigned = !orgId || isUnassignedPropertyOrgName(rawOrgName);

  useEffect(() => {
    setSelected(isCurrentUnassigned ? UNASSIGNED_ORG_VALUE : orgId ?? UNASSIGNED_ORG_VALUE);
  }, [isCurrentUnassigned, orgId]);

  const save = async () => {
    const nextOrgId = selectedOrgId;
    if ((selected === UNASSIGNED_ORG_VALUE && isCurrentUnassigned) || nextOrgId === orgId) return;
    setSaving(true);
    try {
      if (nextOrgId === null) {
        await detachPropertyFromOrganization(propertyId);
        const [memberCleanup, cohostCleanup] = await Promise.all([
          supabase.from("property_members").delete().eq("property_id", propertyId),
          supabase.from("property_cohosts").delete().eq("property_id", propertyId),
        ]);
        if (memberCleanup.error) throw memberCleanup.error;
        if (cohostCleanup.error) throw cohostCleanup.error;
      } else {
        const { error } = await supabase
          .from("properties")
          .update({ org_id: nextOrgId } as never)
          .eq("id", propertyId);
        if (error) throw error;
      }

      qc.invalidateQueries({ queryKey: ["property-detail", propertyId] });
      qc.invalidateQueries({ queryKey: ["property-members", propertyId] });
      qc.invalidateQueries({ queryKey: ["property-cohosts", propertyId] });
      toast.success(
        nextOrgId
          ? t("propertyDetail.orgReassigned", { defaultValue: "Organisation mise à jour" })
          : t("propertyDetail.orgRemoved", {
              defaultValue: "Property removed from organization",
            }),
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // Nothing useful to show for a non-super-admin when there's no org name.
  if (!isSuper && !orgName) return null;

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">
          {t("propertyDetail.organization", { defaultValue: "Organisation" })}
        </h3>
      </div>

      {isSuper ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selected} onValueChange={setSelected} disabled={saving}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue
                placeholder={t("propertyDetail.selectOrg", { defaultValue: "Choisir une organisation" })}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED_ORG_VALUE}>
                {t("properties.cohostAssign.unassigned", { defaultValue: "— Unassigned —" })}
              </SelectItem>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={saving || (selected === UNASSIGNED_ORG_VALUE ? isCurrentUnassigned : selectedOrgId === orgId)}
            onClick={save}
          >
            <Save className="h-4 w-4 mr-1" />
            {t("common.save", { defaultValue: "Enregistrer" })}
          </Button>
        </div>
      ) : (
        <p className="font-medium">{orgName ?? "—"}</p>
      )}
    </Card>
  );
}
