import { useTranslation } from "react-i18next";
import { UserCog } from "lucide-react";
import OrgProfileManager from "@/components/OrgProfileManager";

const COHOST_ROLES = ["cohost"] as const;

// Roles an admin can switch a cohost to (within their org).
const COHOST_ROLE_OPTIONS = [
  "cohost",
  "cleaner",
  "driver",
  "decorator",
  "maintenance",
  "staff",
] as const;

export default function AdminCohosts() {
  const { t } = useTranslation();
  return (
    <OrgProfileManager
      icon={UserCog}
      title={t("adminRoles.cohostsTitle", { defaultValue: "Cohosts" })}
      subtitle={t("adminRoles.cohostsSubtitle", {
        defaultValue: "Manage the cohosts in your organization.",
      })}
      allowedRoles={COHOST_ROLES}
      roleDropdownOptions={COHOST_ROLE_OPTIONS}
    />
  );
}
