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
  { id: 'orders', label: 'Orders', icon: <ClipboardList className="h-5 w-5" />, href: '/orders' },
  { id: 'stock', label: 'Inventory', icon: <Boxes className="h-5 w-5" />, href: '/inventory' },
  { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/settings/profile' },
];

const managerTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'orders', label: 'Orders', icon: <ClipboardList className="h-5 w-5" />, href: '/orders' },
  { id: 'team', label: 'Team', icon: <Users className="h-5 w-5" />, href: '/team' },
  { id: 'stock', label: 'Inventory', icon: <Boxes className="h-5 w-5" />, href: '/inventory' },
  { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/settings/profile' },
];

const runnerTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'dispatch', label: 'Dispatch', icon: <Inbox className="h-5 w-5" />, href: '/dispatch' },
  { id: 'finance', label: 'Finance', icon: <Boxes className="h-5 w-5" />, href: '/finance' },
  { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/settings/profile' },
];

const driverTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'delivery', label: 'Delivery', icon: <Truck className="h-5 w-5" />, href: '/delivery' },
  { id: 'stats', label: 'Stats', icon: <BarChart3 className="h-5 w-5" />, href: '/performance' },
  { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/settings/profile' },
];

const financeViewerTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'finance', label: 'Finance', icon: <Boxes className="h-5 w-5" />, href: '/finance' },
  { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/settings/profile' },
];

const runnerAssistantTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'dispatch', label: 'Dispatch', icon: <Inbox className="h-5 w-5" />, href: '/dispatch' },
  { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/settings/profile' },
];

const adminTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'orders', label: 'Orders', icon: <ClipboardList className="h-5 w-5" />, href: '/orders' },
  { id: 'stock', label: 'Inventory', icon: <Boxes className="h-5 w-5" />, href: '/inventory' },
  { id: 'system', label: 'System', icon: <Settings className="h-5 w-5" />, href: '/system' },
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
      case 'runner_assistant': return runnerAssistantTabs;
      case 'driver': return driverTabs;
      case 'finance_viewer': return financeViewerTabs;
      default: return salespersonTabs;
    }
  };

  const tabs = getTabs();

  const isActive = (href: string): boolean => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border/30 safe-area-pb shadow-lg">
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
