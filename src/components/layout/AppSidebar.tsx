import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ClipboardList, Truck, Trophy, Users, DollarSign,
  Package, Settings, LogOut, Loader2, AlertCircle, GraduationCap
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

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}

const navItems: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["admin", "manager", "salesperson", "runner", "driver"] },
  { title: "Orders", url: "/orders", icon: ClipboardList, roles: ["admin", "manager", "salesperson"] },
  { title: "Dispatch", url: "/dispatch", icon: Truck, roles: ["admin", "runner"] },
  { title: "Delivery", url: "/delivery", icon: Truck, roles: ["driver"] },
  { title: "Performance", url: "/performance", icon: Trophy, roles: ["admin", "manager", "salesperson", "runner", "driver"] },
  { title: "Team", url: "/team", icon: Users, roles: ["admin", "manager"] },
  { title: "Finance", url: "/finance", icon: DollarSign, roles: ["admin", "runner"] },
  { title: "Inventory", url: "/inventory", icon: Package, roles: ["admin", "manager", "salesperson", "runner"] },
  { title: "System", url: "/system", icon: Settings, roles: ["admin"] },
  { title: "Guide", url: "/guide", icon: GraduationCap, roles: ["admin", "manager", "salesperson", "runner", "driver"] },
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
  driver: "Driver",
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
    return navItems.filter(item => item.roles.includes(userRole));
  }, [userRole]);

  const isActive = (url: string) => {
    if (url === "/") return location.pathname === "/";
    return location.pathname.startsWith(url);
  };

  // Loading state
  if (isProfileLoading) {
    return (
      <Sidebar className={cn("border-r border-border/30 bg-sidebar", collapsed ? "w-16 md:w-20" : "w-56 md:w-60")}>
        <SidebarHeader className="p-4 border-b border-border/30">
          <div className="flex items-center gap-3">
            <img src={capybaraHero} alt="TOMUPRO" className="h-9 w-9 object-contain" />
            {!collapsed && (
              <div>
                <h2 className="font-extrabold text-base tracking-tight">TOMU<span className="text-primary">PRO</span></h2>
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
      <Sidebar className={cn("border-r border-border/30 bg-sidebar", collapsed ? "w-16 md:w-20" : "w-56 md:w-60")}>
        <SidebarHeader className="p-4 border-b border-border/30">
          <div className="flex items-center gap-3">
            <img src={capybaraHero} alt="TOMUPRO" className="h-9 w-9 object-contain" />
            {!collapsed && (
              <div>
                <h2 className="font-extrabold text-base tracking-tight">TOMU<span className="text-primary">PRO</span></h2>
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
    <Sidebar className={cn("border-r border-border/30 bg-sidebar", collapsed ? "w-16 md:w-20" : "w-56 md:w-60")}>
      {/* Brand */}
      <SidebarHeader className="p-4 border-b border-border/30">
        <div className="flex items-center gap-3">
          <img src={capybaraHero} alt="TOMUPRO" className="h-9 w-9 object-contain drop-shadow-md" />
          {!collapsed && (
            <div>
              <h2 className="font-extrabold text-base tracking-tight">
                TOMU<span className="text-primary">PRO</span>
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
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
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
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
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
        {!collapsed && (
          <div className="flex items-center gap-3 mb-3 p-2.5 rounded-lg bg-secondary/40 border border-border/30">
            <div className="relative">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                <span className="text-xs font-bold text-primary-foreground">
                  {profile?.display_name?.charAt(0).toUpperCase() || "U"}
                </span>
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-[hsl(var(--status-success))] rounded-full border-2 border-sidebar" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{profile?.display_name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{profile?.email}</p>
            </div>
          </div>
        )}

        <Button
          variant="outline"
          size={collapsed ? "icon" : "default"}
          onClick={signOut}
          disabled={signingOut}
          className="w-full gap-2 border-border/40 hover:bg-destructive/8 hover:text-destructive hover:border-destructive/25 rounded-lg text-sm"
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
