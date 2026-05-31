import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  UserPlus,
  Search,
  Home as HomeIcon,
  Copy,
  Users as UsersIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getUserAccess, EMPLOYEE_ROLES } from "@/lib/access";
import { Unauthorized } from "@/components/Unauthorized";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { MagicLinkQR } from "@/components/MagicLinkQR";
import { cn } from "@/lib/utils";

type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

const EMPLOYEE_ROLE_OPTIONS: readonly EmployeeRole[] = EMPLOYEE_ROLES;

const ROLE_EMOJI: Record<string, string> = {
  cleaner: "🧹",
  driver: "🚗",
  decorator: "🎨",
  maintenance: "🔧",
  staff: "👤",
};

type Property = { id: string; name: string };

type EmployeeProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string | null;
  properties: Property[];
};

function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let value = "";
  for (let i = 0; i < 10; i += 1) value += chars[Math.floor(Math.random() * chars.length)];
  return value;
}

function getInitials(name: string | null, email: string | null) {
  const src = (name || email || "").trim();
  if (!src) return "U";
  const parts = src.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "U";
}

export default function CohostEmployees() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();

  // null = resolving, false = not allowed, true = ok
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Add-employee dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);
  const [fName, setFName] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fRole, setFRole] = useState<EmployeeRole>("cleaner");
  const [fProps, setFProps] = useState<string[]>([]);
  const [fPwd, setFPwd] = useState(generateTempPassword());

  const resetForm = () => {
    setFName("");
    setFEmail("");
    setFPhone("");
    setFRole("cleaner");
    setFProps([]);
    setFPwd(generateTempPassword());
    setCreatedCreds(null);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setAllowed(false);
      return;
    }
    getUserAccess(user.id)
      .then((access) => {
        // Any role at or above cohost (cohost, admin, co_admin, super_admin) is welcome here.
        setAllowed(access.isCohost || access.isAdmin || access.isSuperAdmin);
      })
      .catch(() => setAllowed(false));
  }, [user?.id, authLoading]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Properties the cohost can manage. For admin/super-admin we fall back
      // to org-scoped properties so the same page works for them too.
      const { data: cohostRows } = await supabase
        .from("property_cohosts")
        .select("property_id")
        .eq("user_id", user.id);
      let propIds = (cohostRows ?? []).map((r) => r.property_id as string);

      if (propIds.length === 0) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("org_id")
          .eq("id", user.id)
          .maybeSingle();
        const orgId = (profile?.org_id as string | null) ?? null;
        if (orgId) {
          const { data: orgProps } = await supabase
            .from("properties")
            .select("id")
            .eq("org_id", orgId);
          propIds = (orgProps ?? []).map((r) => r.id as string);
        }
      }

      let props: Property[] = [];
      if (propIds.length > 0) {
        const { data: propRows } = await supabase
          .from("properties")
          .select("id, name")
          .in("id", propIds)
          .order("name");
        props = (propRows ?? []) as Property[];
      }
      setProperties(props);

      // Employees assigned to any of those properties.
      const propIdsForQuery = props.map((p) => p.id);
      if (propIdsForQuery.length === 0) {
        setEmployees([]);
        return;
      }

      const { data: memberRows } = await supabase
        .from("property_members")
        .select("user_id, property_id, role")
        .in("property_id", propIdsForQuery)
        .in("role", EMPLOYEE_ROLES as unknown as string[]);

      const byUser = new Map<string, Set<string>>();
      ((memberRows ?? []) as { user_id: string; property_id: string; role: string }[]).forEach(
        (row) => {
          const set = byUser.get(row.user_id) ?? new Set<string>();
          set.add(row.property_id);
          byUser.set(row.user_id, set);
        },
      );

      const userIds = Array.from(byUser.keys());
      if (userIds.length === 0) {
        setEmployees([]);
        return;
      }

      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, avatar_url, role")
        .in("id", userIds);

      const propNameMap = new Map(props.map((p) => [p.id, p.name]));
      const items: EmployeeProfile[] = ((profileRows ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
        avatar_url: string | null;
        role: string | null;
      }>).map((p) => ({
        ...p,
        properties: Array.from(byUser.get(p.id) ?? []).map((pid) => ({
          id: pid,
          name: propNameMap.get(pid) ?? pid,
        })),
      }));

      items.sort((a, b) =>
        (a.full_name || a.email || "").localeCompare(b.full_name || b.email || ""),
      );
      setEmployees(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed === true) void loadData();
  }, [allowed, user?.id]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter((e) =>
      [e.full_name, e.email, e.phone]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(term)),
    );
  }, [employees, search]);

  const handleCreate = async () => {
    if (!fEmail.trim()) {
      toast.error(t("team.fillRequired", { defaultValue: "Email is required" }));
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("create-team-member", {
      body: {
        email: fEmail.trim(),
        password: fPwd.trim() ? fPwd : undefined,
        full_name: fName.trim(),
        phone: fPhone.trim(),
        role: fRole,
        property_ids: fProps,
      },
    });
    setSubmitting(false);
    if (error || (data as { error?: string } | null)?.error) {
      toast.error(
        (data as { error?: string } | null)?.error ??
          error?.message ??
          t("common.error", { defaultValue: "Something went wrong" }),
      );
      return;
    }
    const reusedExisting = (data as { existing_user?: boolean } | null)?.existing_user;
    toast.success(
      reusedExisting
        ? t("team.existingAdded", {
            email: fEmail,
            defaultValue: `${fEmail} (existing user) added to the team`,
          })
        : t("team.created", { defaultValue: "Employee created" }),
    );
    setCreatedCreds(reusedExisting ? null : { email: fEmail.trim(), password: fPwd });
    await loadData();
  };

  if (authLoading || allowed === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        {t("common.loading", { defaultValue: "Loading…" })}
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!allowed) return <Unauthorized />;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-secondary text-balance">
            {t("adminRoles.employeesTitle", { defaultValue: "Employees" })}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("cohostEmployees.subtitle", {
              defaultValue:
                "Add cleaners, drivers, decorators, maintenance and staff. Generate a QR code so they can sign in by scanning it on their phone.",
            })}
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setAddOpen(true);
          }}
          className="shrink-0"
        >
          <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("team.add", { defaultValue: "Add employee" })}
        </Button>
      </div>

      {/* Toolbar */}
      <Card className="border-border/60 p-4 shadow-sm sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("superAdminProfiles.searchPlaceholder", {
              defaultValue: "Name, email or phone",
            })}
            className="h-10 pl-9"
          />
        </div>
      </Card>

      {/* List */}
      <div className="grid gap-3" aria-busy={loading}>
        {loading ? (
          <Card className="border-border/60 shadow-sm overflow-hidden">
            <ul className="divide-y divide-border/60">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="flex items-center gap-4 px-4 py-3">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full shrink-0" />
                </li>
              ))}
            </ul>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed border-border/60 p-10 text-center shadow-sm">
            <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UsersIcon className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-secondary">
              {t("orgProfiles.emptyTitle", { defaultValue: "No employees yet" })}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("cohostEmployees.emptyHint", {
                defaultValue: "Click \"Add employee\" to create the first one.",
              })}
            </p>
          </Card>
        ) : (
          <Card className="border-border/60 shadow-sm overflow-hidden">
            <ul className="divide-y divide-border/60">
              {filtered.map((emp) => {
                const role = (emp.role || "staff") as EmployeeRole;
                return (
                  <li key={emp.id} className="flex items-center gap-4 px-4 py-3">
                    <Avatar className="h-10 w-10 shrink-0 ring-2 ring-border/40">
                      <AvatarImage src={emp.avatar_url ?? undefined} alt="" />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                        {getInitials(emp.full_name, emp.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-secondary">
                        {emp.full_name ||
                          t("superAdminProfiles.unnamed", { defaultValue: "Unnamed" })}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {emp.email || emp.phone || "—"}
                      </p>
                      {emp.properties.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {emp.properties.map((p) => (
                            <Badge
                              key={p.id}
                              variant="outline"
                              className="border-border/60 bg-background text-[10px] font-medium"
                            >
                              <HomeIcon className="mr-1 h-3 w-3" />
                              {p.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Badge
                      className={cn(
                        "shrink-0 bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 font-medium",
                      )}
                    >
                      {t(`team.roles.${role}`, { defaultValue: role })}
                    </Badge>
                    <MagicLinkQR
                      userId={emp.id}
                      userName={emp.full_name || emp.email || "—"}
                      avatarUrl={emp.avatar_url}
                      roleEmoji={ROLE_EMOJI[role]}
                      roleLabel={t(`team.roles.${role}`, { defaultValue: role })}
                    />
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>

      {/* Add-employee dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("team.add", { defaultValue: "Add employee" })}</DialogTitle>
          </DialogHeader>
          {createdCreds ? (
            <div className="space-y-3">
              <p className="text-sm">
                {t("team.shareCreds", {
                  defaultValue: "Share these sign-in credentials with the new employee.",
                })}
              </p>
              <div className="space-y-2 rounded-md bg-muted p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <strong>{t("auth.email", { defaultValue: "Email" })}:</strong>{" "}
                    {createdCreds.email}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => navigator.clipboard.writeText(createdCreds.email)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <strong>{t("auth.password", { defaultValue: "Password" })}:</strong>{" "}
                    {createdCreds.password}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => navigator.clipboard.writeText(createdCreds.password)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("cohostEmployees.qrHint", {
                  defaultValue:
                    "You can also generate a QR code from the employee row — they sign in by scanning it, no password needed.",
                })}
              </p>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setAddOpen(false);
                    resetForm();
                  }}
                >
                  {t("common.done", { defaultValue: "Done" })}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>{t("team.role", { defaultValue: "Role" })}</Label>
                <Select value={fRole} onValueChange={(v) => setFRole(v as EmployeeRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYEE_ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role} value={role}>
                        {t(`team.roles.${role}`, { defaultValue: role })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("auth.fullName", { defaultValue: "Full name" })}</Label>
                <Input value={fName} onChange={(e) => setFName(e.target.value)} />
              </div>
              <div>
                <Label>{t("auth.email", { defaultValue: "Email" })} *</Label>
                <Input
                  type="email"
                  value={fEmail}
                  onChange={(e) => setFEmail(e.target.value)}
                />
              </div>
              <div>
                <Label>{t("auth.phone", { defaultValue: "Phone" })}</Label>
                <Input value={fPhone} onChange={(e) => setFPhone(e.target.value)} />
              </div>
              <div>
                <Label>{t("team.tempPassword", { defaultValue: "Temporary password" })}</Label>
                <div className="flex gap-2">
                  <Input
                    value={fPwd}
                    onChange={(e) => setFPwd(e.target.value)}
                    placeholder={t("team.pwdPlaceholder", {
                      defaultValue: "Leave blank if user already has an account",
                    })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setFPwd(generateTempPassword())}
                  >
                    ↻
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("team.pwdHint", {
                    defaultValue: "Share this with the new employee or use the QR code to skip it.",
                  })}
                </p>
              </div>
              {properties.length > 0 && (
                <div>
                  <Label>
                    {t("team.assignProperties", { defaultValue: "Assign to properties" })}
                  </Label>
                  <div className="max-h-40 space-y-1 overflow-auto rounded-md border p-2">
                    {properties.map((property) => (
                      <label
                        key={property.id}
                        className="flex cursor-pointer items-center gap-2 rounded p-1 text-sm hover:bg-accent"
                      >
                        <Checkbox
                          checked={fProps.includes(property.id)}
                          onCheckedChange={(checked) =>
                            setFProps((cur) =>
                              checked
                                ? [...cur, property.id]
                                : cur.filter((id) => id !== property.id),
                            )
                          }
                        />
                        {property.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Button>
                <Button onClick={handleCreate} disabled={submitting}>
                  {submitting
                    ? t("common.loading", { defaultValue: "Loading…" })
                    : t("common.save", { defaultValue: "Save" })}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
