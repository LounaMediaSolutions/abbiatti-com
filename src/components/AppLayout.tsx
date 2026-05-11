import { ReactNode, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, Home, Users, ListTodo, CalendarDays, Settings, LogOut, Package, HelpCircle, CalendarRange, Sparkles, BookOpen, AlertTriangle, Globe2, FileText, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";
import { getUserAccess } from "@/lib/access";
import logo from "@/assets/abbiatti-logo.png";

export const AppLayout = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const { signOut, user, loading } = useAuth();
  const navigate = useNavigate();
  const [isStaff, setIsStaff] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isCohost, setIsCohost] = useState<boolean | null>(null);
  const [orgLogo, setOrgLogo] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setIsStaff(null);
      setOrgLogo(null);
      return;
    }

    setIsStaff(null);
    getUserAccess(user.id).then(({ isStaff, isAdmin, isCohost }) => {
      setIsStaff(isStaff);
      setIsAdmin(isAdmin);
      setIsCohost(isCohost);
    });

    // Load org branding (logo + brand color) and detect guest role
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, org_id")
        .eq("id", user.id)
        .maybeSingle();
      
      if (profile?.role === "guest") {
        navigate("/guest", { replace: true });
        return;
      }

      if (!profile?.org_id) return;
      const { data: org } = await supabase
        .from("organizations")
        .select("logo_url, brand_color")
        .eq("id", profile.org_id)
        .maybeSingle();
      setOrgLogo(org?.logo_url ?? null);
      if (org?.brand_color) {
        document.documentElement.style.setProperty("--primary", org.brand_color);
      } else {
        document.documentElement.style.removeProperty("--primary");
      }
    })();
  }, [user?.id]);


  const managerNav = [
    { to: "/", icon: LayoutDashboard, label: t("nav.dashboard"), end: true },
    { to: "/properties", icon: Home, label: t("nav.properties") },
    { to: "/availability", icon: CalendarRange, label: t("nav.availability") },
    { to: "/reservations", icon: CalendarDays, label: t("nav.reservations") },
    { to: "/tasks", icon: ListTodo, label: t("nav.tasks") },
    { to: "/inventory", icon: Package, label: t("nav.inventory") },
    { to: "/rentals", icon: Sparkles, label: t("nav.rentals") },
    { to: "/guest-books", icon: BookOpen, label: "Livrets" },
    { to: "/tickets", icon: AlertTriangle, label: "Signalements" },
    { to: "/anomalies", icon: AlertTriangle, label: "Anomalies" },
    { to: "/showcase", icon: Globe2, label: "Vitrine" },
    { to: "/reports", icon: FileText, label: "Rapports" },
    { to: "/team", icon: Users, label: t("nav.team") },
    { to: "/invoices", icon: Receipt, label: "Factures" },
    { to: "/settings", icon: Settings, label: t("nav.settings") },
  ];

  const cohostNav = [
    { to: "/", icon: LayoutDashboard, label: t("nav.dashboard"), end: true },
    { to: "/properties", icon: Home, label: t("nav.properties") },
    { to: "/availability", icon: CalendarRange, label: t("nav.availability") },
    { to: "/reservations", icon: CalendarDays, label: t("nav.reservations") },
    { to: "/tasks", icon: ListTodo, label: t("nav.tasks") },
    { to: "/team", icon: Users, label: t("nav.team") },
    { to: "/rentals", icon: Sparkles, label: t("nav.rentals") },
    { to: "/guest-books", icon: BookOpen, label: "Livrets" },
    { to: "/tickets", icon: AlertTriangle, label: "Signalements" },
  ];

  const staffNav = [
    { to: "/", icon: CalendarDays, label: t("agenda.title"), end: true },
    { to: "/tickets", icon: AlertTriangle, label: "Signalements" },
    { to: "/help", icon: HelpCircle, label: t("nav.help") },
    { to: "/settings", icon: Settings, label: t("nav.settings") },
  ];

  const navItems = isStaff ? staffNav : (isCohost ? cohostNav : managerNav);

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  if (loading || (user && isStaff === null)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground p-4">
        <div className="flex items-center justify-center px-2 py-4 mb-2">
          <img src={orgLogo || logo} alt={t("app.name")} className="h-12 w-auto object-contain" />
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "hover:bg-sidebar-accent"
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 pt-4 border-t border-sidebar-border">
          <div className="px-3 text-xs text-sidebar-foreground/60 truncate">{user?.email}</div>
          <Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary-foreground" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            {t("auth.logout")}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-4 md:px-6 h-14 border-b bg-card">
          <div className="md:hidden flex items-center">
            <img src={orgLogo || logo} alt={t("app.name")} className="h-8 w-auto object-contain" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <NotificationBell />
            <NavLink
              to="/help"
              aria-label={t("nav.help")}
              className={({ isActive }) =>
                cn(
                  "inline-flex items-center justify-center h-9 w-9 rounded-md transition-colors",
                  isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"
                )
              }
            >
              <HelpCircle className="h-5 w-5" />
            </NavLink>
            <NavLink
              to="/settings"
              aria-label={t("nav.settings")}
              className={({ isActive }) =>
                cn(
                  "inline-flex items-center justify-center h-9 w-9 rounded-md transition-colors",
                  isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"
                )
              }
            >
              <Settings className="h-5 w-5" />
            </NavLink>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-auto pb-20 md:pb-6">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-sidebar text-sidebar-foreground border-t border-sidebar-border z-40 overflow-x-auto">
          <div className="flex min-w-max">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center justify-center gap-1 py-2 px-4 text-[10px] min-w-[72px]",
                    isActive ? "text-primary" : "text-sidebar-foreground/70"
                  )
                }
              >
                <item.icon className="h-5 w-5" />
                <span className="whitespace-nowrap">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
};
