import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getUserAccess } from "@/lib/access";
import Dashboard from "./Dashboard";
import MyAgenda from "./MyAgenda";

export default function Home() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [access, setAccess] = useState<Awaited<ReturnType<typeof getUserAccess>> | null>(null);
  const dashboardPaths = new Set(["/", "/admin/dashboard", "/cohost/dashboard", "/employee"]);

  useEffect(() => {
    if (!user) {
      setAccess(null);
      return;
    }

    setAccess(null);
    getUserAccess(user.id).then((nextAccess) => {
      setAccess(nextAccess);
    });
  }, [user?.id]);

  if (loading || (user && access === null)) {
    return <div className="p-6 text-center text-muted-foreground">...</div>;
  }

  if (!access) return null;

  if (location.pathname === "/") {
    return <Navigate to={access.dashboardPath} replace />;
  }

  if (dashboardPaths.has(location.pathname) && location.pathname !== access.dashboardPath) {
    return <Navigate to={access.dashboardPath} replace />;
  }

  return access.isStaff ? <MyAgenda /> : <Dashboard />;
}
