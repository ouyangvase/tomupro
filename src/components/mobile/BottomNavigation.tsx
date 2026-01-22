import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Package, Boxes, Users, Settings, Inbox, Truck, ClipboardList, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
  activeIcon?: React.ReactNode;
}

const salespersonTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'orders', label: 'Orders', icon: <ClipboardList className="h-5 w-5" />, href: '/sales/booking' },
  { id: 'stock', label: 'Stock', icon: <Boxes className="h-5 w-5" />, href: '/inventory/balance' },
  { id: 'products', label: 'Products', icon: <Package className="h-5 w-5" />, href: '/products' },
  { id: 'profile', label: 'Profile', icon: <Settings className="h-5 w-5" />, href: '/settings/profile' },
];

const managerTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'team', label: 'Team', icon: <Users className="h-5 w-5" />, href: '/manager/oversight' },
  { id: 'stock', label: 'Stock', icon: <Boxes className="h-5 w-5" />, href: '/inventory/balance' },
  { id: 'approvals', label: 'Approvals', icon: <ClipboardList className="h-5 w-5" />, href: '/manager/pending-approvals' },
  { id: 'profile', label: 'Profile', icon: <Settings className="h-5 w-5" />, href: '/settings/profile' },
];

const runnerTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'inbox', label: 'Inbox', icon: <Inbox className="h-5 w-5" />, href: '/runner/inbox' },
  { id: 'delivered', label: 'Delivered', icon: <Truck className="h-5 w-5" />, href: '/runner/delivered' },
  { id: 'inbound', label: 'Inbound', icon: <Package className="h-5 w-5" />, href: '/runner/inbound' },
  { id: 'profile', label: 'Profile', icon: <Settings className="h-5 w-5" />, href: '/settings/profile' },
];

const driverTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'inbox', label: 'Inbox', icon: <Inbox className="h-5 w-5" />, href: '/driver/inbox' },
  { id: 'route', label: 'Route', icon: <Truck className="h-5 w-5" />, href: '/driver/route' },
  { id: 'analytics', label: 'Stats', icon: <BarChart3 className="h-5 w-5" />, href: '/driver/analytics' },
  { id: 'profile', label: 'Profile', icon: <Settings className="h-5 w-5" />, href: '/settings/profile' },
];

const adminTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'orders', label: 'Orders', icon: <ClipboardList className="h-5 w-5" />, href: '/sales/booking' },
  { id: 'stock', label: 'Stock', icon: <Boxes className="h-5 w-5" />, href: '/inventory/balance' },
  { id: 'users', label: 'Users', icon: <Users className="h-5 w-5" />, href: '/settings/users' },
  { id: 'settings', label: 'Settings', icon: <Settings className="h-5 w-5" />, href: '/settings/profile' },
];

export function BottomNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useAuth();

  const getTabs = (): NavItem[] => {
    switch (role) {
      case 'admin': return adminTabs;
      case 'manager': return managerTabs;
      case 'runner': return runnerTabs;
      case 'driver': return driverTabs;
      default: return salespersonTabs;
    }
  };

  const tabs = getTabs();

  const isActive = (href: string): boolean => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border/40 safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.href)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-lg transition-all duration-200",
                "min-w-[56px]",
                active 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className={cn(
                "p-1 rounded-lg transition-colors",
                active && "bg-primary/10"
              )}>
                {tab.icon}
              </div>
              <span className={cn(
                "text-[10px] font-medium",
                active && "text-primary font-semibold"
              )}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
