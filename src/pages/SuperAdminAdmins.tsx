import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import SuperAdminProfileManager from "@/components/SuperAdminProfileManager";

// Org-level admins and co-admins, across every organization.
const ADMIN_ROLES = ["admin", "co_admin"] as const;

export default function SuperAdminAdmins() {
  const { t } = useTranslation();
  return (
    <SuperAdminProfileManager
      icon={ShieldCheck}
      title={t("superAdminRoles.adminsTitle", { defaultValue: "Admins" })}
      subtitle={t("superAdminRoles.adminsSubtitle", {
        defaultValue: "Manage organization admins and co-admins across all organizations.",
      })}
      allowedRoles={ADMIN_ROLES}
    />
  );
}
