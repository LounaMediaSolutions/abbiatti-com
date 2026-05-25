import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { toast } from "sonner";
import { ArrowLeft, LogIn } from "lucide-react";
import { buildRedirectQueryPath, consumePostLoginRedirect, peekPostLoginRedirect, resolvePostLoginRedirect } from "@/lib/authRedirect";
import { getUserAccess } from "@/lib/access";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6),
});

const getAuthorizedRedirectTarget = (
  target: string | null | undefined,
  access: Awaited<ReturnType<typeof getUserAccess>> | null,
) => {
  if (!target || target === "/welcome") {
    return access?.dashboardPath ?? "/employee";
  }

  if (!access) {
    return target;
  }

  if (target.startsWith("/super-admin")) {
    return access.isSuperAdmin ? target : access.dashboardPath;
  }

  if (target.startsWith("/admin")) {
    return access.isAdmin ? target : access.dashboardPath;
  }

  if (target.startsWith("/cohost")) {
    return access.isCohost ? target : access.dashboardPath;
  }

  if (target.startsWith("/employee")) {
    return access.isStaff ? target : access.dashboardPath;
  }

  return target;
};

const StaffLogin = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryRedirect = searchParams.get("redirect");
  const stateFrom = typeof location.state === "object" && location.state && "from" in location.state && typeof (location.state as any).from === "string"
    ? (location.state as any).from as string
    : null;
  const storedFrom = peekPostLoginRedirect();
  const redirectTo = resolvePostLoginRedirect(queryRedirect, stateFrom, storedFrom);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("auth.loginSuccess"));
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const access = user ? await getUserAccess(user.id) : null;
    const target = getAuthorizedRedirectTarget(
      consumePostLoginRedirect() ??
        (redirectTo === "/welcome" ? access?.dashboardPath ?? "/employee" : redirectTo),
      access,
    );
    navigate(target, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <button
        onClick={() => navigate("/welcome")}
        className="absolute top-4 left-4 inline-flex items-center gap-1 text-white/90 hover:text-white text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> {t("common.back") || "Retour"}
      </button>

      <Card className="w-full max-w-md p-8 shadow-2xl border-0 bg-white/95 backdrop-blur">
        <div className="text-center mb-6">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-4 shadow-lg">
            <LogIn className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-secondary mb-1">
            {t("auth.staffTitle") || "Connexion Équipe"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("auth.staffSubtitle") || "Utilisez les identifiants reçus de votre manager"}
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="staffEmail">{t("auth.email")}</Label>
            <Input id="staffEmail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staffPassword">{t("auth.password")}</Label>
            <Input id="staffPassword" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {t("auth.loginBtn")}
          </Button>
        </form>

        <div className="mt-6 pt-4 border-t text-center">
          <p className="text-xs text-muted-foreground mb-2">
            {t("auth.isManager") || "Vous êtes admin ou co-hôte ?"}
          </p>
          <Button variant="ghost" size="sm" onClick={() => navigate(buildRedirectQueryPath("/auth", redirectTo))}>
            {t("auth.managerLogin") || "Connexion manager →"}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default StaffLogin;
