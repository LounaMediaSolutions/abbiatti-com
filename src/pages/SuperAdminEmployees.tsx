import { useTranslation } from "react-i18next";
import { Briefcase } from "lucide-react";
import SuperAdminProfileManager from "@/components/SuperAdminProfileManager";

// Field/operational staff roles.
const EMPLOYEE_ROLES = [
  "cleaner",
  "driver",
  "decorator",
  "maintenance",
  "staff",
] as const;

export default function SuperAdminEmployees() {
  const { t } = useTranslation();
  return (
    <SuperAdminProfileManager
      icon={Briefcase}
      title={t("superAdminRoles.employeesTitle", { defaultValue: "Employees" })}
      subtitle={t("superAdminRoles.employeesSubtitle", {
        defaultValue: "Manage cleaners, drivers, decorators, maintenance and staff across all organizations.",
      })}
      allowedRoles={EMPLOYEE_ROLES}
    />
  );
}
