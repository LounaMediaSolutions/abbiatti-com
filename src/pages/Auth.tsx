import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { toast } from "sonner";
import { Building2, ArrowLeft } from "lucide-react";
import {
  consumePostLoginRedirect,
  peekPostLoginRedirect,
  resolvePostLoginRedirect,
} from "@/lib/authRedirect";
import { getAppOrigin } from "@/lib/appOrigin";
import { getUserAccess } from "@/lib/access";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6),
});

const signupSchema = z.object({
  orgName: z.string().trim().min(1).max(100),
  fullName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(30).optional(),
  password: z.string().min(6).max(72),
});

const Auth = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") === "signup" ? "signup" : "login";
  const queryRedirect = searchParams.get("redirect");
  const stateFrom =
    typeof location.state === "object" &&
    location.state &&
    "from" in location.state &&
    typeof (location.state as any).from === "string"
      ? ((location.state as any).from as string)
      : null;
  const storedFrom = peekPostLoginRedirect();
  const redirectTo = resolvePostLoginRedirect(
    queryRedirect,
    stateFrom,
    storedFrom,
  );
  const [loading, setLoading] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [pendingResetEmail, setPendingResetEmail] = useState("");
  const appOrigin = getAppOrigin();

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const lastOrgName =
    typeof window !== "undefined" ? localStorage.getItem("lastOrgName") : null;

  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const parsed = loginSchema.safeParse({
        email: loginEmail,
        password: loginPassword,
      });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0].message);
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(t("auth.loginSuccess"));
      // Route authenticated users to their dashboard unless a deeper redirect was stored.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const access = await getUserAccess(user.id);
        if (access.role === "guest") {
          consumePostLoginRedirect();
          navigate("/guest");
          return;
        }

        const storedTarget = consumePostLoginRedirect();
        const fallbackTarget = redirectTo === "/welcome" ? access.dashboardPath : redirectTo;
        navigate(storedTarget ?? fallbackTarget, { replace: true });
        return;
      }

      const target = consumePostLoginRedirect() ?? redirectTo;
      navigate(target === "/welcome" ? "/employee" : target, { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const parsed = signupSchema.safeParse({
        orgName,
        fullName,
        email: signupEmail,
        phone,
        password: signupPassword,
      });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0].message);
        return;
      }
      const { error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          emailRedirectTo: `${appOrigin}/`,
          data: {
            full_name: parsed.data.fullName,
            phone: parsed.data.phone ?? "",
            org_name: parsed.data.orgName,
            language: i18n.language,
          },
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      try {
        localStorage.setItem("lastOrgName", parsed.data.orgName);
      } catch {}
      toast.success(t("auth.signupSuccess"));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    const parsed = z.string().email().safeParse(loginEmail.trim());
    if (!parsed.success) {
      toast.error(t("auth.enterEmailFirst") || "Entre ton email d'abord");
      return;
    }
    setPendingResetEmail(parsed.data);
    setResetConfirmOpen(true);
  };

  const confirmSendResetEmail = async () => {
    if (!pendingResetEmail) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        pendingResetEmail,
        {
          redirectTo: `${appOrigin}/reset-password`,
        },
      );
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(
        t("auth.resetEmailSent") || "Email de réinitialisation envoyé",
      );
    } finally {
      setLoading(false);
      setResetConfirmOpen(false);
      setPendingResetEmail("");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-700">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <button
        onClick={() => navigate("/welcome")}
        className="absolute top-4 left-4 inline-flex items-center gap-1 text-white/90 hover:text-white text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>
      <Card className="w-full max-w-md p-8 shadow-2xl border-0 bg-white/95 backdrop-blur">
        <div className="text-center mb-6">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 mb-3">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-secondary">Espace Organisation</h1>
          {lastOrgName ? (
            <p className="text-base font-medium text-primary mt-1">
              {t("auth.welcomeOrganization", { name: lastOrgName }) ||
                `Bienvenue ${lastOrgName} 👋`}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Admin & Co-hôte</p>
          )}
        </div>

        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">{t("auth.login")}</TabsTrigger>
            <TabsTrigger value="signup">{t("auth.signup")}</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={handleLogin} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="loginEmail">{t("auth.email")}</Label>
                <Input
                  id="loginEmail"
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loginPassword">{t("auth.password")}</Label>
                <Input
                  id="loginPassword"
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {t("auth.loginBtn")}
              </Button>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                className="w-full text-sm text-primary hover:underline text-center"
              >
                {t("auth.forgotPassword") || "Mot de passe oublié ?"}
              </button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignup} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">{t("auth.orgName")}</Label>
                <Input
                  id="orgName"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName">{t("auth.fullName")}</Label>
                <Input
                  id="fullName"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signupEmail">{t("auth.email")}</Label>
                <Input
                  id="signupEmail"
                  type="email"
                  required
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t("auth.phone")}</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signupPassword">{t("auth.password")}</Label>
                <Input
                  id="signupPassword"
                  type="password"
                  required
                  minLength={6}
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("auth.passwordMin")}
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {t("auth.signupBtn")}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </Card>

      <AlertDialog
        open={resetConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !loading) {
            setResetConfirmOpen(false);
            setPendingResetEmail("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("auth.resetConfirmTitle") || "Envoyer l'email de réinitialisation ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("auth.resetConfirmDesc", { email: pendingResetEmail }) ||
                `Un lien de réinitialisation sera envoyé à ${pendingResetEmail}. Confirmer ?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>
              {t("common.cancel") || "Annuler"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmSendResetEmail();
              }}
              disabled={loading}
            >
              {loading
                ? t("common.sending") || "Envoi..."
                : t("auth.resetConfirmAction") || "Envoyer l'email"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Auth;
