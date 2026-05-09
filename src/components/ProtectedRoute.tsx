import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { buildRedirectQueryPath, setPostLoginRedirect } from "@/lib/authRedirect";

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    console.log("[ProtectedRoute] auth loading…", { path: location.pathname });
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    const redirectTarget = buildRedirectQueryPath("/welcome", from);
    if (from && from !== "/welcome") setPostLoginRedirect(from);
    console.warn("[ProtectedRoute] No authenticated user — redirecting to Welcome", {
      from,
      redirectTarget,
      reason: "supabase.auth.getSession() returned no session in this browser",
    });
    return <Navigate to={redirectTarget} replace state={{ from }} />;
  }

  console.log("[ProtectedRoute] Authenticated — rendering protected route", {
    path: location.pathname,
    userId: user.id,
    email: user.email,
  });

  return <>{children}</>;
};
