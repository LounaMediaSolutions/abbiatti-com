import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { EscaparLogo } from "@/components/EscaparLogo";
import { toast } from "sonner";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  CalendarCheck,
  KeyRound,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

const getAuthorizedRedirectTarget = (
  target: string | null | undefined,
  access: Awaited<ReturnType<typeof getUserAccess>>,
) => {
  if (!target || target === "/welcome") {
    return access.dashboardPath;
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
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const appOrigin = getAppOrigin();

  // Belt-and-braces for stale password-recovery email links. Older versions
  // of this app sent the reset email with `redirectTo` pointing at /auth
  // instead of /reset-password (see Settings.tsx history). Those links are
  // still valid until they expire — when one of them lands here we bounce
  // to /reset-password while preserving the URL hash so the Supabase SDK
  // still picks up the recovery token and the password form renders.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash ?? "";
    if (!hash) return;
    if (/[?#&]type=recovery(&|$)/.test(hash)) {
      navigate(`/reset-password${hash}`, { replace: true });
    }
  }, [navigate]);

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
        const target = getAuthorizedRedirectTarget(
          storedTarget ?? fallbackTarget,
          access,
        );
        navigate(target, { replace: true });
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

  // Marketing column highlights — three concise value props for the hero side.
  const highlights = [
    {
      icon: CalendarCheck,
      titleKey: "auth.hero.feature1Title",
      titleFallback: "All your bookings, one calendar",
      bodyKey: "auth.hero.feature1Body",
      bodyFallback: "Airbnb, Booking, Vrbo — synced automatically every hour.",
    },
    {
      icon: KeyRound,
      titleKey: "auth.hero.feature2Title",
      titleFallback: "Smooth guest experience",
      bodyKey: "auth.hero.feature2Body",
      bodyFallback: "Digital guest book, codes, instructions — at the right time.",
    },
    {
      icon: ShieldCheck,
      titleKey: "auth.hero.feature3Title",
      titleFallback: "Built for serious operators",
      bodyKey: "auth.hero.feature3Body",
      bodyFallback: "Role-aware access, audit trail, fine-grained permissions.",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
      {/* ─── HERO SIDE ─── desktop: 50%; mobile: a slim brand bar at top */}
      <aside
        className={cn(
          "relative isolate overflow-hidden",
          "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900",
          "lg:w-1/2 lg:min-h-screen",
          "px-6 py-8 lg:px-12 lg:py-16",
          "flex flex-col justify-between text-white",
        )}
      >
        {/* Decorative dot grid + glow — purely visual, hidden from a11y tree */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/30 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl"
        />

        {/* Top: brand + back link */}
        <div className="relative flex items-center justify-between gap-4">
          <EscaparLogo size="text-2xl" className="text-white" />
          <button
            type="button"
            onClick={() => navigate("/welcome")}
            className={cn(
              "inline-flex items-center gap-1.5 text-sm",
              "text-white/70 hover:text-white",
              "transition-colors duration-200 cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 rounded",
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            {t("auth.back", { defaultValue: "Back" })}
          </button>
        </div>

        {/* Middle: pitch — hidden on small screens to keep the hero bar short */}
        <div className="relative hidden lg:flex flex-col gap-8 max-w-md">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-inset ring-white/20">
              <Sparkles className="h-3 w-3" />
              {t("auth.hero.tagline", {
                defaultValue: "Vacation rental operations, simplified",
              })}
            </span>
            <h2 className="text-4xl font-bold tracking-tight leading-tight">
              {t("auth.hero.headline", {
                defaultValue: "Run every stay like a five-star hotel.",
              })}
            </h2>
            <p className="text-base text-white/70 leading-relaxed">
              {t("auth.hero.subhead", {
                defaultValue:
                  "Properties, bookings, teams, guests — one calm workspace for the whole team.",
              })}
            </p>
          </div>

          <ul className="space-y-4">
            {highlights.map(({ icon: Icon, titleKey, titleFallback, bodyKey, bodyFallback }) => (
              <li key={titleKey} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/15">
                  <Icon className="h-4 w-4 text-white" />
                </span>
                <div>
                  <p className="text-sm font-medium text-white">
                    {t(titleKey, { defaultValue: titleFallback })}
                  </p>
                  <p className="text-sm text-white/60 leading-relaxed">
                    {t(bodyKey, { defaultValue: bodyFallback })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom: subtle footer */}
        <div className="relative hidden lg:flex items-center justify-between text-xs text-white/40">
          <span>
            © {new Date().getFullYear()} Escapar
          </span>
          <span>{t("auth.hero.trustline", { defaultValue: "Trusted by hospitality teams" })}</span>
        </div>
      </aside>

      {/* ─── FORM SIDE ─── */}
      <main className="relative flex-1 flex items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>

        <div className="w-full max-w-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-500">
          {/* Form header */}
          <div className="mb-8 space-y-2 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-secondary">
              {defaultTab === "signup"
                ? t("auth.signupTitle", { defaultValue: "Create your workspace" })
                : t("auth.loginTitle", { defaultValue: "Welcome back" })}
            </h1>
            {lastOrgName ? (
              <p className="text-base font-medium text-primary">
                {t("auth.welcomeOrganization", { name: lastOrgName }) ||
                  `Bienvenue ${lastOrgName} 👋`}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("auth.subtitle", {
                  defaultValue: "Admin & co-host workspace for your properties.",
                })}
              </p>
            )}
          </div>

          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-11">
              <TabsTrigger
                value="login"
                className="cursor-pointer data-[state=active]:shadow-sm"
              >
                {t("auth.login")}
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="cursor-pointer data-[state=active]:shadow-sm"
              >
                {t("auth.signup")}
              </TabsTrigger>
            </TabsList>

            {/* ─── LOGIN TAB ─── */}
            <TabsContent value="login" className="mt-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="loginEmail" className="text-sm font-medium">
                    {t("auth.email")}
                  </Label>
                  <Input
                    id="loginEmail"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-11"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="loginPassword" className="text-sm font-medium">
                      {t("auth.password")}
                    </Label>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={loading}
                      className={cn(
                        "text-xs font-medium text-primary hover:underline",
                        "transition-colors duration-200 cursor-pointer",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      )}
                    >
                      {t("auth.forgotPassword") || "Mot de passe oublié ?"}
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="loginPassword"
                      type={showLoginPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((v) => !v)}
                      aria-label={
                        showLoginPassword
                          ? t("auth.hidePassword", { defaultValue: "Hide password" })
                          : t("auth.showPassword", { defaultValue: "Show password" })
                      }
                      className={cn(
                        "absolute inset-y-0 right-0 flex w-10 items-center justify-center",
                        "text-muted-foreground hover:text-foreground",
                        "transition-colors duration-200 cursor-pointer",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-r-md",
                      )}
                    >
                      {showLoginPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 text-sm font-semibold transition-all duration-200"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("common.loading", { defaultValue: "Loading…" })}
                    </>
                  ) : (
                    t("auth.loginBtn")
                  )}
                </Button>
              </form>
            </TabsContent>

            {/* ─── SIGNUP TAB ─── */}
            <TabsContent value="signup" className="mt-6">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="orgName" className="text-sm font-medium">
                    {t("auth.orgName")}
                  </Label>
                  <Input
                    id="orgName"
                    autoComplete="organization"
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fullName" className="text-sm font-medium">
                    {t("auth.fullName")}
                  </Label>
                  <Input
                    id="fullName"
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signupEmail" className="text-sm font-medium">
                    {t("auth.email")}
                  </Label>
                  <Input
                    id="signupEmail"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-sm font-medium">
                    {t("auth.phone")}
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signupPassword" className="text-sm font-medium">
                    {t("auth.password")}
                  </Label>
                  <div className="relative">
                    <Input
                      id="signupPassword"
                      type={showSignupPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword((v) => !v)}
                      aria-label={
                        showSignupPassword
                          ? t("auth.hidePassword", { defaultValue: "Hide password" })
                          : t("auth.showPassword", { defaultValue: "Show password" })
                      }
                      className={cn(
                        "absolute inset-y-0 right-0 flex w-10 items-center justify-center",
                        "text-muted-foreground hover:text-foreground",
                        "transition-colors duration-200 cursor-pointer",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-r-md",
                      )}
                    >
                      {showSignupPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("auth.passwordMin")}
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 text-sm font-semibold transition-all duration-200"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("common.loading", { defaultValue: "Loading…" })}
                    </>
                  ) : (
                    t("auth.signupBtn")
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Legal / reassurance line */}
          <p className="mt-8 text-center text-xs text-muted-foreground">
            {t("auth.legal", {
              defaultValue:
                "By continuing you agree to our terms of service and privacy policy.",
            })}
          </p>
        </div>
      </main>

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
