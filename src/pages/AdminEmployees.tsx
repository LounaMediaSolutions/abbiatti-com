import { useTranslation } from "react-i18next";
import { Briefcase } from "lucide-react";
import OrgProfileManager from "@/components/OrgProfileManager";

// Field/operational staff roles.
const EMPLOYEE_ROLES = [
  "cleaner",
  "driver",
  "decorator",
  "maintenance",
  "staff",
] as const;

// Roles an admin can switch an employee to (within their org).
const EMPLOYEE_ROLE_OPTIONS = [
  "cleaner",
  "driver",
  "decorator",
  "maintenance",
  "staff",
  "cohost",
] as const;

export default function AdminEmployees() {
  const { t } = useTranslation();
  return (
    <OrgProfileManager
      icon={Briefcase}
      title={t("adminRoles.employeesTitle", { defaultValue: "Employees" })}
      subtitle={t("adminRoles.employeesSubtitle", {
        defaultValue:
          "Manage cleaners, drivers, decorators, maintenance and staff in your organization.",
      })}
      allowedRoles={EMPLOYEE_ROLES}
      roleDropdownOptions={EMPLOYEE_ROLE_OPTIONS}
    />
  );
}
