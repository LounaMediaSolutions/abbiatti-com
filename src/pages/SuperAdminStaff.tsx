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
import { Shield, UserPlus, Trash2, Wrench, Code, Calculator, LifeBuoy, Crown } from "lucide-react";
import { Unauthorized } from "@/components/Unauthorized";
import { isAuthzError } from "@/lib/authzError";
import { isSuperAdminUser } from "@/lib/access";

const PLATFORM_ROLES = [
  { value: "technician", labelKey: "superAdminStaff.roles.technician", icon: Wrench, color: "bg-blue-600" },
  { value: "developer", labelKey: "superAdminStaff.roles.developer", icon: Code, color: "bg-violet-600" },
  { value: "accountant", labelKey: "superAdminStaff.roles.accountant", icon: Calculator, color: "bg-emerald-600" },
  { value: "support", labelKey: "superAdminStaff.roles.support", icon: LifeBuoy, color: "bg-amber-600" },
  { value: "super_admin", labelKey: "superAdminStaff.roles.super_admin", icon: Crown, color: "bg-rose-600" },
] as const;

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
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-secondary">{t("superAdminStaff.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("superAdminStaff.subtitle")}</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
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

      <div className="grid gap-3">
        {staff.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground shadow-card">
            {t("superAdminStaff.empty")}
          </Card>
        )}
        {staff.map((m) => {
          const meta = roleMeta(m.role);
          const Icon = meta?.icon ?? Shield;
          return (
            <Card key={`${m.user_id}-${m.role}`} className="p-4 shadow-card">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${meta?.color ?? "bg-slate-700"}`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-secondary">{m.full_name || "(Sans nom)"}</p>
                    <p className="text-xs text-muted-foreground">{m.phone || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{roleLabel(m.role)}</Badge>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive">
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
                        <AlertDialogAction onClick={() => removeRole(m)} className="bg-rose-600 hover:bg-rose-700">
                          {t("superAdminStaff.remove")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
