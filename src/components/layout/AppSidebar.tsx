import { Package, ShoppingCart, FileCheck, Warehouse as WarehouseIcon, BarChart3, Settings, AlertTriangle, PackageCheck, ClipboardList, X, Users, Inbox, Receipt, Wrench, LayoutDashboard, DollarSign, FileText, Truck, RotateCcw, Trophy, Navigation, Target, MapPin, Layers, AlertCircle, LogOut, CheckCircle, Award } from "lucide-react";
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
  roles: ['admin', 'salesperson']
}, {
  title: "SP Reconciliation",
  url: "/reconciliation/sp",
  icon: FileCheck,
  roles: ['admin', 'salesperson']
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
  roles: ['admin', 'salesperson']
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

const settingsItems: NavItem[] = [{
  title: "Profile",
  url: "/settings/profile",
  icon: Settings,
  roles: ['admin', 'manager', 'salesperson', 'runner', 'driver']
}, {
  title: "Bindings",
  url: "/settings/bindings",
  icon: Users,
  roles: ['admin', 'salesperson']
}, {
  title: "Users",
  url: "/settings/users",
  icon: Users,
  roles: ['admin', 'manager']
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
    state
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
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all duration-200" 
            activeClassName="bg-primary/15 text-primary border border-primary/20"
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="font-medium">{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));
  };

  return (
    <Sidebar className={cn("border-r border-border/50 bg-sidebar", collapsed ? "w-20" : "w-72")}>
      <SidebarHeader className="p-6 border-b border-border/50">
        <div className="flex items-center gap-3">
          <img src={tomuLogo} alt="TOMU Logo" className="h-10 w-10 object-contain" />
          {!collapsed && (
            <div>
              <h2 className="font-bold text-xl tracking-tight">TOMU</h2>
              <p className="text-xs text-muted-foreground capitalize font-medium">{userRole}</p>
            </div>
          )}
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-3 py-6 space-y-6">
        {filterItems(salesItems).length > 0 && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
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

      <SidebarFooter className="p-4 border-t border-border/50">
        {!collapsed && (
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center">
              <span className="text-sm font-semibold text-foreground">
                {profile?.display_name?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile?.display_name}</p>
              <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
            </div>
          </div>
        )}
        <Button 
          variant="outline" 
          size={collapsed ? "icon" : "default"} 
          onClick={signOut} 
          disabled={signingOut}
          className="w-full gap-2"
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
