import { 
  Package, 
  ShoppingCart, 
  Truck, 
  FileCheck, 
  Warehouse as WarehouseIcon, 
  BarChart3, 
  Settings, 
  AlertTriangle,
  PackageCheck,
  ClipboardList,
  X,
  Users,
  Inbox,
  Receipt,
  Wrench
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}

const salesItems: NavItem[] = [
  { title: "Booking Sales", url: "/sales/booking", icon: ClipboardList, roles: ['admin', 'manager', 'salesperson'] },
  { title: "Ready Sales", url: "/sales/ready", icon: ShoppingCart, roles: ['admin', 'manager', 'salesperson'] },
  { title: "Cancelled Sales", url: "/sales/cancelled", icon: X, roles: ['admin', 'manager', 'salesperson'] },
];

const runnerItems: NavItem[] = [
  { title: "Runner Inbox", url: "/runner/inbox", icon: Inbox, roles: ['admin', 'runner'] },
  { title: "Runner Inbound", url: "/runner/inbound", icon: Package, roles: ['admin', 'runner'] },
  { title: "My Claim Batches", url: "/runner/claims", icon: Receipt, roles: ['runner'] },
];

const reconciliationItems: NavItem[] = [
  { title: "Claims History", url: "/claims", icon: Receipt, roles: ['admin', 'salesperson'] },
  { title: "SP Reconciliation", url: "/reconciliation/sp", icon: FileCheck, roles: ['admin', 'salesperson'] },
  { title: "Admin Reconciliation", url: "/reconciliation/admin", icon: PackageCheck, roles: ['admin'] },
  { title: "Claim Batches", url: "/admin/claim-batches", icon: Receipt, roles: ['admin'] },
  { title: "Dispute Center", url: "/disputes", icon: AlertTriangle, roles: ['admin', 'manager'] },
  { title: "Manager Oversight", url: "/manager/oversight", icon: BarChart3, roles: ['manager', 'admin'] },
  { title: "Admin Overview", url: "/admin/overview", icon: BarChart3, roles: ['admin'] },
];

const inventoryItems: NavItem[] = [
  { title: "Inbound Pending", url: "/inbound/pending", icon: Package, roles: ['admin', 'salesperson'] },
  { title: "Stock Balance", url: "/inventory", icon: WarehouseIcon, roles: ['admin', 'manager', 'salesperson', 'runner'] },
  { title: "Adjustments", url: "/inventory/adjustment", icon: Wrench, roles: ['admin'] },
  { title: "Products", url: "/products", icon: Package, roles: ['admin', 'manager', 'salesperson'] },
];

const settingsItems: NavItem[] = [
  { title: "Profile", url: "/settings/profile", icon: Settings, roles: ['admin', 'manager', 'salesperson', 'runner'] },
  { title: "Bindings", url: "/settings/bindings", icon: Users, roles: ['admin', 'salesperson'] },
  { title: "Users", url: "/settings/users", icon: Users, roles: ['admin', 'manager'] },
  { title: "Reasons", url: "/settings/reasons", icon: Settings, roles: ['admin'] },
];

export function AppSidebar() {
  const { profile, signOut } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const userRole = profile?.role || 'salesperson';

  const filterItems = (items: NavItem[]) => 
    items.filter(item => item.roles.includes(userRole));

  const renderMenuItems = (items: NavItem[]) => {
    const filteredItems = filterItems(items);
    if (filteredItems.length === 0) return null;
    
    return filteredItems.map((item) => (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild>
          <NavLink 
            to={item.url} 
            end 
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors"
            activeClassName="bg-primary text-primary-foreground"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));
  };

  return (
    <Sidebar className={cn("border-r bg-card", collapsed ? "w-16" : "w-64")}>
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Truck className="h-5 w-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="font-bold text-lg">Ecom Ops</h2>
              <p className="text-xs text-muted-foreground capitalize">{userRole}</p>
            </div>
          )}
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-2 py-4">
        {filterItems(salesItems).length > 0 && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sales</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderMenuItems(salesItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filterItems(runnerItems).length > 0 && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Runner</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderMenuItems(runnerItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filterItems(reconciliationItems).length > 0 && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reconciliation</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderMenuItems(reconciliationItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filterItems(inventoryItems).length > 0 && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Inventory</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderMenuItems(inventoryItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filterItems(settingsItems).length > 0 && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Settings</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>{renderMenuItems(settingsItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t">
        {!collapsed && (
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
              <span className="text-sm font-medium">
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
          className="w-full"
        >
          {collapsed ? "←" : "Sign Out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
