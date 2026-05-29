import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Shield, UserPlus, Trash2, Wrench, Code, Calculator, LifeBuoy, Crown, Phone, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Unauthorized } from "@/components/Unauthorized";
import { isAuthzError } from "@/lib/authzError";
import { isSuperAdminUser } from "@/lib/access";

// Soft tinted chips — same convention as OrgProfileManager / SuperAdmin
// ProfileManager so a role reads the same on every screen. `tile` tones the
// avatar's role badge; `chip` is the inline role pill.
const PLATFORM_ROLES = [
  {
    value: "technician",
    labelKey: "superAdminStaff.roles.technician",
    icon: Wrench,
    chip: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
    tile: "bg-blue-50 text-blue-600",
  },
  {
    value: "developer",
    labelKey: "superAdminStaff.roles.developer",
    icon: Code,
    chip: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200",
    tile: "bg-violet-50 text-violet-600",
  },
  {
    value: "accountant",
    labelKey: "superAdminStaff.roles.accountant",
    icon: Calculator,
    chip: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
    tile: "bg-emerald-50 text-emerald-600",
  },
  {
    value: "support",
    labelKey: "superAdminStaff.roles.support",
    icon: LifeBuoy,
    chip: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
    tile: "bg-amber-50 text-amber-600",
  },
  {
    value: "super_admin",
    labelKey: "superAdminStaff.roles.super_admin",
    icon: Crown,
    chip: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200",
    tile: "bg-indigo-50 text-indigo-600",
  },
] as const;

const getInitials = (name: string | null) => {
  const source = (name || "").trim();
  if (!source) return "U";
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
};

type StaffMember = {
  user_id: string;
  role: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

export default function SuperAdminStaff() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [isSuper, setIsSuper] = useState<boolean | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [denied, setDenied] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<string>("technician");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setIsSuper(false);
      return;
    }
    isSuperAdminUser(user.id).then(setIsSuper).catch(() => setIsSuper(false));
  }, [user?.id, loading]);

  const load = async () => {
    const platformRoleVals = PLATFORM_ROLES.map((r) => r.value);
    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", platformRoleVals as any)
      .is("organization_id", null);
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      return;
    }
    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    if (ids.length === 0) {
      setStaff([]);
      return;
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", ids);
    const merged: StaffMember[] = (roles ?? []).map((r) => {
      const p = (profiles ?? []).find((x) => x.id === r.user_id);
      return {
        user_id: r.user_id,
        role: r.role,
        full_name: p?.full_name ?? null,
        email: null,
        phone: p?.phone ?? null,
      };
    });
    setStaff(merged);
  };

  useEffect(() => {
    if (isSuper) load();
  }, [isSuper]);

  const createStaff = async () => {
    if (!email || !password || !role) {
      toast({ title: t("superAdminStaff.requiredFields"), description: t("superAdminStaff.requiredFieldsBody"), variant: "destructive" });
      return;
    }
    setCreating(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke("create-platform-staff", {
      body: { email, password, full_name: fullName, phone, role },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });
    setCreating(false);
    if (error || (data as any)?.error) {
      if (await isAuthzError(error, data)) {
        setOpen(false);
        setDenied(true);
        return;
      }
      toast({
        title: t("common.error"),
        description: (data as any)?.error ?? error?.message ?? t("superAdminStaff.failed"),
        variant: "destructive",
      });
      return;
    }
    toast({ title: t("superAdminStaff.accountCreated"), description: `${email} (${role})` });
    setOpen(false);
    setEmail("");
    setPassword("");
    setFullName("");
    setPhone("");
    setRole("technician");
    load();
  };

  const removeRole = async (m: StaffMember) => {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", m.user_id)
      .eq("role", m.role as any)
      .is("organization_id", null);
    if (error) {
      if (await isAuthzError(error, null)) {
        setDenied(true);
        return;
      }
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: t("superAdminStaff.roleRemoved") });
    load();
  };

  const roleMeta = (r: string) => PLATFORM_ROLES.find((x) => x.value === r);
  const roleLabel = (r: string) => {
    const meta = roleMeta(r);
    return meta ? t(meta.labelKey) : r;
  };

  if (loading || isSuper === null) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">{t("common.loading")}</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuper) return <Unauthorized />;
  if (denied) return <Unauthorized message={t("superAdminStaff.unauthorized")} />;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* ─── Page header card ─── eyebrow + title + add CTA */}
      <Card className="border-border/60 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t("superAdminProfiles.eyebrow", { defaultValue: "Platform administration" })}
            </p>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Shield className="h-5 w-5" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-secondary md:text-3xl">
                {t("superAdminStaff.title")}
              </h1>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">{t("superAdminStaff.subtitle")}</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="shrink-0 cursor-pointer">
                <UserPlus className="mr-2 h-4 w-4" /> {t("superAdminStaff.newAccount")}
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("superAdminStaff.createDialogTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{t("team.role")}</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{t(r.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("auth.fullName")}</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <Label>{t("auth.email")}</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label>{t("auth.phone")}</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <Label>{t("team.tempPassword")}</Label>
                <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("auth.passwordMin")} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={createStaff} disabled={creating}>
                {creating ? t("common.loading") : t("common.create")}
              </Button>
            </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </Card>

      {/* ─── Staff list ─── unified surface, one row per role assignment */}
      {staff.length === 0 ? (
        <Card className="border-dashed border-border/60 p-10 text-center shadow-sm">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Users className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground">{t("superAdminStaff.empty")}</p>
        </Card>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-sm">
          <ul className="divide-y divide-border/60">
            {staff.map((m) => {
              const meta = roleMeta(m.role);
              const Icon = meta?.icon ?? Shield;
              return (
                <li
                  key={`${m.user_id}-${m.role}`}
                  className="flex items-center gap-4 px-4 py-3"
                >
                  <Avatar className="h-10 w-10 shrink-0 ring-2 ring-border/40">
                    <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                      {getInitials(m.full_name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-secondary">
                      {m.full_name || t("superAdminProfiles.unnamed", { defaultValue: "Unnamed" })}
                    </p>
                    <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" />
                      {m.phone || "—"}
                    </p>
                  </div>

                  <Badge
                    className={cn(
                      "shrink-0 gap-1 font-medium",
                      meta?.chip ?? "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200",
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {roleLabel(m.role)}
                  </Badge>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 cursor-pointer text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={t("superAdminStaff.remove")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("superAdminStaff.removeRoleTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("superAdminStaff.removeRoleDescription", { role: roleLabel(m.role) })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => removeRole(m)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {t("superAdminStaff.remove")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
