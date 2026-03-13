import { Package, ShoppingCart, FileCheck, Warehouse as WarehouseIcon, BarChart3, Settings, AlertTriangle, PackageCheck, ClipboardList, X, Users, Inbox, Receipt, Wrench, LayoutDashboard, DollarSign, FileText, Truck, RotateCcw, Trophy, Navigation, Target, MapPin, Layers, AlertCircle, LogOut, CheckCircle, Award, Ticket, History, ClipboardCheck, Share2, Loader2, Database, ShieldCheck } from "lucide-react";
import capybaraHero from "@/assets/capybara-hero.png";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}

const salesItems: NavItem[] = [{
  title: "Dashboard",
  url: "/",
  icon: LayoutDashboard,
  roles: ['admin', 'manager', 'salesperson', 'runner', 'driver']
}, {
  title: "Booking Sales",
  url: "/sales/booking",
  icon: ClipboardList,
  roles: ['admin', 'manager', 'salesperson']
}, {
  title: "Ready Sales",
  url: "/sales/ready",
  icon: ShoppingCart,
  roles: ['admin', 'manager', 'salesperson']
}, {
  title: "Delivered Orders",
  url: "/runner/delivered-orders",
  icon: CheckCircle,
  roles: ['admin', 'manager', 'salesperson']
}, {
  title: "Cancelled Sales",
  url: "/sales/cancelled",
  icon: X,
  roles: ['admin', 'manager', 'salesperson']
}, {
  title: "Action Required",
  url: "/sales/action-required",
  icon: AlertCircle,
  roles: ['admin', 'manager', 'salesperson']
}, {
  title: "Leaderboard",
  url: "/leaderboard",
  icon: Award,
  roles: ['salesperson', 'manager', 'admin']
}];

const runnerQuickActions: NavItem[] = [{
  title: "Runner Inbox",
  url: "/runner/inbox",
  icon: Inbox,
  roles: ['runner']
}, {
  title: "Delivered Orders",
  url: "/runner/delivered-orders",
  icon: CheckCircle,
  roles: ['runner']
}, {
  title: "Failed Orders",
  url: "/runner/failed-orders",
  icon: X,
  roles: ['runner']
}, {
  title: "Driver Inbox",
  url: "/runner/driver-inbox",
  icon: Truck,
  roles: ['runner']
}, {
  title: "Driver Management",
  url: "/runner/drivers",
  icon: Users,
  roles: ['runner']
}, {
  title: "Live Map",
  url: "/runner/driver-locations",
  icon: MapPin,
  roles: ['runner']
}];

const runnerItems: NavItem[] = [{
  title: "Runner Inbox (All)",
  url: "/admin/runner-inbox",
  icon: Inbox,
  roles: ['admin']
}, {
  title: "Runner Inbound",
  url: "/runner/inbound",
  icon: Package,
  roles: ['admin', 'runner']
}, {
  title: "My Claim Batches",
  url: "/runner/claims",
  icon: Receipt,
  roles: ['runner']
}, {
  title: "Cash Settlement",
  url: "/runner/cash-settlement",
  icon: DollarSign,
  roles: ['runner']
}, {
  title: "Cash Driver",
  url: "/runner/cash-driver",
  icon: Truck,
  roles: ['runner']
}, {
  title: "Delivery Charges",
  url: "/runner/delivery-charges",
  icon: DollarSign,
  roles: ['runner']
}, {
  title: "Driver Pickups",
  url: "/runner/driver-pickups",
  icon: PackageCheck,
  roles: ['runner']
}, {
  title: "Driver Returns",
  url: "/runner/driver-returns",
  icon: RotateCcw,
  roles: ['runner']
}, {
  title: "Allocated Stock",
  url: "/runner/allocated-stock",
  icon: Layers,
  roles: ['runner']
}, {
  title: "Driver Ranking",
  url: "/runner/driver-ranking",
  icon: Trophy,
  roles: ['runner']
}, {
  title: "Live Map",
  url: "/runner/driver-locations",
  icon: MapPin,
  roles: ['admin']
}];

const driverQuickActions: NavItem[] = [{
  title: "My Deliveries",
  url: "/driver/inbox",
  icon: Inbox,
  roles: ['driver']
}, {
  title: "Optimized Route",
  url: "/driver/route",
  icon: Navigation,
  roles: ['driver']
}, {
  title: "My Analytics",
  url: "/driver/analytics",
  icon: Target,
  roles: ['driver']
}];

const driverItems: NavItem[] = [{
  title: "My Pickups",
  url: "/driver/pickups",
  icon: Package,
  roles: ['driver']
}, {
  title: "My Returns",
  url: "/driver/returns",
  icon: RotateCcw,
  roles: ['driver']
}, {
  title: "Ranking",
  url: "/driver/ranking",
  icon: Trophy,
  roles: ['driver']
}];

const managerItems: NavItem[] = [{
  title: "Manager Dashboard",
  url: "/manager/dashboard",
  icon: LayoutDashboard,
  roles: ['manager']
}, {
  title: "Pending Approvals",
  url: "/manager/pending-approvals",
  icon: ClipboardCheck,
  roles: ['manager', 'admin']
}, {
  title: "Impact Board",
  url: "/manager/impact-board",
  icon: Award,
  roles: ['manager', 'admin']
}, {
  title: "Ranking Board",
  url: "/manager/ranking-board",
  icon: Trophy,
  roles: ['manager', 'admin']
}, {
  title: "Team Oversight",
  url: "/manager/oversight",
  icon: Users,
  roles: ['manager', 'admin']
}];

const reconciliationItems: NavItem[] = [{
  title: "Admin Reconciliation",
  url: "/reconciliation/admin",
  icon: PackageCheck,
  roles: ['admin']
}, {
  title: "Claim Batches (Pending)",
  url: "/admin/claim-batches",
  icon: Receipt,
  roles: ['admin']
}, {
  title: "Claim Batches History",
  url: "/admin/claim-batches-history",
  icon: Receipt,
  roles: ['admin']
}, {
  title: "Delivery Charges",
  url: "/admin/delivery-charges",
  icon: DollarSign,
  roles: ['admin']
}, {
  title: "Delivery Fees Report",
  url: "/admin/delivery-fees-report",
  icon: FileText,
  roles: ['admin']
}, {
  title: "Dispute Center",
  url: "/disputes",
  icon: AlertTriangle,
  roles: ['admin', 'manager']
}, {
  title: "Admin Overview",
  url: "/admin/overview",
  icon: BarChart3,
  roles: ['admin']
}];

const inventoryItems: NavItem[] = [{
  title: "Inbound Pending",
  url: "/inbound/pending",
  icon: Package,
  roles: ['admin', 'salesperson', 'manager']
}, {
  title: "Inbound History",
  url: "/inbound/history",
  icon: History,
  roles: ['admin']
}, {
  title: "Stock Balance",
  url: "/inventory",
  icon: WarehouseIcon,
  roles: ['admin', 'manager', 'salesperson', 'runner']
}, {
  title: "Adjustments",
  url: "/inventory/adjustment",
  icon: Wrench,
  roles: ['admin']
}, {
  title: "Warehouses",
  url: "/admin/warehouses",
  icon: WarehouseIcon,
  roles: ['admin']
}, {
  title: "Products",
  url: "/products",
  icon: Package,
  roles: ['admin', 'manager', 'salesperson']
}];

const dataIntegrityItems: NavItem[] = [{
  title: "Stock Integrity Audit",
  url: "/admin/stock-audit",
  icon: Database,
  roles: ['admin']
}, {
  title: "Stock Rebuild",
  url: "/admin/stock-integrity",
  icon: ShieldCheck,
  roles: ['admin']
}];

const settingsItems: NavItem[] = [{
  title: "Profile",
  url: "/settings/profile",
  icon: Settings,
  roles: ['admin', 'manager', 'salesperson', 'runner', 'driver']
}, {
  title: "Bindings",
  url: "/settings/bindings",
  icon: Users,
  roles: ['admin']
}, {
  title: "Users",
  url: "/settings/users",
  icon: Users,
  roles: ['admin', 'manager']
}, {
  title: "Invite Codes",
  url: "/admin/invite-codes",
  icon: Ticket,
  roles: ['admin']
}, {
  title: "Commission System",
  url: "/settings/commission",
  icon: DollarSign,
  roles: ['admin']
}, {
  title: "Leaderboard",
  url: "/admin/leaderboard-settings",
  icon: Trophy,
  roles: ['admin']
}, {
  title: "Data Sharing",
  url: "/admin/data-sharing",
  icon: Share2,
  roles: ['admin']
}, {
  title: "Reasons",
  url: "/settings/reasons",
  icon: Settings,
  roles: ['admin']
}];

export function AppSidebar() {
  const { profile, signOut, signingOut, loading, profileStatus, retryProfile, resetSession } = useAuth();
  const { state, isMobile } = useSidebar();
  const collapsed = state === 'collapsed';
  
  const userRole = profile?.role;
  const isProfileReady = profileStatus === 'ready' && !!userRole;
  const isProfileLoading = profileStatus === 'loading' || profileStatus === 'idle';
  const isProfileError = profileStatus === 'error' || profileStatus === 'missing';
  
  const filterItems = (items: NavItem[]) => {
    if (!userRole) return [];
    return items.filter(item => item.roles.includes(userRole));
  };
  
  const roleLabels: Record<string, string> = {
    admin: 'Administrator',
    manager: 'Manager',
    salesperson: 'Salesperson',
    runner: 'Runner',
    driver: 'Driver',
  };

  // Loading state
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
          {[1, 2, 3, 4, 5].map((i) => (
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

  // Error state
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
  
  const renderMenuItems = (items: NavItem[]) => {
    const filteredItems = filterItems(items);
    if (filteredItems.length === 0) return null;
    return filteredItems.map(item => (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild>
          <NavLink 
            to={item.url} 
            end 
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/8 transition-all duration-200 min-h-[44px] group border border-transparent hover:border-primary/15" 
            activeClassName="bg-primary/12 text-primary border-primary/20 font-semibold shadow-sm"
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="text-sm tracking-tight">{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));
  };

  const renderGroup = (label: string, items: NavItem[]) => {
    if (filterItems(items).length === 0) return null;
    return (
      <SidebarGroup>
        {!collapsed && (
          <SidebarGroupLabel className="px-3 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest mb-1.5">
            {label}
          </SidebarGroupLabel>
        )}
        <SidebarGroupContent>
          <SidebarMenu className="space-y-0.5">{renderMenuItems(items)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar className={cn("border-r border-border/30 bg-sidebar", collapsed ? "w-16 md:w-20" : "w-64 md:w-72")}>
      {/* Brand Header with Capybara */}
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
      
      <SidebarContent className="px-2 md:px-3 py-3 space-y-3 md:space-y-4">
        {renderGroup('Sales', salesItems)}
        {renderGroup('Quick Actions', runnerQuickActions)}
        {renderGroup('Runner', runnerItems)}
        {renderGroup('Quick Actions', driverQuickActions)}
        {renderGroup('Driver', driverItems)}
        {renderGroup('Manager', managerItems)}
        {renderGroup('Reconciliation', reconciliationItems)}
        {renderGroup('Data Integrity', dataIntegrityItems)}
        {renderGroup('Inventory', inventoryItems)}
        {renderGroup('Settings', settingsItems)}
      </SidebarContent>

      {/* User Footer */}
      <SidebarFooter className="p-3 md:p-4 border-t border-border/30">
        {!collapsed && (
          <div className="flex items-center gap-3 mb-3 p-3 rounded-xl bg-secondary/40 border border-border/30">
            <div className="relative">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm">
                <span className="text-sm font-bold text-primary-foreground">
                  {profile?.display_name?.charAt(0).toUpperCase() || 'U'}
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