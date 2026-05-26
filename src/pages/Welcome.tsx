import {
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AdBanner } from "@/components/AdBanner";
import { EscaparLogo } from "@/components/EscaparLogo";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Building2,
  Loader2,
  LogIn,
  RefreshCw,
  ScanLine,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildRedirectQueryPath,
  consumePostLoginRedirect,
  peekPostLoginRedirect,
  resolvePostLoginRedirect,
} from "@/lib/authRedirect";
import { getUserAccess } from "@/lib/access";

const Welcome = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const [reconnecting, setReconnecting] = useState(false);

  const handleReconnect = async () => {
    setReconnecting(true);
    console.log(
      "[Welcome] Manual reconnect: calling supabase.auth.getSession()",
    );
    try {
      const { data, error } = await supabase.auth.getSession();
      console.log("[Welcome] Reconnect result:", {
        hasSession: !!data.session,
        userId: data.session?.user?.id ?? null,
        email: data.session?.user?.email ?? null,
        expiresAt: data.session?.expires_at ?? null,
        error,
      });
      if (error) {
        toast({
          title: t("welcome.reconnectError", {
            defaultValue: "Reconnect failed",
          }),
          description: error.message,
          variant: "destructive",
        });
      } else if (data.session) {
        toast({
          title: t("welcome.sessionFound", {
            defaultValue: "Session restored",
          }),
          description: `${t("welcome.connectedAs", { defaultValue: "Signed in as" })} ${
            data.session.user.email ?? data.session.user.id
          }`,
        });
      } else {
        toast({
          title: t("welcome.noActiveSession", {
            defaultValue: "No active session",
          }),
          description: t("welcome.noActiveSessionBody", {
            defaultValue:
              "No Supabase session exists in this browser. Use the buttons above to sign in.",
          }),
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error("[Welcome] Reconnect threw:", err);
      toast({
        title: t("common.error", { defaultValue: "Error" }),
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setReconnecting(false);
    }
  };

  const stateFrom =
    typeof location.state === "object" &&
    location.state &&
    "from" in location.state &&
    typeof (location.state as any).from === "string"
      ? ((location.state as any).from as string)
      : null;
  const queryRedirect = searchParams.get("redirect");
  // Peek (do not consume) so the value remains available if the user navigates to /auth.
  const storedFrom = peekPostLoginRedirect();
  const redirectTo = resolvePostLoginRedirect(
    queryRedirect,
    stateFrom,
    storedFrom,
  );
  const [dashboardPath, setDashboardPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setDashboardPath(null);
      return;
    }

    getUserAccess(user.id).then((access) => {
      if (!cancelled) setDashboardPath(access.dashboardPath);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!loading && user) {
    if (!dashboardPath && redirectTo === "/welcome") {
      return (
        <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
        </div>
      );
    }
    const target =
      consumePostLoginRedirect() ??
      (redirectTo === "/welcome" ? (dashboardPath ?? "/employee") : redirectTo);
    return <Navigate to={target} replace />;
  }

  return (
    <div className="relative min-h-screen bg-gradient-hero flex items-center justify-center p-4 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
      {/* Subtle dot-grid texture — adds depth to the flat gradient bg */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>

      <div className="relative w-full max-w-2xl">
        {/* Brand + tagline */}
        <div className="text-center mb-10 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-500">
          <div className="mx-auto mb-5 flex items-center justify-center">
            <EscaparLogo size="text-3xl" className="text-white" />
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-inset ring-white/20 backdrop-blur mb-4">
            <Sparkles className="h-3 w-3" />
            {t("welcome.hero.tagline", {
              defaultValue: "Vacation rental operations, simplified",
            })}
          </span>
          <p className="text-base text-white/80 max-w-md mx-auto leading-relaxed">
            {t("welcome.subtitle", {
              defaultValue:
                "All-in-one platform to manage your short-term rentals",
            })}
          </p>
        </div>

        {/* Two gradient role cards — blue (org) + green (team) */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Organization — blue gradient */}
          <div
            className={cn(
              "relative flex flex-col rounded-3xl p-6 text-white",
              "bg-gradient-to-br from-blue-600 to-indigo-700",
              "ring-1 ring-inset ring-white/10",
              "shadow-xl shadow-blue-950/30 hover:shadow-2xl hover:shadow-blue-950/40",
              "transition-transform duration-200 hover:-translate-y-0.5",
              "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500",
            )}
          >
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur mb-4 ring-1 ring-inset ring-white/20 shadow-inner">
              <Building2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 mb-1.5">
              {t("welcome.orgEyebrow", { defaultValue: "For managers" })}
            </p>
            <h2 className="text-xl font-bold tracking-tight mb-1">
              {t("welcome.orgTitle", {
                defaultValue: "Organization workspace",
              })}
            </h2>
            <p className="text-sm text-white/80 mb-5 leading-relaxed">
              {t("welcome.orgSubtitle", {
                defaultValue: "Admin & co-host — manage your organization",
              })}
            </p>
            <div className="mt-auto space-y-2">
              <Button
                className="w-full bg-white text-blue-700 hover:bg-white/90 cursor-pointer"
                onClick={() =>
                  navigate(
                    buildRedirectQueryPath("/auth?tab=login", redirectTo),
                    { state: location.state },
                  )
                }
              >
                <LogIn className="h-4 w-4 mr-2" />
                {t("auth.login", { defaultValue: "Log in" })}
              </Button>
              <Button
                variant="outline"
                className="w-full border-white/40 text-white bg-white/10 hover:bg-white/20 hover:text-white cursor-pointer"
                onClick={() =>
                  navigate(
                    buildRedirectQueryPath("/auth?tab=signup", redirectTo),
                    { state: location.state },
                  )
                }
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {t("welcome.createOrganization", {
                  defaultValue: "Create organization",
                })}
              </Button>
            </div>
          </div>

          {/* Team / Employee — emerald gradient */}
          <div
            className={cn(
              "relative flex flex-col rounded-3xl p-6 text-white",
              "bg-gradient-to-br from-emerald-500 to-teal-600",
              "ring-1 ring-inset ring-white/10",
              "shadow-xl shadow-emerald-950/30 hover:shadow-2xl hover:shadow-emerald-950/40",
              "transition-transform duration-200 hover:-translate-y-0.5",
              "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500",
            )}
          >
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur mb-4 ring-1 ring-inset ring-white/20 shadow-inner">
              <ScanLine className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 mb-1.5">
              {t("welcome.staffEyebrow", { defaultValue: "For team" })}
            </p>
            <h2 className="text-xl font-bold tracking-tight mb-1">
              {t("welcome.staffTitle", {
                defaultValue: "Team workspace",
              })}
            </h2>
            <p className="text-sm text-white/80 mb-5 leading-relaxed">
              {t("welcome.staffSubtitle", {
                defaultValue: "Sign in with your QR code or credentials",
              })}
            </p>
            <Button
              className="mt-auto w-full bg-white text-emerald-700 hover:bg-white/90 cursor-pointer"
              onClick={() =>
                navigate(buildRedirectQueryPath("/staff-login", redirectTo), {
                  state: location.state,
                })
              }
            >
              <ScanLine className="h-4 w-4 mr-2" />
              {t("welcome.staffCta", { defaultValue: "Team login" })}
            </Button>
          </div>
        </div>

        {/* Reconnect — secondary action */}
        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReconnect}
            disabled={reconnecting}
            className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white cursor-pointer disabled:opacity-60"
          >
            {reconnecting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {reconnecting
              ? t("welcome.reconnecting", { defaultValue: "Checking…" })
              : t("welcome.reconnect", { defaultValue: "Reconnect session" })}
          </Button>
        </div>

        {/* Ad placement */}
        <div className="mt-8">
          <AdBanner placement="welcome_footer" />
        </div>

        <p className="text-center text-xs text-white/70 mt-10">
          © {new Date().getFullYear()} Escapar
        </p>
      </div>
    </div>
  );
};

export default Welcome;
