import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ClipboardList, ShoppingCart, CheckCircle, X, AlertCircle,
  Inbox, Package, Truck, Users, MapPin, Navigation, Target, Trophy,
  Award, ClipboardCheck, BarChart3, AlertTriangle, Receipt, DollarSign,
  RotateCcw, Layers, PackageCheck, Wrench, History, Ticket, Share2,
  Settings, FileText, LogOut, Loader2, ChevronDown, Star, Plus,
  Database, ShieldCheck, WarehouseIcon
} from "lucide-react";
import { Warehouse as WarehouseIconLucide } from "lucide-react";
import capybaraHero from "@/assets/capybara-hero.png";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarFooter, useSidebar
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSidebarBadges } from "@/hooks/useSidebarBadges";

// ── Types ──────────────────────────────────────────────────────────────
interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}

interface NavSection {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  alwaysOpen?: boolean;
}

// ── Section definitions ────────────────────────────────────────────────
const sections: NavSection[] = [
  {
    id: "home",
    label: "Home",
    icon: LayoutDashboard,
    alwaysOpen: true,
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["admin", "manager", "salesperson", "runner", "driver"] },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: ShoppingCart,
    items: [
      { title: "Booking Sales", url: "/sales/booking", icon: ClipboardList, roles: ["admin", "manager", "salesperson"] },
      { title: "Ready Orders", url: "/sales/ready", icon: ShoppingCart, roles: ["admin", "manager", "salesperson"] },
      { title: "Delivered Orders", url: "/runner/delivered-orders", icon: CheckCircle, roles: ["admin", "manager", "salesperson"] },
      { title: "Cancelled Sales", url: "/sales/cancelled", icon: X, roles: ["admin", "manager", "salesperson"] },
      { title: "Action Required", url: "/sales/action-required", icon: AlertCircle, roles: ["admin", "manager", "salesperson"] },
    ],
  },
  {
    id: "logistics",
    label: "Logistics",
    icon: Truck,
    items: [
      { title: "Runner Inbox (All)", url: "/admin/runner-inbox", icon: Inbox, roles: ["admin"] },
      { title: "Runner Inbox", url: "/runner/inbox", icon: Inbox, roles: ["runner"] },
      { title: "Runner Inbound", url: "/runner/inbound", icon: Package, roles: ["admin", "runner"] },
      { title: "Driver Inbox", url: "/runner/driver-inbox", icon: Truck, roles: ["runner"] },
      { title: "Driver Management", url: "/runner/drivers", icon: Users, roles: ["runner"] },
      { title: "Live Map", url: "/runner/driver-locations", icon: MapPin, roles: ["admin", "runner"] },
      { title: "Failed Orders", url: "/runner/failed-orders", icon: X, roles: ["runner"] },
    ],
  },
  {
    id: "delivery",
    label: "Delivery",
    icon: Navigation,
    items: [
      { title: "My Deliveries", url: "/driver/inbox", icon: Inbox, roles: ["driver"] },
      { title: "Optimized Route", url: "/driver/route", icon: Navigation, roles: ["driver"] },
      { title: "My Pickups", url: "/driver/pickups", icon: Package, roles: ["driver"] },
      { title: "My Returns", url: "/driver/returns", icon: RotateCcw, roles: ["driver"] },
      { title: "My Analytics", url: "/driver/analytics", icon: Target, roles: ["driver"] },
    ],
  },
  {
    id: "performance",
    label: "Performance",
    icon: Trophy,
    items: [
      { title: "Leaderboard", url: "/leaderboard", icon: Award, roles: ["salesperson", "manager", "admin"] },
      { title: "Ranking Board", url: "/manager/ranking-board", icon: Trophy, roles: ["manager", "admin"] },
      { title: "Impact Board", url: "/manager/impact-board", icon: Award, roles: ["manager", "admin"] },
      { title: "Driver Ranking", url: "/runner/driver-ranking", icon: Trophy, roles: ["runner"] },
      { title: "Ranking", url: "/driver/ranking", icon: Trophy, roles: ["driver"] },
    ],
  },
  {
    id: "management",
    label: "Management",
    icon: Users,
    items: [
      { title: "Manager Dashboard", url: "/manager/dashboard", icon: LayoutDashboard, roles: ["manager"] },
      { title: "Pending Approvals", url: "/manager/pending-approvals", icon: ClipboardCheck, roles: ["manager", "admin"] },
      { title: "Team Oversight", url: "/manager/oversight", icon: Users, roles: ["manager", "admin"] },
      { title: "Dispute Center", url: "/disputes", icon: AlertTriangle, roles: ["admin", "manager"] },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: DollarSign,
    items: [
      { title: "My Claim Batches", url: "/runner/claims", icon: Receipt, roles: ["runner"] },
      { title: "Cash Settlement", url: "/runner/cash-settlement", icon: DollarSign, roles: ["runner"] },
      { title: "Cash Driver", url: "/runner/cash-driver", icon: Truck, roles: ["runner"] },
      { title: "Delivery Charges", url: "/runner/delivery-charges", icon: DollarSign, roles: ["runner"] },
      { title: "Driver Pickups", url: "/runner/driver-pickups", icon: PackageCheck, roles: ["runner"] },
      { title: "Driver Returns", url: "/runner/driver-returns", icon: RotateCcw, roles: ["runner"] },
      { title: "Allocated Stock", url: "/runner/allocated-stock", icon: Layers, roles: ["runner"] },
      { title: "Reconciliation", url: "/reconciliation/admin", icon: PackageCheck, roles: ["admin"] },
      { title: "Claim Batches", url: "/admin/claim-batches", icon: Receipt, roles: ["admin"] },
      { title: "Claim History", url: "/admin/claim-batches-history", icon: Receipt, roles: ["admin"] },
      { title: "Delivery Charges", url: "/admin/delivery-charges", icon: DollarSign, roles: ["admin"] },
      { title: "Delivery Fees Report", url: "/admin/delivery-fees-report", icon: FileText, roles: ["admin"] },
      { title: "Admin Overview", url: "/admin/overview", icon: BarChart3, roles: ["admin"] },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: Package,
    items: [
      { title: "Inbound Pending", url: "/inbound/pending", icon: Package, roles: ["admin", "salesperson", "manager"] },
      { title: "Inbound History", url: "/inbound/history", icon: History, roles: ["admin"] },
      { title: "Stock Balance", url: "/inventory", icon: WarehouseIconLucide, roles: ["admin", "manager", "salesperson", "runner"] },
      { title: "Adjustments", url: "/inventory/adjustment", icon: Wrench, roles: ["admin"] },
      { title: "Warehouses", url: "/admin/warehouses", icon: WarehouseIconLucide, roles: ["admin"] },
      { title: "Products", url: "/products", icon: Package, roles: ["admin", "manager", "salesperson"] },
    ],
  },
  {
    id: "data-integrity",
    label: "Data Integrity",
    icon: Database,
    items: [
      { title: "Stock Integrity Audit", url: "/admin/stock-audit", icon: Database, roles: ["admin"] },
      { title: "Stock Rebuild", url: "/admin/stock-integrity", icon: ShieldCheck, roles: ["admin"] },
    ],
  },
  {
    id: "system",
    label: "System",
    icon: Settings,
    items: [
      { title: "Profile", url: "/settings/profile", icon: Settings, roles: ["admin", "manager", "salesperson", "runner", "driver"] },
      { title: "Users", url: "/settings/users", icon: Users, roles: ["admin", "manager"] },
      { title: "Bindings", url: "/settings/bindings", icon: Users, roles: ["admin"] },
      { title: "Invite Codes", url: "/admin/invite-codes", icon: Ticket, roles: ["admin"] },
      { title: "Commission", url: "/settings/commission", icon: DollarSign, roles: ["admin"] },
      { title: "Leaderboard Settings", url: "/admin/leaderboard-settings", icon: Trophy, roles: ["admin"] },
      { title: "Data Sharing", url: "/admin/data-sharing", icon: Share2, roles: ["admin"] },
      { title: "Reasons", url: "/settings/reasons", icon: Settings, roles: ["admin"] },
    ],
  },
];

// ── Favorites helpers ──────────────────────────────────────────────────
const FAVORITES_KEY = "tomupro-sidebar-favorites";
const COLLAPSED_KEY = "tomupro-sidebar-collapsed-sections";

function loadFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
  } catch { return []; }
}

function loadCollapsed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || "[]");
  } catch { return []; }
}

// ── Quick actions by role ──────────────────────────────────────────────
function getQuickActions(role: string | undefined) {
  if (!role) return [];
  const actions: { label: string; icon: React.ComponentType<{ className?: string }>; url: string; roles: string[] }[] = [
    { label: "New Order", icon: Plus, url: "/sales/booking", roles: ["admin", "salesperson", "manager"] },
    { label: "Create Claim", icon: Plus, url: "/runner/claims", roles: ["runner"] },
  ];
  return actions.filter(a => a.roles.includes(role));
}

// ── Badge pill component ───────────────────────────────────────────────
function BadgePill({ count, urgent }: { count: number; urgent?: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none",
        urgent
          ? "bg-destructive text-destructive-foreground"
          : "bg-primary/15 text-primary"
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

// ── Urgent paths (red badge) ───────────────────────────────────────────
const urgentPaths = new Set(["/sales/action-required", "/runner/inbox"]);

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

  // Favorites
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const toggleFavorite = useCallback((url: string) => {
    setFavorites(prev => {
      const next = prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url];
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Collapsed sections
  const [collapsedSections, setCollapsedSections] = useState<string[]>(loadCollapsed);
  const toggleSection = useCallback((id: string) => {
    setCollapsedSections(prev => {
      const next = prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id];
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Filter sections for current role
  const visibleSections = useMemo(() => {
    if (!userRole) return [];
    return sections
      .map(section => ({
        ...section,
        items: section.items.filter(item => item.roles.includes(userRole)),
      }))
      .filter(section => section.items.length > 0);
  }, [userRole]);

  // Auto-expand section containing active route on mount
  useEffect(() => {
    const activeSection = visibleSections.find(s =>
      s.items.some(item => location.pathname === item.url)
    );
    if (activeSection && collapsedSections.includes(activeSection.id)) {
      setCollapsedSections(prev => {
        const next = prev.filter(s => s !== activeSection.id);
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
        return next;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Favorites section items
  const favoriteItems = useMemo(() => {
    if (!userRole) return [];
    const all = sections.flatMap(s => s.items);
    return favorites
      .map(url => all.find(item => item.url === url && item.roles.includes(userRole)))
      .filter(Boolean) as NavItem[];
  }, [favorites, userRole]);

  const roleLabels: Record<string, string> = {
    admin: "Administrator",
    manager: "Manager",
    salesperson: "Salesperson",
    runner: "Runner",
    driver: "Driver",
  };

  const quickActions = getQuickActions(userRole);

  // ── Loading state ────────────────────────────────────────────────────
  if (isProfileLoading) {
    return (
      <Sidebar className={cn("border-r border-border/30 bg-sidebar", collapsed ? "w-16 md:w-20" : "w-64 md:w-72")}>
        <SidebarHeader className="p-4 md:p-5 border-b border-border/30">
          <div className="flex items-center gap-3">
            <img src={capybaraHero} alt="TOMUPRO" className="h-10 w-10 object-contain" />
            {!collapsed && (
              <div>
                <h2 className="font-extrabold text-lg tracking-tight">TOMU<span className="text-primary">PRO</span></h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground">Loading...</p>
                </div>
              </div>
            )}
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2 md:px-3 py-4 space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-20 ml-3" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ))}
        </SidebarContent>
      </Sidebar>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────
  if (isProfileError || !userRole) {
    return (
      <Sidebar className={cn("border-r border-border/30 bg-sidebar", collapsed ? "w-16 md:w-20" : "w-64 md:w-72")}>
        <SidebarHeader className="p-4 md:p-5 border-b border-border/30">
          <div className="flex items-center gap-3">
            <img src={capybaraHero} alt="TOMUPRO" className="h-10 w-10 object-contain" />
            {!collapsed && (
              <div>
                <h2 className="font-extrabold text-lg tracking-tight">TOMU<span className="text-primary">PRO</span></h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <AlertCircle className="h-3 w-3 text-destructive" />
                  <p className="text-xs text-destructive">Profile Error</p>
                </div>
              </div>
            )}
          </div>
        </SidebarHeader>
        <SidebarContent className="px-4 py-6 flex flex-col items-center justify-center gap-4">
          {!collapsed && (
            <>
              <p className="text-sm text-muted-foreground text-center">Could not load your profile. Please try again.</p>
              <Button onClick={retryProfile} size="sm" className="w-full gap-2">
                <Loader2 className="h-3 w-3" />
                Retry
              </Button>
            </>
          )}
        </SidebarContent>
        <SidebarFooter className="p-4 border-t border-border/30">
          <Button variant="outline" size={collapsed ? "icon" : "default"} onClick={resetSession} className="w-full gap-2 border-border/50 hover:bg-destructive/10 hover:text-destructive">
            <LogOut className="h-4 w-4" />
            {!collapsed && "Sign Out"}
          </Button>
        </SidebarFooter>
      </Sidebar>
    );
  }

  // ── Render a single nav item ─────────────────────────────────────────
  const renderNavItem = (item: NavItem, showFavStar = true) => {
    const badgeCount = badges[item.url] || 0;
    const isUrgent = urgentPaths.has(item.url);
    const isFav = favorites.includes(item.url);

    if (collapsed) {
      return (
        <TooltipProvider key={item.url} delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <NavLink
                to={item.url}
                end
                className="relative flex items-center justify-center w-10 h-10 mx-auto rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/8 transition-all duration-150"
                activeClassName="bg-gradient-to-r from-primary/15 to-primary/5 text-primary shadow-[0_0_8px_hsl(var(--primary)/0.15)]"
              >
                <item.icon className="h-[18px] w-[18px]" />
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
            <TooltipContent side="right" className="font-medium">
              {item.title}
              {badgeCount > 0 && <span className="ml-1.5 text-muted-foreground">({badgeCount})</span>}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <div key={item.url} className="group/item relative">
        <NavLink
          to={item.url}
          end
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/8 hover:-translate-y-[1px] hover:shadow-sm transition-all duration-150 min-h-[40px] border border-transparent hover:border-primary/10"
          activeClassName="bg-gradient-to-r from-primary/15 to-primary/5 text-primary font-semibold border-l-2 border-primary shadow-[0_0_8px_hsl(var(--primary)/0.15)]"
        >
          <item.icon className="h-[18px] w-[18px] shrink-0" />
          <span className="text-[15px] tracking-tight flex-1 truncate">{item.title}</span>
          <BadgePill count={badgeCount} urgent={isUrgent} />
        </NavLink>
        {showFavStar && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(item.url); }}
            className={cn(
              "absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md transition-all duration-150",
              isFav
                ? "text-[hsl(var(--status-pending))] opacity-100"
                : "text-muted-foreground/30 opacity-0 group-hover/item:opacity-100 hover:text-[hsl(var(--status-pending))]"
            )}
            title={isFav ? "Remove from favorites" : "Add to favorites"}
          >
            <Star className={cn("h-3 w-3", isFav && "fill-current")} />
          </button>
        )}
      </div>
    );
  };

  // ── Render a collapsible section ─────────────────────────────────────
  const renderSection = (section: typeof visibleSections[0]) => {
    const isOpen = section.alwaysOpen || !collapsedSections.includes(section.id);
    const sectionHasActiveRoute = section.items.some(item => location.pathname === item.url);
    const sectionBadgeTotal = section.items.reduce((sum, item) => sum + (badges[item.url] || 0), 0);

    if (collapsed) {
      return (
        <div key={section.id} className="space-y-1 py-1">
          {section.items.map(item => renderNavItem(item, false))}
        </div>
      );
    }

    if (section.alwaysOpen) {
      return (
        <div key={section.id} className="space-y-0.5">
          {section.items.map(item => renderNavItem(item))}
        </div>
      );
    }

    return (
      <Collapsible key={section.id} open={isOpen} onOpenChange={() => toggleSection(section.id)}>
        <CollapsibleTrigger className="flex items-center w-full px-3 py-2 gap-2 group/section cursor-pointer rounded-lg hover:bg-secondary/50 transition-colors">
          <section.icon className={cn(
            "h-3.5 w-3.5 shrink-0 transition-colors",
            sectionHasActiveRoute ? "text-primary" : "text-muted-foreground/60"
          )} />
          <span className={cn(
            "text-[11px] font-semibold uppercase tracking-widest flex-1 text-left transition-colors",
            sectionHasActiveRoute ? "text-primary" : "text-muted-foreground/60"
          )}>
            {section.label}
          </span>
          {sectionBadgeTotal > 0 && !isOpen && (
            <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-destructive/15 text-destructive text-[9px] font-bold flex items-center justify-center">
              {sectionBadgeTotal > 99 ? "99+" : sectionBadgeTotal}
            </span>
          )}
          <ChevronDown className={cn(
            "h-3 w-3 text-muted-foreground/50 transition-transform duration-200",
            isOpen && "rotate-180"
          )} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-0.5 mt-0.5">
          {section.items.map(item => renderNavItem(item))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  // ── Main render ──────────────────────────────────────────────────────
  return (
    <Sidebar className={cn("border-r border-border/30 bg-sidebar", collapsed ? "w-16 md:w-20" : "w-64 md:w-72")}>
      {/* Brand Header */}
      <SidebarHeader className="p-4 md:p-5 border-b border-border/30">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img src={capybaraHero} alt="TOMUPRO" className="h-10 w-10 object-contain drop-shadow-md" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="font-extrabold text-lg tracking-tight">
                TOMU<span className="text-primary">PRO</span>
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--status-success))] animate-pulse" />
                <p className="text-[11px] text-muted-foreground font-medium tracking-wide">
                  {roleLabels[userRole] || userRole}
                </p>
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 md:px-3 py-3 space-y-1 overflow-y-auto">
        {/* Favorites section */}
        {!collapsed && favoriteItems.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <Star className="h-3.5 w-3.5 text-[hsl(var(--status-pending))] fill-[hsl(var(--status-pending))]" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[hsl(var(--status-pending)/0.7)]">Favorites</span>
            </div>
            <div className="space-y-0.5">
              {favoriteItems.map(item => renderNavItem(item))}
            </div>
            <div className="mx-3 my-2 border-b border-border/20" />
          </div>
        )}

        {/* All sections */}
        {visibleSections.map(section => renderSection(section))}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="p-3 md:p-4 border-t border-border/30">
        {/* Quick actions */}
        {!collapsed && quickActions.length > 0 && (
          <div className="flex gap-2 mb-3">
            {quickActions.map(action => (
              <Button
                key={action.url}
                variant="outline"
                size="sm"
                onClick={() => navigate(action.url)}
                className="flex-1 gap-1.5 text-xs h-8 rounded-lg border-border/40 hover:bg-primary/8 hover:text-primary hover:border-primary/20"
              >
                <action.icon className="h-3 w-3" />
                {action.label}
              </Button>
            ))}
          </div>
        )}

        {/* User card */}
        {!collapsed && (
          <div className="flex items-center gap-3 mb-3 p-3 rounded-xl bg-secondary/40 border border-border/30">
            <div className="relative">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm">
                <span className="text-sm font-bold text-primary-foreground">
                  {profile?.display_name?.charAt(0).toUpperCase() || "U"}
                </span>
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[hsl(var(--status-success))] rounded-full border-2 border-sidebar" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{profile?.display_name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{profile?.email}</p>
            </div>
          </div>
        )}

        <Button
          variant="outline"
          size={collapsed ? "icon" : "default"}
          onClick={signOut}
          disabled={signingOut}
          className="w-full gap-2 border-border/40 hover:bg-destructive/8 hover:text-destructive hover:border-destructive/25 transition-all rounded-xl"
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
