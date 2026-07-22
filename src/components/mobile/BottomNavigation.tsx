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
  { id: 'stock', label: 'Inventory', icon: <Boxes className="h-5 w-5" />, href: '/inventory' },
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
    <nav className="mobile-bottom-dock fixed bottom-3 left-3 right-3 z-40 rounded-[2rem] p-1 safe-area-pb">
      <div className="mobile-bottom-dock-core flex h-[72px] items-center justify-around px-1">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.href)}
              className={cn(
                "group flex min-w-[58px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5",
                "mobile-motion transition-all duration-500 active:scale-[0.96]",
                active
                  ? "text-[#b97823]"
                  : "text-[#766f66] hover:text-[#171512]"
              )}
            >
              <div className={cn(
                "mobile-motion flex h-9 w-9 items-center justify-center rounded-2xl transition-all duration-500",
                active
                  ? "bg-[#f2e4cf] shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_8px_18px_rgba(160,101,28,0.14)]"
                  : "bg-transparent group-active:bg-[#f4efe7]"
              )}>
                {tab.icon}
              </div>
              <span className={cn(
                "max-w-[64px] truncate text-[10px] font-semibold leading-none transition-colors",
                active && "text-[#b97823]"
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
