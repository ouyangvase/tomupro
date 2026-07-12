import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ClipboardList, Truck, Trophy, Users, DollarSign,
  Package, Settings, LogOut, Loader2, AlertCircle, GraduationCap, Send
} from "lucide-react";
import { AppLogo } from "@/components/brand/AppLogo";
import { AppName } from "@/components/brand/AppName";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import capybaraMascot from "@/assets/capybara-order-assistant.png";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarFooter, useSidebar
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSidebarBadges } from "@/hooks/useSidebarBadges";
import { useLeaderboardSettings } from "@/hooks/useLeaderboard";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}

const navItems: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["admin", "manager", "salesperson", "runner", "driver", "runner_assistant"] },
  { title: "Orders", url: "/orders", icon: ClipboardList, roles: ["admin", "manager", "salesperson"] },
  { title: "Dispatch", url: "/dispatch", icon: Truck, roles: ["admin", "runner", "runner_assistant"] },
  { title: "Delivery", url: "/delivery", icon: Truck, roles: ["driver"] },
  { title: "Performance", url: "/performance", icon: Trophy, roles: ["admin", "manager", "salesperson", "runner", "driver"] },
  { title: "Team", url: "/team", icon: Users, roles: ["admin", "manager"] },
  { title: "Finance", url: "/finance", icon: DollarSign, roles: ["admin", "runner", "finance_viewer"] },
  { title: "Inventory", url: "/inventory", icon: Package, roles: ["admin", "manager", "salesperson", "runner"] },
  { title: "System", url: "/system", icon: Settings, roles: ["admin"] },
  { title: "Guide", url: "/guide", icon: GraduationCap, roles: ["admin", "manager", "salesperson", "runner", "driver", "runner_assistant"] },
];

function BadgePill({ count, urgent }: { count: number; urgent?: boolean }) {
  if (count <= 0) return null;
  return (
    <span className={cn(
      "ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none",
      urgent ? "bg-destructive text-destructive-foreground" : "bg-primary/15 text-primary"
    )}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

// Map old badge paths to new module paths
const badgeMapping: Record<string, string> = {
  "/sales/action-required": "/orders",
  "/runner/inbox": "/dispatch",
  "/admin/claim-batches": "/finance",
};

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  manager: "Manager",
  salesperson: "Salesperson",
  runner: "Runner",
  runner_assistant: "Runner Assistant",
  driver: "Driver",
  finance_viewer: "Finance Viewer",
};

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

  const rawBadges = useSidebarBadges();
  const { data: leaderboardSettings } = useLeaderboardSettings();
  const hidePerformanceUI = !!(leaderboardSettings?.filters_default as any)?.hide_performance_ui;

  // Remap badges to new module paths
  const badges = useMemo(() => {
    const mapped: Record<string, number> = {};
    for (const [path, count] of Object.entries(rawBadges)) {
      const newPath = badgeMapping[path] || path;
      mapped[newPath] = (mapped[newPath] || 0) + count;
    }
    return mapped;
  }, [rawBadges]);

  const visibleItems = useMemo(() => {
    if (!userRole) return [];
    return navItems.filter(item => {
      if (!item.roles.includes(userRole)) return false;
      // Hide Performance tab for non-admin roles when hide_performance_ui is enabled
      if (item.url === '/performance' && hidePerformanceUI && userRole !== 'admin') return false;
      return true;
    });
  }, [userRole, hidePerformanceUI]);

  const isActive = (url: string) => {
    if (url === "/") return location.pathname === "/";
    return location.pathname.startsWith(url);
  };

  // Loading state
  if (isProfileLoading) {
    return (
      <Sidebar className={cn("liquid-glass rounded-none border-r border-white/10 bg-transparent", collapsed ? "w-16 md:w-20" : "w-56 md:w-60")}>
        <SidebarHeader className="p-4 border-b border-border/30">
          <div className="flex items-center gap-3">
            <AppLogo size="sm" />
            {!collapsed && (
              <div>
                <h2 className="font-extrabold text-base tracking-tight"><AppName highlight /></h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <p className="text-[11px] text-muted-foreground">Loading...</p>
                </div>
              </div>
            )}
          </div>
        </SidebarHeader>
        <SidebarContent className="px-3 py-4 space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </SidebarContent>
      </Sidebar>
    );
  }

  // Error state
  if (isProfileError || !userRole) {
    return (
      <Sidebar className={cn("liquid-glass rounded-none border-r border-white/10 bg-transparent", collapsed ? "w-16 md:w-20" : "w-56 md:w-60")}>
        <SidebarHeader className="p-4 border-b border-border/30">
          <div className="flex items-center gap-3">
            <AppLogo size="sm" />
            {!collapsed && (
              <div>
                <h2 className="font-extrabold text-base tracking-tight"><AppName highlight /></h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <AlertCircle className="h-3 w-3 text-destructive" />
                  <p className="text-[11px] text-destructive">Profile Error</p>
                </div>
              </div>
            )}
          </div>
        </SidebarHeader>
        <SidebarContent className="px-4 py-6 flex flex-col items-center justify-center gap-4">
          {!collapsed && (
            <>
              <p className="text-sm text-muted-foreground text-center">Could not load your profile.</p>
              <Button onClick={retryProfile} size="sm" className="w-full gap-2">
                <Loader2 className="h-3 w-3" /> Retry
              </Button>
            </>
          )}
        </SidebarContent>
        <SidebarFooter className="p-3 border-t border-border/30">
          <Button variant="outline" size={collapsed ? "icon" : "default"} onClick={resetSession} className="w-full gap-2 border-border/50 hover:bg-destructive/10 hover:text-destructive">
            <LogOut className="h-4 w-4" />
            {!collapsed && "Sign Out"}
          </Button>
        </SidebarFooter>
      </Sidebar>
    );
  }

  return (
    <Sidebar className={cn("liquid-glass rounded-none border-r border-white/10 bg-transparent", collapsed ? "w-16 md:w-20" : "w-56 md:w-60")}>
      {/* Brand */}
      <SidebarHeader className="p-4 border-b border-border/30">
        <div className="flex items-center gap-3">
          <AppLogo size="sm" className="drop-shadow-md" />
          {!collapsed && (
            <div>
              <h2 className="font-extrabold text-base tracking-tight">
                <AppName highlight />
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--status-success))] animate-pulse" />
                <p className="text-[11px] text-muted-foreground font-medium">
                  {roleLabels[userRole] || userRole}
                </p>
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>

      {/* Nav items */}
      <SidebarContent className="px-2 py-3 space-y-0.5 overflow-y-auto">
        {visibleItems.map(item => {
          const active = isActive(item.url);
          const badgeCount = badges[item.url] || 0;
          const urgent = item.url === "/orders" || item.url === "/dispatch";

          if (collapsed) {
            return (
              <TooltipProvider key={item.url} delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <NavLink
                      to={item.url}
                      className={cn(
                        "relative flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-all duration-150",
                        active
                          ? "bg-primary/15 text-primary shadow-[0_0_24px_rgba(111,255,0,0.10)]"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                      )}
                    >
                      <item.icon className="h-[18px] w-[18px]" />
                      {badgeCount > 0 && (
                        <span className={cn(
                          "absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full text-[8px] font-bold flex items-center justify-center",
                          urgent ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
                        )}>
                          {badgeCount > 9 ? "9+" : badgeCount}
                        </span>
                      )}
                    </NavLink>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">{item.title}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          }

          return (
            <NavLink
              key={item.url}
              to={item.url}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                active
                  ? "bg-primary/15 text-primary shadow-[0_0_24px_rgba(111,255,0,0.10)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1 truncate">{item.title}</span>
              <BadgePill count={badgeCount} urgent={urgent && badgeCount > 0} />
            </NavLink>
          );
        })}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="p-3 border-t border-border/30">
        {/* User Card */}
        {!collapsed && (
          <div className="flex items-center gap-3 mb-3 p-2.5 rounded-2xl bg-white/[0.04] border border-white/10">
            <div className="relative shrink-0">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#C99D4E] to-[#A67C3D] flex items-center justify-center shadow-sm">
                <span className="text-xs font-bold text-white">
                  {profile?.display_name?.charAt(0).toUpperCase() || "U"}
                </span>
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[hsl(var(--status-success))] rounded-full border-2 border-sidebar" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{profile?.display_name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{profile?.email}</p>
            </div>
          </div>
        )}

        {/* Telegram Premium Card */}
        {!collapsed && (
          <div className="relative mb-2.5 group/tg">
            {/* Capybara mascot peeking over card */}
            <img
              src={capybaraMascot}
              alt=""
              className="absolute -top-8 right-3 h-11 w-11 object-contain pointer-events-none z-10 drop-shadow-md transition-transform duration-300 group-hover/tg:-translate-y-0.5"
            />
            <NavLink
              to="/settings/telegram"
              className={({ isActive }) => cn(
                "relative flex items-center gap-3 px-3 py-3 rounded-[18px] transition-all duration-200 overflow-hidden border",
                "bg-white/[0.04] hover:bg-white/[0.07]",
                "border-white/10",
                "shadow-[0_2px_16px_rgba(0,0,0,0.18)] hover:shadow-[0_8px_28px_rgba(111,255,0,0.08)]",
                "active:scale-[0.98]",
                isActive && "ring-1 ring-[#C99D4E]/30 shadow-[0_4px_16px_rgba(201,157,78,0.15)]"
              )}
            >
              {/* Telegram icon badge */}
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shadow-[0_1px_4px_rgba(0,0,0,0.2)] shrink-0 transition-shadow duration-200 group-hover/tg:shadow-[0_2px_8px_rgba(111,255,0,0.15)]">
                <Send className="h-[18px] w-[18px] text-primary" />
              </div>
              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-foreground leading-tight">
                  Telegram Settings
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  Manage notifications
                </p>
              </div>
            </NavLink>
          </div>
        )}

        {/* Collapsed Telegram button */}
        {collapsed && (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <NavLink
                  to="/settings/telegram"
                  className={({ isActive }) => cn(
                    "relative flex items-center justify-center w-10 h-10 mx-auto rounded-xl transition-all duration-200 mb-2 group/tgc",
                    "bg-white/[0.04] hover:bg-white/[0.07]",
                    "border border-white/10",
                    "shadow-[0_1px_4px_rgba(0,0,0,0.18)] hover:shadow-[0_2px_8px_rgba(111,255,0,0.15)]",
                    "active:scale-95",
                    isActive && "ring-1 ring-[#C99D4E]/30"
                  )}
                >
                  <img
                    src={capybaraMascot}
                    alt=""
                    className="absolute -top-5 -right-1.5 h-7 w-7 object-contain pointer-events-none opacity-90 group-hover/tgc:opacity-100 transition-all duration-200 group-hover/tgc:-translate-y-0.5"
                  />
                  <Send className="h-4 w-4 text-primary" />
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">Telegram Settings</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Sign Out */}
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          onClick={signOut}
          disabled={signingOut}
          className={cn(
            "w-full gap-2 rounded-2xl text-sm font-medium transition-all duration-200",
            collapsed
              ? "h-10 w-10 mx-auto"
              : "h-9 bg-white/[0.04] border border-white/10 hover:bg-white/[0.07] hover:border-primary/30 text-muted-foreground hover:text-foreground shadow-none"
          )}
        >
          {signingOut ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          {!collapsed && (signingOut ? "Signing out..." : "Sign Out")}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
