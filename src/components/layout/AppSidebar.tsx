import { Package, ShoppingCart, FileCheck, Warehouse as WarehouseIcon, BarChart3, Settings, AlertTriangle, PackageCheck, ClipboardList, X, Users, Inbox, Receipt, Wrench, LayoutDashboard, DollarSign, FileText, Truck, RotateCcw, Trophy, Navigation, Target, MapPin, Layers, AlertCircle, LogOut, CheckCircle, Award, Ticket, Database, History } from "lucide-react";
import tomuLogo from "@/assets/tomu-logo.png";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{
    className?: string;
  }>;
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

const reconciliationItems: NavItem[] = [{
  title: "Claims History",
  url: "/claims",
  icon: Receipt,
  roles: ['admin', 'salesperson', 'manager']
}, {
  title: "SP Reconciliation",
  url: "/reconciliation/sp",
  icon: FileCheck,
  roles: ['admin', 'salesperson', 'manager']
}, {
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
  title: "Manager Oversight",
  url: "/manager/oversight",
  icon: BarChart3,
  roles: ['manager', 'admin']
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

const packageItems: NavItem[] = [{
  title: "My Packages",
  url: "/packages",
  icon: Package,
  roles: ['admin', 'manager', 'salesperson']
}, {
  title: "Connection Diagnostic",
  url: "/admin/connection-diagnostic",
  icon: Database,
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
  roles: ['admin', 'salesperson', 'manager']
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
  title: "Reasons",
  url: "/settings/reasons",
  icon: Settings,
  roles: ['admin']
}];

export function AppSidebar() {
  const {
    profile,
    signOut,
    signingOut
  } = useAuth();
  const {
    state,
    isMobile
  } = useSidebar();
  const collapsed = state === 'collapsed';
  const userRole = profile?.role || 'salesperson';
  const filterItems = (items: NavItem[]) => items.filter(item => item.roles.includes(userRole));
  
  const renderMenuItems = (items: NavItem[]) => {
    const filteredItems = filterItems(items);
    if (filteredItems.length === 0) return null;
    return filteredItems.map(item => (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild>
          <NavLink 
            to={item.url} 
            end 
            className="flex items-center gap-3 px-3 md:px-4 py-2.5 rounded-xl text-muted-foreground hover:text-primary hover:bg-gradient-to-r hover:from-primary/15 hover:to-primary/5 transition-all duration-300 min-h-[44px] group border border-transparent hover:border-primary/20" 
            activeClassName="bg-gradient-to-r from-primary/25 via-primary/15 to-transparent text-primary border-l-3 border-primary shadow-md font-semibold"
          >
            <div className="p-2 rounded-xl bg-secondary/50 group-hover:bg-primary/20 transition-all duration-300 group-hover:shadow-sm">
              <item.icon className="h-4 w-4 shrink-0" />
            </div>
            {!collapsed && <span className="text-sm md:text-base tracking-tight">{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));
  };

  return (
    <Sidebar className={cn(
      "border-r border-border/30 bg-gradient-to-b from-sidebar via-sidebar to-sidebar/95",
      collapsed ? "w-16 md:w-20" : "w-64 md:w-72"
    )}>
      {/* Premium Header - Modern Orange/Silver */}
      <SidebarHeader className="p-4 md:p-6 border-b border-primary/20 bg-gradient-to-br from-primary/10 via-secondary/30 to-transparent">
        <div className="flex items-center gap-3">
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-transparent rounded-lg blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
            <img src={tomuLogo} alt="TOMU Logo" className="relative h-12 w-12 md:h-14 md:w-14 object-contain drop-shadow-lg" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="font-extrabold text-xl md:text-2xl tracking-tight bg-gradient-to-r from-primary via-primary/80 to-[hsl(var(--status-warning))] bg-clip-text text-transparent">TOMU</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--status-success))] animate-pulse" />
                <p className="text-xs text-muted-foreground capitalize font-semibold tracking-widest">{userRole}</p>
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-2 md:px-3 py-4 md:py-6 space-y-4 md:space-y-6">
        {filterItems(salesItems).length > 0 && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="px-3 md:px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Sales
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">{renderMenuItems(salesItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filterItems(runnerQuickActions).length > 0 && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Quick Actions
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">{renderMenuItems(runnerQuickActions)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filterItems(runnerItems).length > 0 && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Runner
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">{renderMenuItems(runnerItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filterItems(driverQuickActions).length > 0 && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Quick Actions
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">{renderMenuItems(driverQuickActions)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filterItems(driverItems).length > 0 && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Driver
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">{renderMenuItems(driverItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filterItems(reconciliationItems).length > 0 && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Reconciliation
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">{renderMenuItems(reconciliationItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filterItems(inventoryItems).length > 0 && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Inventory
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">{renderMenuItems(inventoryItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filterItems(packageItems).length > 0 && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Packages
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">{renderMenuItems(packageItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filterItems(settingsItems).length > 0 && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Settings
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">{renderMenuItems(settingsItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Premium Footer with User Card */}
      <SidebarFooter className="p-4 border-t border-border/30 bg-gradient-to-t from-primary/5 to-transparent">
        {!collapsed && (
          <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-secondary/50 backdrop-blur-sm border border-border/30">
            <div className="relative">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
                <span className="text-sm font-bold text-primary-foreground">
                  {profile?.display_name?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[hsl(var(--status-success))] rounded-full border-2 border-sidebar" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{profile?.display_name}</p>
              <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
            </div>
          </div>
        )}
        <Button 
          variant="outline" 
          size={collapsed ? "icon" : "default"} 
          onClick={signOut} 
          disabled={signingOut}
          className="w-full gap-2 border-border/50 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all"
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
