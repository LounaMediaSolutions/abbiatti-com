import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";
import SuperAdminProfileManager from "@/components/SuperAdminProfileManager";

// Catch-all "Profiles" section: every user who is NOT covered by the dedicated
// Admins / Cohosts / Employees sections. Profiles whose role is one of these is
// excluded; everyone else (guests, unassigned, and global/platform roles such
// as super_admin, technician, developer, accountant, support) is listed.
const ROLES_HANDLED_ELSEWHERE = [
  "admin",
  "co_admin",
  "cohost",
  "cleaner",
  "driver",
  "decorator",
  "maintenance",
  "staff",
] as const;

export default function SuperAdminOtherProfiles() {
  const { t } = useTranslation();
  return (
    <SuperAdminProfileManager
      icon={Users}
      title={t("superAdminRoles.profilesTitle", { defaultValue: "Profiles" })}
      subtitle={t("superAdminRoles.profilesSubtitle", {
        defaultValue:
          "Manage all other users — guests, unassigned accounts and platform roles that aren't admins, cohosts or employees.",
      })}
      excludedRoles={ROLES_HANDLED_ELSEWHERE}
    />
  );
}
