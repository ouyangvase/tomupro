import { useLocation, useNavigate } from 'react-router-dom';
import { Home, ClipboardList, Boxes, Users, Settings, Inbox, Truck, BarChart3, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
}

const salespersonTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'orders', label: 'Orders', icon: <ClipboardList className="h-5 w-5" />, href: '/sales/booking' },
  { id: 'stock', label: 'Inventory', icon: <Boxes className="h-5 w-5" />, href: '/inventory/balance' },
  { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/settings/profile' },
];

const managerTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'orders', label: 'Orders', icon: <ClipboardList className="h-5 w-5" />, href: '/sales/booking' },
  { id: 'team', label: 'Team', icon: <Users className="h-5 w-5" />, href: '/manager/oversight' },
  { id: 'stock', label: 'Inventory', icon: <Boxes className="h-5 w-5" />, href: '/inventory/balance' },
  { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/settings/profile' },
];

const runnerTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'inbox', label: 'Dispatch', icon: <Inbox className="h-5 w-5" />, href: '/runner/inbox' },
  { id: 'delivered', label: 'Delivered', icon: <Truck className="h-5 w-5" />, href: '/runner/delivered' },
  { id: 'stock', label: 'Inventory', icon: <Boxes className="h-5 w-5" />, href: '/runner/allocated-stock' },
  { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/settings/profile' },
];

const driverTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'inbox', label: 'Inbox', icon: <Inbox className="h-5 w-5" />, href: '/driver/inbox' },
  { id: 'route', label: 'Route', icon: <Truck className="h-5 w-5" />, href: '/driver/route' },
  { id: 'stats', label: 'Stats', icon: <BarChart3 className="h-5 w-5" />, href: '/driver/analytics' },
  { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/settings/profile' },
];

const adminTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'orders', label: 'Orders', icon: <ClipboardList className="h-5 w-5" />, href: '/sales/booking' },
  { id: 'stock', label: 'Inventory', icon: <Boxes className="h-5 w-5" />, href: '/inventory/balance' },
  { id: 'users', label: 'Users', icon: <Users className="h-5 w-5" />, href: '/settings/users' },
  { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/settings/profile' },
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border/30 safe-area-bottom shadow-lg">
      <div className="flex items-center justify-around h-[68px] px-1">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.href)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-2xl transition-all duration-200",
                "min-w-[60px]",
                active 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className={cn(
                "p-1.5 rounded-xl transition-all duration-200",
                active && "bg-primary/12 scale-110"
              )}>
                {tab.icon}
              </div>
              <span className={cn(
                "text-[10px] font-semibold transition-colors",
                active && "text-primary"
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
