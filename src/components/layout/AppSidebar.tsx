import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ClipboardList, Truck, Trophy, Users,
  DollarSign, Package, Settings, LogOut, Loader2, AlertCircle,
  GraduationCap, Plus
} from "lucide-react";
import capybaraHero from "@/assets/capybara-hero.png";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarFooter, useSidebar
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSidebarBadges } from "@/hooks/useSidebarBadges";

// ── Module definitions ─────────────────────────────────────────────────
interface NavModule {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  url: string;
  roles: string[];
  badgePaths?: string[];
}

const modules: NavModule[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    icon: LayoutDashboard,
    url: "/",
    roles: ["admin", "manager", "salesperson", "runner", "driver"],
  },
  {
    id: "orders",
    title: "Orders",
    icon: ClipboardList,
    url: "/sales/booking",
    roles: ["admin", "manager", "salesperson"],
    badgePaths: ["/sales/action-required"],
  },
  {
    id: "dispatch",
    title: "Dispatch",
    icon: Truck,
    url: "/runner/inbox",
    roles: ["runner"],
    badgePaths: ["/runner/inbox"],
  },
  {
    id: "dispatch-driver",
    title: "Deliveries",
    icon: Truck,
    url: "/driver/inbox",
    roles: ["driver"],
  },
  {
    id: "dispatch-admin",
    title: "Dispatch",
    icon: Truck,
    url: "/admin/runner-inbox",
    roles: ["admin"],
  },
  {
    id: "performance",
    title: "Performance",
    icon: Trophy,
    url: "/leaderboard",
    roles: ["admin", "manager", "salesperson"],
  },
  {
    id: "performance-runner",
    title: "Performance",
    icon: Trophy,
    url: "/runner/driver-ranking",
    roles: ["runner"],
  },
  {
    id: "performance-driver",
    title: "Performance",
    icon: Trophy,
    url: "/driver/ranking",
    roles: ["driver"],
  },
  {
    id: "team",
    title: "Team",
    icon: Users,
    url: "/manager/oversight",
    roles: ["admin", "manager"],
  },
  {
    id: "team-runner",
    title: "Team",
    icon: Users,
    url: "/runner/drivers",
    roles: ["runner"],
  },
  {
    id: "finance",
    title: "Finance",
    icon: DollarSign,
    url: "/admin/overview",
    roles: ["admin"],
  },
  {
    id: "finance-runner",
    title: "Finance",
    icon: DollarSign,
    url: "/runner/claims",
    roles: ["runner"],
  },
  {
    id: "inventory",
    title: "Inventory",
    icon: Package,
    url: "/inventory",
    roles: ["admin", "manager", "salesperson", "runner"],
  },
  {
    id: "system",
    title: "System",
    icon: Settings,
    url: "/settings/profile",
    roles: ["admin", "manager", "salesperson", "runner", "driver"],
  },
];

const secondaryModules: NavModule[] = [
  {
    id: "guide",
    title: "Help",
    icon: GraduationCap,
    url: "/guide",
    roles: ["admin", "manager", "salesperson", "runner", "driver"],
  },
];

// ── Route matching helpers ─────────────────────────────────────────────
const moduleRoutePrefixes: Record<string, string[]> = {
  dashboard: ["/"],
  orders: ["/sales/", "/runner/delivered-orders"],
  dispatch: ["/runner/inbox", "/runner/inbound", "/runner/driver-inbox", "/runner/failed-orders"],
  "dispatch-driver": ["/driver/"],
  "dispatch-admin": ["/admin/runner-inbox"],
  performance: ["/leaderboard", "/manager/ranking-board", "/manager/impact-board"],
  "performance-runner": ["/runner/driver-ranking"],
  "performance-driver": ["/driver/ranking", "/driver/analytics"],
  team: ["/manager/", "/settings/users", "/disputes"],
  "team-runner": ["/runner/drivers", "/runner/driver-locations"],
  finance: ["/admin/overview", "/reconciliation/", "/admin/claim-batches", "/admin/delivery-charges", "/admin/delivery-fees"],
  "finance-runner": ["/runner/claims", "/runner/cash-", "/runner/delivery-charges", "/runner/allocated-stock", "/runner/driver-pickups", "/runner/driver-returns"],
  inventory: ["/inventory", "/inbound/", "/products", "/admin/warehouses"],
  system: ["/settings/", "/admin/stock-", "/admin/events", "/admin/invite-codes", "/admin/data-sharing", "/admin/leaderboard-settings", "/events"],
  guide: ["/guide"],
};

function isModuleActive(moduleId: string, pathname: string): boolean {
  const prefixes = moduleRoutePrefixes[moduleId] || [];
  if (moduleId === "dashboard") return pathname === "/";
  return prefixes.some(p => pathname.startsWith(p));
}

// ── Badge pill ─────────────────────────────────────────────────────────
function BadgeDot({ count, urgent }: { count: number; urgent?: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold leading-none",
        urgent
          ? "bg-destructive text-destructive-foreground"
          : "bg-primary/12 text-primary"
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

// ── Quick actions by role ──────────────────────────────────────────────
function getQuickAction(role: string | undefined) {
  if (role === "admin" || role === "salesperson" || role === "manager") {
    return { label: "New Order", icon: Plus, url: "/sales/booking" };
  }
  if (role === "runner") {
    return { label: "New Claim", icon: Plus, url: "/runner/claims" };
  }
  return null;
}

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  manager: "Manager",
  salesperson: "Salesperson",
  runner: "Runner",
  driver: "Driver",
};

// ── Main sidebar component ─────────────────────────────────────────────
export function AppSidebar() {
  const { profile, signOut, signingOut, profileStatus, retryProfile, resetSession } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();

  const userRole = profile?.role;
  const isProfileReady = profileStatus === "ready" && !!userRole;
  const isProfileLoading = profileStatus === "loading" || profileStatus === "idle";
  const isProfileError = profileStatus === "error" || profileStatus === "missing";

  const badges = useSidebarBadges();

  const visibleModules = useMemo(() => {
    if (!userRole) return [];
    return modules.filter(m => m.roles.includes(userRole));
  }, [userRole]);

  const visibleSecondary = useMemo(() => {
    if (!userRole) return [];
    return secondaryModules.filter(m => m.roles.includes(userRole));
  }, [userRole]);

  const quickAction = getQuickAction(userRole);

  // ── Loading state ────────────────────────────────────────────────────
  if (isProfileLoading) {
    return (
      <Sidebar className={cn("border-r border-border/40", collapsed ? "w-[60px]" : "w-[240px]")}>
        <SidebarHeader className="p-4 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <img src={capybaraHero} alt="TOMUPRO" className="h-8 w-8 object-contain" />
            {!collapsed && (
              <div className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading…</span>
              </div>
            )}
          </div>
        </SidebarHeader>
        <SidebarContent className="px-3 py-4 space-y-2">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </SidebarContent>
      </Sidebar>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────
  if (isProfileError || !userRole) {
    return (
      <Sidebar className={cn("border-r border-border/40", collapsed ? "w-[60px]" : "w-[240px]")}>
        <SidebarHeader className="p-4 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <img src={capybaraHero} alt="TOMUPRO" className="h-8 w-8 object-contain" />
            {!collapsed && (
              <div className="flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                <span className="text-sm text-destructive">Error</span>
              </div>
            )}
          </div>
        </SidebarHeader>
        <SidebarContent className="px-4 py-6 flex flex-col items-center gap-3">
          {!collapsed && (
            <>
              <p className="text-sm text-muted-foreground text-center">Could not load profile.</p>
              <Button onClick={retryProfile} size="sm" className="w-full">Retry</Button>
            </>
          )}
        </SidebarContent>
        <SidebarFooter className="p-3 border-t border-border/40">
          <Button variant="ghost" size={collapsed ? "icon" : "default"} onClick={resetSession} className="w-full gap-2 text-destructive hover:bg-destructive/8">
            <LogOut className="h-4 w-4" />
            {!collapsed && "Sign Out"}
          </Button>
        </SidebarFooter>
      </Sidebar>
    );
  }

  // ── Render nav item ──────────────────────────────────────────────────
  const renderItem = (mod: NavModule) => {
    const active = isModuleActive(mod.id, location.pathname);
    const badgeCount = (mod.badgePaths || []).reduce((sum, p) => sum + (badges[p] || 0), 0);
    const isUrgent = mod.id === "dispatch" || mod.id === "orders";

    if (collapsed) {
      return (
        <TooltipProvider key={mod.id} delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <NavLink
                to={mod.url}
                end={mod.url === "/"}
                className={cn(
                  "relative flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-all duration-150",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
                activeClassName=""
              >
                <mod.icon className="h-[18px] w-[18px]" />
                {badgeCount > 0 && (
                  <span className={cn(
                    "absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full text-[8px] font-bold flex items-center justify-center",
                    isUrgent ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
                  )}>
                    {badgeCount > 9 ? "9+" : badgeCount}
                  </span>
                )}
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs font-medium">
              {mod.title}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <NavLink
        key={mod.id}
        to={mod.url}
        end={mod.url === "/"}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        )}
        activeClassName=""
      >
        <mod.icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-primary")} />
        <span className="flex-1 truncate">{mod.title}</span>
        <BadgeDot count={badgeCount} urgent={isUrgent} />
      </NavLink>
    );
  };

  // ── Main render ──────────────────────────────────────────────────────
  return (
    <Sidebar className={cn("border-r border-border/40 bg-sidebar", collapsed ? "w-[60px]" : "w-[240px]")}>
      {/* Brand */}
      <SidebarHeader className="px-4 py-4 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <img src={capybaraHero} alt="TOMUPRO" className="h-8 w-8 object-contain" />
          {!collapsed && (
            <div>
              <h2 className="font-bold text-base tracking-tight leading-none">
                TOMU<span className="text-primary">PRO</span>
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--status-success))]" />
                {roleLabels[userRole] || userRole}
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className={cn("py-3 overflow-y-auto", collapsed ? "px-1.5" : "px-2.5")}>
        {/* Quick action */}
        {!collapsed && quickAction && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(quickAction.url)}
            className="w-full gap-2 mb-3 h-8 text-xs font-medium rounded-lg border-dashed border-border/60 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
          >
            <quickAction.icon className="h-3.5 w-3.5" />
            {quickAction.label}
          </Button>
        )}

        {/* Main modules */}
        <nav className="space-y-0.5">
          {visibleModules.map(mod => renderItem(mod))}
        </nav>

        {/* Separator + secondary */}
        {visibleSecondary.length > 0 && (
          <>
            <div className={cn("my-3 border-t border-border/30", collapsed ? "mx-1" : "mx-2")} />
            <nav className="space-y-0.5">
              {visibleSecondary.map(mod => renderItem(mod))}
            </nav>
          </>
        )}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="p-3 border-t border-border/40">
        {/* User card */}
        {!collapsed && (
          <div className="flex items-center gap-2.5 mb-3 px-1">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary">
                {profile?.display_name?.charAt(0).toUpperCase() || "U"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate leading-tight">{profile?.display_name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{profile?.email}</p>
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          onClick={signOut}
          disabled={signingOut}
          className="w-full gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/8 rounded-lg h-9 text-sm"
        >
          {signingOut ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          {!collapsed && (signingOut ? "Signing out…" : "Sign Out")}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
