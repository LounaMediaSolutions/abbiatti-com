import {
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AdBanner } from "@/components/AdBanner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Building2, LogIn, RefreshCw, ScanLine, Sparkles } from "lucide-react";
import abbiattiLogo from "@/assets/abbiatti-logo.png";
import {
  buildRedirectQueryPath,
  consumePostLoginRedirect,
  peekPostLoginRedirect,
  resolvePostLoginRedirect,
} from "@/lib/authRedirect";
import { getUserAccess } from "@/lib/access";

const Welcome = () => {
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
          title: "Erreur de reconnexion",
          description: error.message,
          variant: "destructive",
        });
      } else if (data.session) {
        toast({
          title: "Session retrouvée",
          description: `Connecté en tant que ${data.session.user.email ?? data.session.user.id}`,
        });
      } else {
        toast({
          title: "Aucune session active",
          description:
            "Aucune session Supabase n'existe dans ce navigateur. Connectez-vous via « Se connecter ».",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error("[Welcome] Reconnect threw:", err);
      toast({
        title: "Erreur",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setReconnecting(false);
    }
  };

  const lastOrgName =
    typeof window !== "undefined" ? localStorage.getItem("lastOrgName") : null;
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
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      );
    }
    const target =
      consumePostLoginRedirect() ??
      (redirectTo === "/welcome" ? (dashboardPath ?? "/employee") : redirectTo);
    return <Navigate to={target} replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-2xl">
        <div className="text-center mb-10 animate-fade-in">
          <img
            src={abbiattiLogo}
            alt="Abbiatti"
            className="mx-auto mb-5 h-24 w-auto"
          />
          <h1 className="sr-only">Abbiatti</h1>
          {lastOrgName ? (
            <p className="text-lg font-medium text-primary">
              Bienvenue {lastOrgName} 👋
            </p>
          ) : (
            <p className="text-base text-muted-foreground max-w-md mx-auto">
              Plateforme tout-en-un pour gérer vos locations courte durée
            </p>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Manager / Agency window */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl hover-scale animate-fade-in">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur mb-4">
              <Building2 className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold mb-1">Espace Agence</h2>
            <p className="text-sm text-white/80 mb-5">
              Admin & Co-hôte — gérez votre agence
            </p>
            <div className="space-y-2">
              <Button
                className="w-full bg-white text-blue-700 hover:bg-white/90"
                onClick={() =>
                  navigate(
                    buildRedirectQueryPath("/auth?tab=login", redirectTo),
                    { state: location.state },
                  )
                }
              >
                <LogIn className="h-4 w-4 mr-2" /> Se connecter
              </Button>
              {!lastOrgName && (
                <Button
                  variant="outline"
                  className="w-full border-white/40 text-white bg-white/10 hover:bg-white/20 hover:text-white"
                  onClick={() =>
                    navigate(
                      buildRedirectQueryPath("/auth?tab=signup", redirectTo),
                      { state: location.state },
                    )
                  }
                >
                  <Sparkles className="h-4 w-4 mr-2" /> Créer une agence
                </Button>
              )}
            </div>
          </div>

          {/* Employee window */}
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-6 text-white shadow-xl hover-scale animate-fade-in">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur mb-4">
              <ScanLine className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold mb-1">Espace Employé</h2>
            <p className="text-sm text-white/80 mb-5">
              Connectez-vous avec votre QR code ou identifiants
            </p>
            <Button
              className="w-full bg-white text-emerald-700 hover:bg-white/90"
              onClick={() =>
                navigate(buildRedirectQueryPath("/staff-login", redirectTo), {
                  state: location.state,
                })
              }
            >
              <ScanLine className="h-4 w-4 mr-2" /> Connexion équipe
            </Button>
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReconnect}
            disabled={reconnecting}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${reconnecting ? "animate-spin" : ""}`}
            />
            {reconnecting ? "Vérification…" : "Reconnecter"}
          </Button>
        </div>

        <div className="mt-8">
          <AdBanner placement="welcome_footer" />
        </div>

        <p className="text-center text-xs text-muted-foreground mt-10">
          © {new Date().getFullYear()} Abbiatti
        </p>
      </div>
    </div>
  );
};

export default Welcome;
