import { ReactNode, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Home,
  Users,
  CalendarDays,
  Settings,
  LogOut,
  HelpCircle,
  Sparkles,
  BookOpen,
  AlertTriangle,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NotificationBell } from "@/components/NotificationBell";
import { InvitationBanner } from "@/components/InvitationBanner";
import { cn } from "@/lib/utils";
import { getUserAccess } from "@/lib/access";
import logo from "@/assets/abbiatti-logo.png";
import i18n from "@/i18n";

export const AppLayout = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const { signOut, user, loading } = useAuth();
  const navigate = useNavigate();
  const [isStaff, setIsStaff] = useState<boolean | null>(null);
  const [isCohost, setIsCohost] = useState<boolean | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [dashboardPath, setDashboardPath] = useState<string | null>(null);
  const [orgLogo, setOrgLogo] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setIsStaff(null);
      setIsSuperAdmin(null);
      setDashboardPath(null);
      setOrgLogo(null);
      setOrgName(null);
      return;
    }

    setIsStaff(null);
    setIsSuperAdmin(null);
    getUserAccess(user.id).then(
      ({ isStaff, isCohost, isSuperAdmin, dashboardPath }) => {
        setIsStaff(isStaff);
        setIsCohost(isCohost);
        setIsSuperAdmin(isSuperAdmin);
        setDashboardPath(dashboardPath);
      },
    );

    // Load org branding (logo + brand color) and detect guest role
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, org_id, language")
        .eq("id", user.id)
        .maybeSingle();
      
      if (profile?.role === "guest") {
        navigate("/guest", { replace: true });
        return;
      }

      if (profile?.language && profile.language !== i18n.language) {
        await i18n.changeLanguage(profile.language);
      }

      if (!profile?.org_id) {
        setOrgName(null);
        return;
      }
      const { data: org } = await supabase
        .from("organizations")
        .select("name, logo_url, brand_color")
        .eq("id", profile.org_id)
        .maybeSingle();
      setOrgLogo(org?.logo_url ?? null);
      setOrgName(org?.name ?? null);
      if (org?.brand_color) {
        document.documentElement.style.setProperty(
          "--primary",
          org.brand_color,
        );
      } else {
        document.documentElement.style.removeProperty("--primary");
      }
    })();
  }, [user?.id]);

  const managerDashboardPath =
    dashboardPath === "/super-admin" ? "/super-admin" : "/admin/dashboard";

  const managerNav = [
    {
      to: managerDashboardPath,
      icon: LayoutDashboard,
      label: t("nav.dashboard"),
      end: true,
    },
    // Availability, Reservations, Tasks and Reports now live inside each
    // property's detail page (tabs), so they are no longer top-level nav items.
    { to: "/properties", icon: Home, label: t("nav.properties") },
    { to: "/team", icon: Users, label: t("nav.team") },
    { to: "/settings", icon: Settings, label: t("nav.settings") },
  ];

  const superAdminNav = [
    { to: "/super-admin", icon: Building2, label: t("nav.organizations"), end: true },
    { to: "/super-admin/profiles", icon: Users, label: t("nav.profiles") },
    ...managerNav.slice(1).filter((item) => item.to !== "/team"),
  ];

  const cohostNav = [
    {
      to: "/cohost/dashboard",
      icon: LayoutDashboard,
      label: t("nav.dashboard"),
      end: true,
    },
    // Availability, Reservations and Tasks now live inside each property's
    // detail page (tabs), so they are no longer top-level nav items.
    { to: "/properties", icon: Home, label: t("nav.properties") },
    { to: "/team", icon: Users, label: t("nav.team") },
    { to: "/rentals", icon: Sparkles, label: t("nav.rentals") },
    { to: "/guest-books", icon: BookOpen, label: "Livrets" },
    { to: "/tickets", icon: AlertTriangle, label: "Signalements" },
  ];

  const staffNav = [
    {
      to: "/employee",
      icon: CalendarDays,
      label: t("agenda.title"),
      end: true,
    },
    { to: "/tickets", icon: AlertTriangle, label: "Signalements" },
    { to: "/help", icon: HelpCircle, label: t("nav.help") },
    { to: "/settings", icon: Settings, label: t("nav.settings") },
  ];

  const navItems = isStaff
    ? staffNav
    : isCohost
      ? cohostNav
      : isSuperAdmin
        ? superAdminNav
        : managerNav;

  const handleLogout = async () => {
    await signOut();
    navigate("/welcome");
  };

  if (loading || (user && (isStaff === null || isSuperAdmin === null))) {
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
          <img
            src={orgLogo || logo}
            alt={t("app.name")}
            className="h-12 w-auto object-contain"
          />
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
                    : "hover:bg-sidebar-accent",
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 pt-4 border-t border-sidebar-border">
          {orgName && (
            <div
              className="px-3 text-[11px] text-sidebar-foreground/80 truncate flex items-center gap-1.5"
              title={`${t("app.organization", { defaultValue: "Organisation" })} : ${orgName}`}
              data-testid="sidebar-org-name"
            >
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{orgName}</span>
            </div>
          )}
          <div className="px-3 text-xs text-sidebar-foreground/60 truncate">
            {user?.email}
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            {t("auth.logout")}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-4 md:px-6 h-14 border-b bg-card">
          <div className="md:hidden flex items-center">
            <img
              src={orgLogo || logo}
              alt={t("app.name")}
              className="h-8 w-auto object-contain"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {orgName && (
              <div
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-xs font-medium text-foreground/80 max-w-[200px]"
                title={`${t("app.organization", { defaultValue: "Organisation" })} : ${orgName}`}
                data-testid="header-org-pill"
              >
                <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{orgName}</span>
              </div>
            )}
            <LanguageSwitcher />
            <NotificationBell />
            <NavLink
              to="/help"
              aria-label={t("nav.help")}
              className={({ isActive }) =>
                cn(
                  "inline-flex items-center justify-center h-9 w-9 rounded-md transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent hover:text-accent-foreground",
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
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent hover:text-accent-foreground",
                )
              }
            >
              <Settings className="h-5 w-5" />
            </NavLink>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-auto pb-20 md:pb-6">
          <InvitationBanner />
          {children}
        </main>

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
                    isActive ? "text-primary" : "text-sidebar-foreground/70",
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
