import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  ClipboardList,
  Boxes,
  Users,
  Settings,
  Inbox,
  Truck,
  BarChart3,
  MoreHorizontal,
  DollarSign,
  Trophy,
  GraduationCap,
  Send,
  UserCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { useLeaderboardSettings } from '@/hooks/useLeaderboard';
import { useMyAssistantBinding } from '@/hooks/useRunnerAssistants';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
  isMore?: boolean;
}

const salespersonTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'orders', label: 'Orders', icon: <ClipboardList className="h-5 w-5" />, href: '/orders' },
  { id: 'stock', label: 'Inventory', icon: <Boxes className="h-5 w-5" />, href: '/inventory' },
  { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/settings/profile', isMore: true },
];

const managerTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'orders', label: 'Orders', icon: <ClipboardList className="h-5 w-5" />, href: '/orders' },
  { id: 'team', label: 'Team', icon: <Users className="h-5 w-5" />, href: '/team' },
  { id: 'stock', label: 'Inventory', icon: <Boxes className="h-5 w-5" />, href: '/inventory' },
  { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/settings/profile', isMore: true },
];

const runnerTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'dispatch', label: 'Dispatch', icon: <Inbox className="h-5 w-5" />, href: '/dispatch' },
  { id: 'stock', label: 'Inventory', icon: <Boxes className="h-5 w-5" />, href: '/inventory' },
  { id: 'finance', label: 'Finance', icon: <DollarSign className="h-5 w-5" />, href: '/finance' },
  { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/settings/profile', isMore: true },
];

const driverTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'delivery', label: 'Delivery', icon: <Truck className="h-5 w-5" />, href: '/delivery' },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="h-5 w-5" />, href: '/delivery/analytics' },
  { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/settings/profile', isMore: true },
];

const financeViewerTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'finance', label: 'Finance', icon: <DollarSign className="h-5 w-5" />, href: '/finance' },
  { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/settings/profile', isMore: true },
];

const runnerAssistantTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'dispatch', label: 'Dispatch', icon: <Inbox className="h-5 w-5" />, href: '/dispatch' },
  { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/settings/profile', isMore: true },
];

const adminTabs: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
  { id: 'orders', label: 'Orders', icon: <ClipboardList className="h-5 w-5" />, href: '/orders' },
  { id: 'stock', label: 'Inventory', icon: <Boxes className="h-5 w-5" />, href: '/inventory' },
  { id: 'system', label: 'System', icon: <Settings className="h-5 w-5" />, href: '/system' },
  { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" />, href: '/settings/profile', isMore: true },
];

const allModules: Record<string, NavItem[]> = {
  admin: [
    { id: 'dashboard', label: 'Dashboard', icon: <Home className="h-5 w-5" />, href: '/' },
    { id: 'orders', label: 'Orders', icon: <ClipboardList className="h-5 w-5" />, href: '/orders' },
    { id: 'dispatch', label: 'Dispatch', icon: <Truck className="h-5 w-5" />, href: '/dispatch' },
    { id: 'performance', label: 'Performance', icon: <Trophy className="h-5 w-5" />, href: '/performance?tab=leaderboard' },
    { id: 'team', label: 'Team', icon: <Users className="h-5 w-5" />, href: '/team' },
    { id: 'finance', label: 'Finance', icon: <DollarSign className="h-5 w-5" />, href: '/finance' },
    { id: 'inventory', label: 'Inventory', icon: <Boxes className="h-5 w-5" />, href: '/inventory' },
    { id: 'system', label: 'System', icon: <Settings className="h-5 w-5" />, href: '/system' },
    { id: 'guide', label: 'Guide', icon: <GraduationCap className="h-5 w-5" />, href: '/guide' },
    { id: 'telegram', label: 'Telegram', icon: <Send className="h-5 w-5" />, href: '/settings/telegram' },
    { id: 'profile', label: 'Profile', icon: <UserCircle className="h-5 w-5" />, href: '/settings/profile' },
  ],
  manager: [
    { id: 'dashboard', label: 'Dashboard', icon: <Home className="h-5 w-5" />, href: '/' },
    { id: 'orders', label: 'Orders', icon: <ClipboardList className="h-5 w-5" />, href: '/orders' },
    { id: 'performance', label: 'Performance', icon: <Trophy className="h-5 w-5" />, href: '/performance?tab=leaderboard' },
    { id: 'team', label: 'Team', icon: <Users className="h-5 w-5" />, href: '/team' },
    { id: 'inventory', label: 'Inventory', icon: <Boxes className="h-5 w-5" />, href: '/inventory' },
    { id: 'guide', label: 'Guide', icon: <GraduationCap className="h-5 w-5" />, href: '/guide' },
    { id: 'telegram', label: 'Telegram', icon: <Send className="h-5 w-5" />, href: '/settings/telegram' },
    { id: 'profile', label: 'Profile', icon: <UserCircle className="h-5 w-5" />, href: '/settings/profile' },
  ],
  salesperson: [
    { id: 'dashboard', label: 'Dashboard', icon: <Home className="h-5 w-5" />, href: '/' },
    { id: 'orders', label: 'Orders', icon: <ClipboardList className="h-5 w-5" />, href: '/orders' },
    { id: 'performance', label: 'Performance', icon: <Trophy className="h-5 w-5" />, href: '/performance?tab=leaderboard' },
    { id: 'inventory', label: 'Inventory', icon: <Boxes className="h-5 w-5" />, href: '/inventory' },
    { id: 'claims', label: 'Claims', icon: <DollarSign className="h-5 w-5" />, href: '/finance?tab=claims' },
    { id: 'guide', label: 'Guide', icon: <GraduationCap className="h-5 w-5" />, href: '/guide' },
    { id: 'telegram', label: 'Telegram', icon: <Send className="h-5 w-5" />, href: '/settings/telegram' },
    { id: 'profile', label: 'Profile', icon: <UserCircle className="h-5 w-5" />, href: '/settings/profile' },
  ],
  runner: [
    { id: 'dashboard', label: 'Dashboard', icon: <Home className="h-5 w-5" />, href: '/' },
    { id: 'dispatch', label: 'Dispatch', icon: <Inbox className="h-5 w-5" />, href: '/dispatch' },
    { id: 'finance', label: 'Finance', icon: <DollarSign className="h-5 w-5" />, href: '/finance' },
    { id: 'inventory', label: 'Inventory', icon: <Boxes className="h-5 w-5" />, href: '/inventory' },
    { id: 'performance', label: 'Performance', icon: <Trophy className="h-5 w-5" />, href: '/performance' },
    { id: 'guide', label: 'Guide', icon: <GraduationCap className="h-5 w-5" />, href: '/guide' },
    { id: 'telegram', label: 'Telegram', icon: <Send className="h-5 w-5" />, href: '/settings/telegram' },
    { id: 'profile', label: 'Profile', icon: <UserCircle className="h-5 w-5" />, href: '/settings/profile' },
  ],
  driver: [
    { id: 'dashboard', label: 'Home', icon: <Home className="h-5 w-5" />, href: '/' },
    { id: 'delivery', label: 'Delivery', icon: <Truck className="h-5 w-5" />, href: '/delivery' },
    { id: 'pickups', label: 'Pickups', icon: <Boxes className="h-5 w-5" />, href: '/delivery/pickups' },
    { id: 'returns', label: 'Returns', icon: <ClipboardList className="h-5 w-5" />, href: '/delivery/returns' },
    { id: 'stock-on-hand', label: 'Stock on Hand', icon: <Boxes className="h-5 w-5" />, href: '/delivery/stock' },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="h-5 w-5" />, href: '/delivery/analytics' },
    { id: 'guide', label: 'Guide', icon: <GraduationCap className="h-5 w-5" />, href: '/guide' },
    { id: 'telegram', label: 'Telegram', icon: <Send className="h-5 w-5" />, href: '/settings/telegram' },
    { id: 'profile', label: 'Profile', icon: <UserCircle className="h-5 w-5" />, href: '/settings/profile' },
  ],
  finance_viewer: [
    { id: 'dashboard', label: 'Dashboard', icon: <Home className="h-5 w-5" />, href: '/' },
    { id: 'finance', label: 'Finance', icon: <DollarSign className="h-5 w-5" />, href: '/finance' },
    { id: 'guide', label: 'Guide', icon: <GraduationCap className="h-5 w-5" />, href: '/guide' },
    { id: 'profile', label: 'Profile', icon: <UserCircle className="h-5 w-5" />, href: '/settings/profile' },
  ],
  runner_assistant: [
    { id: 'dashboard', label: 'Dashboard', icon: <Home className="h-5 w-5" />, href: '/' },
    { id: 'dispatch', label: 'Dispatch', icon: <Inbox className="h-5 w-5" />, href: '/dispatch' },
    { id: 'guide', label: 'Guide', icon: <GraduationCap className="h-5 w-5" />, href: '/guide' },
    { id: 'profile', label: 'Profile', icon: <UserCircle className="h-5 w-5" />, href: '/settings/profile' },
  ],
};

export function BottomNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { data: leaderboardSettings } = useLeaderboardSettings();
  const { data: assistantBinding } = useMyAssistantBinding();
  const [moreOpen, setMoreOpen] = useState(false);
  const hidePerformanceUI = !!(
    leaderboardSettings?.filters_default as { hide_performance_ui?: boolean } | null
  )?.hide_performance_ui;

  const getTabs = (): NavItem[] => {
    switch (role) {
      case 'admin': return adminTabs;
      case 'manager': return managerTabs;
      case 'runner': return runnerTabs;
      case 'runner_assistant': return runnerAssistantTabs;
      case 'driver':
        return assistantBinding?.runner_id && (
          assistantBinding.can_deliver ||
          assistantBinding.can_confirm_receipt ||
          assistantBinding.can_manage_driver_inbox ||
          assistantBinding.can_manage_driver_stock ||
          assistantBinding.can_manage_cash_settlement ||
          assistantBinding.can_manage_driver_operations ||
          assistantBinding.can_view_driver_workload
        )
          ? [
              ...driverTabs.slice(0, -1),
              { id: 'dispatch', label: 'Dispatch', icon: <Inbox className="h-5 w-5" />, href: '/dispatch' },
              driverTabs[driverTabs.length - 1],
            ]
          : driverTabs;
      case 'finance_viewer': return financeViewerTabs;
      default: return salespersonTabs;
    }
  };

  const tabs = getTabs();
  const modules = useMemo(() => {
    const roleModules = allModules[role || 'salesperson'] || allModules.salesperson;
    const modulesWithAssistantAccess = [...roleModules];
    const hasAssistantDispatchAccess = Boolean(
      assistantBinding?.runner_id && (
        assistantBinding.can_deliver ||
        assistantBinding.can_confirm_receipt ||
        assistantBinding.can_manage_driver_inbox ||
        assistantBinding.can_manage_driver_stock ||
        assistantBinding.can_manage_cash_settlement ||
        assistantBinding.can_manage_driver_operations ||
        assistantBinding.can_view_driver_workload
      )
    );
    if (hasAssistantDispatchAccess && !modulesWithAssistantAccess.some((item) => item.href === '/dispatch')) {
      modulesWithAssistantAccess.push(
        { id: 'dispatch', label: 'Assistant Dispatch', icon: <Inbox className="h-5 w-5" />, href: '/dispatch' },
      );
    }
    if (
      assistantBinding?.runner_id &&
      (assistantBinding.can_view_stock_audit || assistantBinding.can_manage_inbound_stock) &&
      !modulesWithAssistantAccess.some((item) => item.href === '/inventory')
    ) {
      modulesWithAssistantAccess.push(
        { id: 'inventory', label: 'Assistant Inventory', icon: <Boxes className="h-5 w-5" />, href: '/inventory' },
      );
    }
    return modulesWithAssistantAccess.filter((item) => {
      if (item.href.startsWith('/performance') && hidePerformanceUI && role !== 'admin') return false;
      return true;
    });
  }, [assistantBinding, hidePerformanceUI, role]);

  const isActive = (href: string, id?: string): boolean => {
    if (href === '/') return location.pathname === '/';
    if (role === 'driver' && location.pathname.startsWith('/delivery')) {
      const activeTab = location.pathname.split('/')[2]
        || new URLSearchParams(location.search).get('tab')
        || 'inbox';
      if (id === 'analytics') return activeTab === 'analytics';
      if (id === 'delivery') return activeTab !== 'analytics';
    }
    return location.pathname.startsWith(href);
  };

  return (
    <>
      <nav className="mobile-bottom-dock fixed bottom-3 left-3 right-3 z-40 rounded-[2rem] p-1 safe-area-pb">
        <div className="mobile-bottom-dock-core flex h-[72px] items-center justify-around px-1">
          {tabs.map((tab) => {
            const active = tab.isMore ? moreOpen : isActive(tab.href, tab.id);
            const content = (
              <>
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
              </>
            );
            const className = cn(
              "group flex min-w-[58px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5",
              "mobile-motion transition-all duration-500 active:scale-[0.96]",
              active
                ? "text-[#b97823]"
                : "text-[#766f66] hover:text-[#171512]"
            );

            return tab.isMore ? (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMoreOpen(true)}
                className={className}
              >
                {content}
              </button>
            ) : (
              <Link
                key={tab.id}
                to={tab.href}
                className={className}
              >
                {content}
              </Link>
            );
          })}
        </div>
      </nav>

      <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerContent className="rounded-t-[2rem] border-[#e5dacb] bg-[#fffdf8] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <DrawerHeader className="px-5 pb-2 text-left">
            <DrawerTitle className="text-xl font-black text-[#171512]">All Modules</DrawerTitle>
            <DrawerDescription className="text-sm text-[#766f66]">
              Open every section available for your role.
            </DrawerDescription>
          </DrawerHeader>
          <div className="grid max-h-[62vh] grid-cols-3 gap-3 overflow-y-auto px-5 pb-4">
            {modules.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setMoreOpen(false);
                  navigate(item.href);
                }}
                className={cn(
                  "flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[1.35rem] border border-[#e4d9ca] bg-white p-3 text-center",
                  "shadow-[inset_0_1px_1px_rgba(255,255,255,0.95),0_10px_24px_rgba(113,78,31,0.07)] active:scale-[0.97]",
                  isActive(item.href) && "border-[#d09235] bg-[#fff7ea] text-[#b97823]"
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f4eadb] text-[#b97823]">
                  {item.icon}
                </div>
                <span className="text-[11px] font-bold leading-tight text-[#25221e]">{item.label}</span>
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
