import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  buildRedirectQueryPath,
  setPostLoginRedirect,
} from "@/lib/authRedirect";
import { createDebugLogger } from "@/lib/debugLog";
import { getUserAccess, isEmployeeRole } from "@/lib/access";
import { Unauthorized } from "@/components/Unauthorized";

const log = createDebugLogger("auth");

/**
 * Role classes a route can require. Map to the predicates exposed by
 * `getUserAccess()` so a route doesn't have to know about literal role names
 * like "co_admin" or "decorator" — it just declares the access bucket.
 *
 *   super_admin → access.isSuperAdmin
 *   admin       → access.isAdmin       (admin + co_admin)
 *   cohost      → access.isCohost      (role='cohost' or has cohost assignments)
 *   employee    → cleaner/driver/decorator/maintenance/staff
 *   user        → role='user' (pending admin-access request)
 *   guest       → role='guest'
 *
 * Super-admins implicitly satisfy every `allow` list — platform owners need
 * to be able to debug any page. Defense-in-depth still lives at the DB layer
 * via RLS, so this is a UX/UI guard, not the only gate.
 */
export type RoleClass =
  | "super_admin"
  | "admin"
  | "cohost"
  | "employee"
  | "user"
  | "guest";

type Access = Awaited<ReturnType<typeof getUserAccess>>;

const matchesAllow = (access: Access, allow: RoleClass[]): boolean => {
  if (access.isSuperAdmin) return true; // platform-wide implicit pass.
  for (const cls of allow) {
    if (cls === "super_admin" && access.isSuperAdmin) return true;
    if (cls === "admin" && access.isAdmin) return true;
    if (cls === "cohost" && access.isCohost) return true;
    if (cls === "employee" && isEmployeeRole(access.role)) return true;
    if (cls === "user" && access.isPendingUser) return true;
    if (cls === "guest" && access.role === "guest") return true;
  }
  return false;
};

interface ProtectedRouteProps {
  children: ReactNode;
  /**
   * If set, the authenticated user's role must match at least one class.
   * Omit (or pass an empty array) to allow any signed-in user — useful for
   * the generic Home/Dashboard routes that redirect based on role themselves.
   */
  allow?: RoleClass[];
}

const Spinner = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

export const ProtectedRoute = ({ children, allow }: ProtectedRouteProps) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const needsRoleCheck = !!allow && allow.length > 0;
  const [access, setAccess] = useState<Access | null>(null);

  useEffect(() => {
    if (!user || !needsRoleCheck) {
      setAccess(null);
      return;
    }
    let cancelled = false;
    getUserAccess(user.id)
      .then((next) => {
        if (!cancelled) setAccess(next);
      })
      .catch((err) => {
        // Real failure — keep it loud regardless of debug flag.
        console.error("[ProtectedRoute] getUserAccess threw:", err);
        if (!cancelled) setAccess(null);
      });
    return () => {
      cancelled = true;
    };
    // `allow` is a stable concern of each route. We key on user.id and the
    // boolean — the array contents are static per route definition.
  }, [user?.id, needsRoleCheck]);

  if (loading) {
    log("auth loading", { path: location.pathname });
    return <Spinner />;
  }

  if (!user) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    const redirectTarget = buildRedirectQueryPath("/welcome", from);
    if (from && from !== "/welcome") setPostLoginRedirect(from);
    log("no auth user, redirecting", { from, redirectTarget });
    return <Navigate to={redirectTarget} replace state={{ from }} />;
  }

  if (needsRoleCheck) {
    if (!access) {
      // Access not yet resolved — show spinner rather than flashing children
      // for a frame.
      return <Spinner />;
    }
    if (!matchesAllow(access, allow!)) {
      log("role check failed", {
        path: location.pathname,
        role: access.role,
        allow,
      });
      return <Unauthorized />;
    }
  }

  log("rendering protected", { path: location.pathname });
  return <>{children}</>;
};
