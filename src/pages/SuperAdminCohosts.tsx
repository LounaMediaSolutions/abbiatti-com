import { useTranslation } from "react-i18next";
import { UserCog } from "lucide-react";
import SuperAdminProfileManager from "@/components/SuperAdminProfileManager";

const COHOST_ROLES = ["cohost"] as const;

export default function SuperAdminCohosts() {
  const { t } = useTranslation();
  return (
    <SuperAdminProfileManager
      icon={UserCog}
      title={t("superAdminRoles.cohostsTitle", { defaultValue: "Cohosts" })}
      subtitle={t("superAdminRoles.cohostsSubtitle", {
        defaultValue: "Manage cohosts across all organizations.",
      })}
      allowedRoles={COHOST_ROLES}
    />
  );
}
