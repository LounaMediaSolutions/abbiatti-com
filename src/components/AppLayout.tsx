import { ReactNode, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Home,
  Users,
  Settings,
  LogOut,
  HelpCircle,
  Sparkles,
  BookOpen,
  AlertTriangle,
  Building2,
  ShieldCheck,
  UserCog,
  Briefcase,
  ListTodo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NotificationBell } from "@/components/NotificationBell";
import { InvitationBanner } from "@/components/InvitationBanner";
import { EscaparLogo } from "@/components/EscaparLogo";
import { cn } from "@/lib/utils";
import { getUserAccess } from "@/lib/access";
import { toHslChannels } from "@/lib/brandColor";
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
      setIsCohost(null);
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
      // brand_color may be stored as a hex string ("#1e40af") or as HSL
      // channels ("205 55% 28%"). The token is consumed as hsl(var(--primary)),
      // so a raw hex produces invalid CSS and primary buttons render white.
      // Normalize to HSL channels (or fall back to the default theme color).
      const primaryHsl = toHslChannels(org?.brand_color);
      if (primaryHsl) {
        document.documentElement.style.setProperty("--primary", primaryHsl);
      } else {
        document.documentElement.style.removeProperty("--primary");
      }
    })();
  }, [user?.id]);

  const managerDashboardPath =
    dashboardPath === "/super-admin" ? "/super-admin" : "/admin/dashboard";

  // Properties sits directly after each role's home/top item in every sidebar.
  const managerNav = [
    {
      to: managerDashboardPath,
      icon: LayoutDashboard,
      label: t("nav.dashboard"),
      end: true,
    },
    { to: "/properties", icon: Home, label: t("nav.properties") },
    // Org-scoped people management for admins. Availability, Reservations,
    // Tasks, Reports and per-property team management still live inside each
    // property's detail page (tabs).
    { to: "/admin/cohosts", icon: UserCog, label: t("nav.cohosts") },
    { to: "/admin/employees", icon: Briefcase, label: t("nav.employees") },
    { to: "/settings", icon: Settings, label: t("nav.settings") },
  ];

  const superAdminNav = [
    { to: "/super-admin", icon: Building2, label: t("nav.organizations"), end: true },
    { to: "/properties", icon: Home, label: t("nav.properties") },
    { to: "/super-admin/admins", icon: ShieldCheck, label: t("nav.admins") },
    { to: "/super-admin/cohosts", icon: UserCog, label: t("nav.cohosts") },
    { to: "/super-admin/employees", icon: Briefcase, label: t("nav.employees") },
    { to: "/super-admin/profiles", icon: Users, label: t("nav.profiles") },
    { to: "/settings", icon: Settings, label: t("nav.settings") },
  ];

  const cohostNav = [
    {
      to: "/cohost/dashboard",
      icon: LayoutDashboard,
      label: t("nav.dashboard"),
      end: true,
    },
    // Availability, Reservations, Tasks and team management now live inside
    // each property's detail page (tabs), so they are no longer top-level
    // nav items.
    { to: "/properties", icon: Home, label: t("nav.properties") },
    { to: "/cohost/employees", icon: Briefcase, label: t("nav.employees") },
    { to: "/rentals", icon: Sparkles, label: t("nav.rentals") },
    { to: "/guest-books", icon: BookOpen, label: t("nav.guestBooks", { defaultValue: "Guest books" }) },
    { to: "/tickets", icon: AlertTriangle, label: t("nav.tickets", { defaultValue: "Reports" }) },
  ];

  // Employees get a Properties + Tasks split: "Tasks" is the agenda of every
  // task assigned to them; "Properties" lets them open an assigned property and
  // work its tasks. Properties sits directly after the Tasks home item.
  const staffNav = [
    {
      to: "/employee",
      icon: ListTodo,
      label: t("nav.tasks"),
      end: true,
    },
    { to: "/properties", icon: Home, label: t("nav.properties") },
    { to: "/tickets", icon: AlertTriangle, label: t("nav.tickets", { defaultValue: "Reports" }) },
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
    // h-screen (not min-h-screen) so the outer container is exactly the
    // viewport height. That gives each scroll-aware child (the sidebar nav
    // and the main area) its own bounded box — without this, the entire
    // page scrolls as one unit and the sidebar disappears along with the
    // page content. md:overflow-hidden prevents body-level scroll on
    // desktop; on mobile the bottom nav is fixed and the right column
    // handles its own scroll, so we let the page flow naturally there.
    <div className="h-screen flex flex-col md:flex-row md:overflow-hidden bg-background">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground px-3 py-4 h-full">
        <div className="flex items-center justify-center px-2 py-3 shrink-0">
          {orgLogo ? (
            <img
              src={orgLogo}
              alt={t("app.name")}
              className="h-12 w-auto object-contain"
            />
          ) : (
            <EscaparLogo size="text-2xl" className="text-sidebar-foreground" />
          )}
        </div>
        {/* Gold hairline — a quiet luxury cue separating brand from nav. */}
        <div
          className="mx-2 mb-3 mt-1 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent"
          aria-hidden="true"
        />
        <nav className="flex-1 space-y-1 overflow-y-auto min-h-0 px-0.5 pt-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Gold active rail */}
                  <span
                    className={cn(
                      "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-gold transition-opacity duration-200",
                      isActive ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden="true"
                  />
                  <item.icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
                      isActive
                        ? "text-gold"
                        : "text-sidebar-foreground/55 group-hover:text-sidebar-foreground/90",
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2.5 pt-4 mt-2 border-t border-sidebar-border/70 shrink-0 px-0.5">
          {orgName ? (
            <div
              className="flex items-center gap-2.5 rounded-xl bg-sidebar-accent/40 px-2.5 py-2 ring-1 ring-inset ring-sidebar-border/70"
              title={`${t("app.organization", { defaultValue: "Organisation" })} : ${orgName}`}
              data-testid="sidebar-org-name"
            >
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar/60 text-gold ring-1 ring-inset ring-sidebar-border/70">
                <Building2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-sidebar-foreground">
                  {orgName}
                </p>
                <p className="truncate text-[11px] text-sidebar-foreground/55">
                  {user?.email}
                </p>
              </div>
            </div>
          ) : (
            <div className="px-3 text-xs text-sidebar-foreground/60 truncate">
              {user?.email}
            </div>
          )}
          <Button
            variant="ghost"
            className="w-full justify-start rounded-xl text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            {t("auth.logout")}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 md:h-full md:overflow-hidden">
        <header className="flex items-center justify-between px-4 md:px-6 h-14 border-b bg-card shrink-0">
          <div className="md:hidden flex items-center">
            {orgLogo ? (
              <img
                src={orgLogo}
                alt={t("app.name")}
                className="h-8 w-auto object-contain"
              />
            ) : (
              <EscaparLogo size="text-lg" className="text-foreground" />
            )}
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
                    "relative flex flex-col items-center justify-center gap-1 py-2.5 px-4 text-[10px] min-w-[72px] transition-colors duration-200",
                    isActive
                      ? "text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground/90",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Gold active indicator at the top edge */}
                    <span
                      className={cn(
                        "absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-gradient-gold transition-opacity duration-200",
                        isActive ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden="true"
                    />
                    <item.icon
                      className={cn(
                        "h-5 w-5 transition-colors duration-200",
                        isActive ? "text-gold" : "",
                      )}
                    />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
};
