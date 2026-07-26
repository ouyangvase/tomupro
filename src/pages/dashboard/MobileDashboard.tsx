import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSalespersonDashboard } from '@/hooks/useSalespersonDashboard';
import { useRunnerDashboardStats } from '@/hooks/useRunnerDashboardStats';
import { useManagerDashboard } from '@/hooks/useManagerDashboard';
import { useAdminStats } from '@/hooks/useDashboardStats';
import { 
  useSalespersonActionRequiredStats,
  useAdminActionRequiredStats,
  useManagerActionRequiredStats 
} from '@/hooks/useActionRequiredStats';
import { MobileLayout } from '@/components/mobile/MobileLayout';
import { HeroSummaryCard } from '@/components/mobile/HeroSummaryCard';
import { QuickActionsGrid, QuickAction } from '@/components/mobile/QuickActionsGrid';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBND } from '@/lib/currency';
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';
import { useLeaderboardSettings } from '@/hooks/useLeaderboard';
import { useDriverAssignments } from '@/hooks/useDriverAssignments';
import { cn } from '@/lib/utils';
import { getTodayDateKey } from '@/lib/driverOrderScope';
import { GlobalSearchBar } from '@/components/GlobalSearchBar';
import capybaraAdmin from '@/assets/capybara-admin.png';
import capybaraRunner from '@/assets/capybara-runner.png';
import capybaraDriver from '@/assets/capybara-driver.png';
import capybaraSales from '@/assets/capybara-sales.png';
import capybaraManager from '@/assets/capybara-manager.png';
import capybaraLoading from '@/assets/capybara-loading.png';
import {
  ShoppingCart,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Inbox,
  Receipt,
  Users,
  Settings,
  Target,
  BarChart3,
  Navigation,
  Clock,
  PackageCheck,
  Warehouse,
  FileCheck,
  DollarSign,
  TrendingUp,
  RotateCcw,
  Loader2,
  ArrowRight,
  Zap,
  Trophy,
} from 'lucide-react';

// Loading component
function MobileDashboardLoading() {
  return (
    <MobileLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-4">
        <img src={capybaraLoading} alt="Loading" className="h-24 w-24 object-contain opacity-60 animate-pulse" />
        <p className="text-muted-foreground font-medium">Loading dashboard...</p>
      </div>
    </MobileLayout>
  );
}

// Alert card for urgent items
interface AlertCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  href: string;
  severity: 'error' | 'warning' | 'info';
}

function AlertCard({ label, value, icon, href, severity }: AlertCardProps) {
  const navigate = useNavigate();
  if (value === 0) return null;

  const colors = {
    error: 'border-[hsl(var(--status-error)/0.3)] bg-[hsl(var(--status-error)/0.06)]',
    warning: 'border-[hsl(var(--status-warning)/0.3)] bg-[hsl(var(--status-warning)/0.06)]',
    info: 'border-primary/20 bg-primary/5',
  };
  const textColors = {
    error: 'text-[hsl(var(--status-error))]',
    warning: 'text-[hsl(var(--status-warning))]',
    info: 'text-primary',
  };

  return (
    <button
      onClick={() => navigate(href)}
      className={cn(
        'mobile-motion flex w-full items-center gap-3 rounded-[1.55rem] border p-3.5 text-left shadow-[inset_0_1px_1px_rgba(255,255,255,0.95),0_10px_26px_rgba(113,78,31,0.06)] transition-all duration-500 active:scale-[0.98]',
        colors[severity]
      )}
    >
      <div className={cn('rounded-2xl bg-card/70 p-2', textColors[severity])}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-2xl font-extrabold tabular-nums', textColors[severity])}>{value}</p>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
    </button>
  );
}

// Pipeline progress bar
interface PipelineProps {
  stages: { label: string; value: number; color: string }[];
}

function OperationsPipeline({ stages }: PipelineProps) {
  const total = stages.reduce((sum, s) => sum + s.value, 0) || 1;

  return (
    <div className="rounded-[1.75rem] border border-[#e5dacb] bg-[#fffdf8] p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.95),0_12px_34px_rgba(113,78,31,0.06)]">
      <h3 className="text-base font-black text-[#171512]">Operations Pipeline</h3>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-[#eee5d9]">
        {stages.map((stage, i) => (
          <div
            key={stage.label}
            className={cn('h-full transition-all', stage.color, i === 0 && 'rounded-l-full', i === stages.length - 1 && 'rounded-r-full')}
            style={{ width: `${Math.max((stage.value / total) * 100, 2)}%` }}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {stages.map((stage) => (
          <div key={stage.label} className="text-center">
            <p className="text-lg font-black tabular-nums text-[#171512]">{stage.value}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a8174]">{stage.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Metric card for horizontal scroll
interface MetricCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  isLoading?: boolean;
}

function MetricCard({ label, value, icon, isLoading }: MetricCardProps) {
  return (
    <div className="min-w-[150px] shrink-0 rounded-[1.55rem] border border-[#e5dacb] bg-[#fffdf8] p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.95),0_10px_26px_rgba(113,78,31,0.06)]">
      <div className="mb-2 flex items-center gap-2">
        <div className="rounded-2xl bg-[#f4eadb] p-2 text-[#b97823]">{icon}</div>
      </div>
      {isLoading ? (
        <Skeleton className="h-7 w-16 mb-1" />
      ) : (
        <p className="text-xl font-black tabular-nums text-[#171512]">{value}</p>
      )}
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a8174]">{label}</p>
    </div>
  );
}

// ===== ADMIN DASHBOARD =====
function AdminMobileDashboard() {
  const { profile } = useAuth();
  const { data: stats, isLoading } = useAdminStats();
  const { data: actionStats } = useAdminActionRequiredStats();

  const totalOrders = (stats?.bookingOrders ?? 0) + (stats?.readyOrders ?? 0) + (stats?.deliveredOrders ?? 0);

  const quickActions: QuickAction[] = [
    { id: 'orders', label: 'Orders', icon: <ShoppingCart className="h-5 w-5" />, href: '/orders' },
    { id: 'finance', label: 'Finance', icon: <DollarSign className="h-5 w-5" />, href: '/finance' },
    { id: 'performance', label: 'Performance', icon: <Trophy className="h-5 w-5" />, href: '/performance?tab=leaderboard' },
    { id: 'users', label: 'Users', icon: <Users className="h-5 w-5" />, href: '/team?tab=users' },
    { id: 'stock', label: 'Stock', icon: <Warehouse className="h-5 w-5" />, href: '/inventory' },
    { id: 'products', label: 'Products', icon: <Package className="h-5 w-5" />, href: '/inventory?tab=products' },
    { id: 'claims', label: 'Claims', icon: <Receipt className="h-5 w-5" />, href: '/finance?tab=claims' },
    { id: 'system', label: 'System', icon: <Settings className="h-5 w-5" />, href: '/system' },
  ];

  const pipelineStages = [
    { label: 'Booking', value: stats?.bookingOrders ?? 0, color: 'bg-[hsl(var(--status-pending))]' },
    { label: 'Ready', value: stats?.readyOrders ?? 0, color: 'bg-primary' },
    { label: 'Dispatch', value: stats?.pendingDelivery ?? 0, color: 'bg-[hsl(var(--status-success))]' },
    { label: 'Delivered', value: stats?.deliveredOrders ?? 0, color: 'bg-[hsl(200_60%_50%)]' },
  ];

  return (
    <div className="p-4 space-y-6">
      {/* Hero */}
      <HeroSummaryCard
        title="Total Orders"
        value={totalOrders}
        subtitle="System-wide activity"
        viewAllLink="/finance?tab=overview"
        viewAllLabel="View Overview"
        icon={<BarChart3 className="h-5 w-5" />}
        isLoading={isLoading}
        accentColor="gold"
        illustration={capybaraAdmin}
        greeting={`Hello, ${profile?.display_name?.split(' ')[0] || 'Admin'}`}
        greetingSubtitle="Command Center · Monitor operations and keep the system moving."
      />

      {/* Alerts */}
      {((actionStats?.failedDelivery ?? 0) > 0) && (
        <div className="space-y-3">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Zap className="h-4 w-4 text-[hsl(var(--status-error))]" />
            Action Required
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <AlertCard label="Failed Deliveries" value={actionStats?.failedDelivery ?? 0} icon={<XCircle className="h-4 w-4" />} href="/sales/action-required" severity="error" />
          </div>
        </div>
      )}

      {/* Metrics scroll */}
      <div className="space-y-3">
        <h3 className="text-base font-bold text-foreground">Key Metrics</h3>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
          <MetricCard label="Booking" value={stats?.bookingOrders ?? 0} icon={<ShoppingCart className="h-4 w-4" />} isLoading={isLoading} />
          <MetricCard label="Delivered" value={stats?.deliveredOrders ?? 0} icon={<CheckCircle className="h-4 w-4" />} isLoading={isLoading} />
          <MetricCard label="Pending" value={stats?.readyOrders ?? 0} icon={<Clock className="h-4 w-4" />} isLoading={isLoading} />
          <MetricCard label="Total Users" value={stats?.totalUsers ?? 0} icon={<Users className="h-4 w-4" />} isLoading={isLoading} />
        </div>
      </div>

      {/* Pipeline */}
      <OperationsPipeline stages={pipelineStages} />

      {/* Quick Actions */}
      <QuickActionsGrid actions={quickActions} columns={4} />
    </div>
  );
}

// ===== SALESPERSON DASHBOARD =====
function SalespersonMobileDashboard() {
  const { profile } = useAuth();
  const { data: dashData, isLoading } = useSalespersonDashboard();
  const { data: actionStats } = useSalespersonActionRequiredStats();
  const { data: leaderboardSettings } = useLeaderboardSettings();
  const showPerformanceAction = !(
    leaderboardSettings?.filters_default as { hide_performance_ui?: boolean } | null
  )?.hide_performance_ui;

  const quickActions: QuickAction[] = [
    { id: 'new-order', label: 'New Order', icon: <ShoppingCart className="h-5 w-5" />, href: '/orders?tab=booking' },
    { id: 'booking', label: 'Booking', icon: <Package className="h-5 w-5" />, href: '/orders?tab=booking' },
    { id: 'ready', label: 'Ready', icon: <Truck className="h-5 w-5" />, href: '/orders?tab=ready' },
    { id: 'delivered', label: 'Delivered', icon: <CheckCircle className="h-5 w-5" />, href: '/orders?tab=delivered' },
    { id: 'action', label: 'Actions', icon: <AlertTriangle className="h-5 w-5" />, href: '/orders?tab=action-required', badge: actionStats?.total, badgeColor: 'warning' },
    ...(showPerformanceAction ? [{ id: 'performance', label: 'Performance', icon: <Trophy className="h-5 w-5" />, href: '/performance?tab=leaderboard' }] : []),
    { id: 'stock', label: 'Stock', icon: <Warehouse className="h-5 w-5" />, href: '/inventory' },
    { id: 'products', label: 'Products', icon: <PackageCheck className="h-5 w-5" />, href: '/inventory?tab=products' },
    { id: 'claims', label: 'Claims', icon: <Receipt className="h-5 w-5" />, href: '/finance?tab=claims' },
  ];

  return (
    <div className="p-4 space-y-6">
      <HeroSummaryCard
        title="Today Sales"
        value={dashData?.todaySalesAmount ?? 0}
        isCurrency
        subtitle={`${dashData?.todayDeliveredCount ?? 0} orders delivered`}
        viewAllLink="/orders?tab=delivered"
        viewAllLabel="View Delivered"
        icon={<DollarSign className="h-5 w-5" />}
        isLoading={isLoading}
        accentColor="gold"
        illustration={capybaraSales}
        greeting={`Hello, ${profile?.display_name?.split(' ')[0] || 'User'}`}
        greetingSubtitle="Sales Dashboard · Track your performance today."
      />

      {/* Metrics scroll */}
      <div className="space-y-3">
        <h3 className="text-base font-bold text-foreground">Key Metrics</h3>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
          <MetricCard label="Month Sales" value={formatBND(dashData?.mtdSalesAmount ?? 0)} icon={<TrendingUp className="h-4 w-4" />} isLoading={isLoading} />
          <MetricCard label="Commission" value={formatBND(dashData?.totalCommission ?? 0)} icon={<DollarSign className="h-4 w-4" />} isLoading={isLoading} />
          <MetricCard label="Failed" value={dashData?.failedOrdersCount ?? 0} icon={<XCircle className="h-4 w-4" />} isLoading={isLoading} />
          <MetricCard label="Pending" value={dashData?.pendingDeliveryCount ?? 0} icon={<Clock className="h-4 w-4" />} isLoading={isLoading} />
        </div>
      </div>

      <QuickActionsGrid actions={quickActions} columns={4} />

      {/* Target Progress */}
      {dashData?.monthlyTarget && (
        <Card className="border-primary/20 rounded-2xl overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold">Monthly Target</span>
              </div>
              <Badge variant="outline" className="text-primary font-bold">
                {(dashData.targetProgress ?? 0).toFixed(0)}%
              </Badge>
            </div>
            <div className="h-3 bg-secondary/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min(dashData.targetProgress ?? 0, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {dashData.targetType === 'ORDER_COUNT'
                ? `${dashData.mtdDeliveredCount ?? 0} / ${dashData.monthlyTarget} orders`
                : `${formatBND(dashData.mtdSalesAmount ?? 0)} / ${formatBND(dashData.monthlyTarget)}`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ===== MANAGER DASHBOARD =====
function ManagerMobileDashboard() {
  const { profile } = useAuth();
  const { data: dashData, isLoading } = useManagerDashboard('mtd');
  const { data: actionStats } = useManagerActionRequiredStats();
  const { data: leaderboardSettings } = useLeaderboardSettings();
  const showPerformanceAction = !(
    leaderboardSettings?.filters_default as { hide_performance_ui?: boolean } | null
  )?.hide_performance_ui;

  const quickActions: QuickAction[] = [
    { id: 'team-booking', label: 'Booking', icon: <Package className="h-5 w-5" />, href: '/orders?tab=booking', badge: dashData?.teamOverview.bookingOrders },
    { id: 'team-ready', label: 'Ready', icon: <Truck className="h-5 w-5" />, href: '/orders?tab=ready', badge: dashData?.teamOverview.readyOrders },
    { id: 'team-delivered', label: 'Delivered', icon: <CheckCircle className="h-5 w-5" />, href: '/orders?tab=delivered' },
    { id: 'oversight', label: 'Oversight', icon: <Users className="h-5 w-5" />, href: '/team?tab=oversight' },
    { id: 'action', label: 'Actions', icon: <AlertTriangle className="h-5 w-5" />, href: '/orders?tab=action-required', badge: actionStats?.systemTotal, badgeColor: 'warning' },
    ...(showPerformanceAction ? [{ id: 'performance', label: 'Performance', icon: <Trophy className="h-5 w-5" />, href: '/performance?tab=leaderboard' }] : []),
    { id: 'stock', label: 'Stock', icon: <Warehouse className="h-5 w-5" />, href: '/inventory' },
    { id: 'approvals', label: 'Approvals', icon: <FileCheck className="h-5 w-5" />, href: '/team?tab=approvals' },
  ];

  return (
    <div className="p-4 space-y-6">
      <HeroSummaryCard
        title="Team GMV (MTD)"
        value={dashData?.teamOverview.realizedGmv ?? 0}
        isCurrency
        subtitle={`${dashData?.teamOverview.deliveredOrders ?? 0} orders delivered`}
        viewAllLink="/team?tab=oversight"
        viewAllLabel="Team Oversight"
        icon={<TrendingUp className="h-5 w-5" />}
        isLoading={isLoading}
        accentColor="gold"
        illustration={capybaraManager}
        greeting={`Hello, ${profile?.display_name?.split(' ')[0] || 'Manager'}`}
        greetingSubtitle="Manager Dashboard · Your team at a glance."
      />

      {((actionStats?.failedDelivery ?? 0) > 0 || (actionStats?.rescheduled ?? 0) > 0) && (
        <div className="space-y-3">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Zap className="h-4 w-4 text-[hsl(var(--status-error))]" />
            Action Required
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <AlertCard label="Failed Deliveries" value={actionStats?.failedDelivery ?? 0} icon={<XCircle className="h-4 w-4" />} href="/orders?tab=action-required" severity="error" />
            <AlertCard label="Rescheduled" value={actionStats?.rescheduled ?? 0} icon={<Clock className="h-4 w-4" />} href="/orders?tab=action-required" severity="warning" />
          </div>
        </div>
      )}

      <QuickActionsGrid actions={quickActions} columns={4} />

      <div className="space-y-3">
        <h3 className="text-base font-bold text-foreground">Key Metrics</h3>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
          <MetricCard label="Booking" value={dashData?.teamOverview.bookingOrders ?? 0} icon={<Package className="h-4 w-4" />} isLoading={isLoading} />
          <MetricCard label="Ready" value={dashData?.teamOverview.readyOrders ?? 0} icon={<Truck className="h-4 w-4" />} isLoading={isLoading} />
          <MetricCard label="Delivered" value={dashData?.teamOverview.deliveredOrders ?? 0} icon={<CheckCircle className="h-4 w-4" />} isLoading={isLoading} />
          <MetricCard label="Failed" value={actionStats?.failedDelivery ?? 0} icon={<XCircle className="h-4 w-4" />} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}

// ===== RUNNER DASHBOARD =====
function RunnerMobileDashboard() {
  const { profile } = useAuth();
  const { data: stats, isLoading } = useRunnerDashboardStats();

  const quickActions: QuickAction[] = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox className="h-5 w-5" />, href: '/dispatch?tab=inbox', badge: stats?.todayStats.inProgress },
    { id: 'delivered', label: 'Delivered', icon: <CheckCircle className="h-5 w-5" />, href: '/orders?tab=delivered' },
    { id: 'failed', label: 'Failed', icon: <XCircle className="h-5 w-5" />, href: '/dispatch?tab=failed', badge: stats?.blockerStats.failedOrdersCount, badgeColor: 'destructive' },
    { id: 'inbound', label: 'Inbound', icon: <Package className="h-5 w-5" />, href: '/inventory?tab=inbound' },
    { id: 'claims', label: 'Claims', icon: <Receipt className="h-5 w-5" />, href: '/finance?tab=my-claims' },
    { id: 'charges', label: 'Charges', icon: <DollarSign className="h-5 w-5" />, href: '/finance?tab=delivery-charges' },
    { id: 'drivers', label: 'Drivers', icon: <Navigation className="h-5 w-5" />, href: '/dispatch?tab=drivers' },
    { id: 'stock', label: 'Stock', icon: <Warehouse className="h-5 w-5" />, href: '/dispatch?tab=driver-stock' },
  ];

  const pipelineStages = [
    { label: 'Pending', value: stats?.todayStats.pendingAssignment ?? 0, color: 'bg-[hsl(var(--status-warning))]' },
    { label: 'In Progress', value: stats?.todayStats.inProgress ?? 0, color: 'bg-primary' },
    { label: 'Delivered', value: stats?.todayStats.deliveredToday ?? 0, color: 'bg-[hsl(var(--status-success))]' },
    { label: 'Failed', value: stats?.todayStats.failedToday ?? 0, color: 'bg-[hsl(var(--status-error))]' },
  ];

  return (
    <div className="p-4 space-y-6">
      <HeroSummaryCard
        title="In Progress"
        value={stats?.todayStats.inProgress ?? 0}
        subtitle="Orders waiting for delivery"
        viewAllLink="/dispatch?tab=inbox"
        viewAllLabel="View Inbox"
        icon={<Inbox className="h-5 w-5" />}
        isLoading={isLoading}
        accentColor="gold"
        illustration={capybaraRunner}
        greeting={`Hello, ${profile?.display_name?.split(' ')[0] || 'Runner'}`}
        greetingSubtitle="Dispatch Center · Manage your operations."
      />

      {((stats?.blockerStats.failedOrdersCount ?? 0) > 0 || (stats?.earningsStats.pendingClaimCount ?? 0) > 0) && (
        <div className="space-y-3">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Zap className="h-4 w-4 text-[hsl(var(--status-error))]" />
            Action Required
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <AlertCard label="Failed Orders" value={stats?.blockerStats.failedOrdersCount ?? 0} icon={<XCircle className="h-4 w-4" />} href="/dispatch?tab=failed" severity="error" />
            <AlertCard label="Pending Claims" value={stats?.earningsStats.pendingClaimCount ?? 0} icon={<Receipt className="h-4 w-4" />} href="/finance?tab=my-claims" severity="warning" />
          </div>
        </div>
      )}

      <OperationsPipeline stages={pipelineStages} />

      <QuickActionsGrid actions={quickActions} columns={4} />

      <div className="space-y-3">
        <h3 className="text-base font-bold text-foreground">Key Metrics</h3>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
          <MetricCard label="Delivered Today" value={stats?.todayStats.deliveredToday ?? 0} icon={<CheckCircle className="h-4 w-4" />} isLoading={isLoading} />
          <MetricCard label="Failed Today" value={stats?.todayStats.failedToday ?? 0} icon={<XCircle className="h-4 w-4" />} isLoading={isLoading} />
          <MetricCard label="Pending Assign" value={stats?.todayStats.pendingAssignment ?? 0} icon={<Truck className="h-4 w-4" />} isLoading={isLoading} />
          <MetricCard label="Claims" value={stats?.earningsStats.pendingClaimCount ?? 0} icon={<Receipt className="h-4 w-4" />} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}

// ===== DRIVER DASHBOARD =====
function DriverMobileDashboard() {
  const { profile, user } = useAuth();
  const effectiveDriverId = profile?.id || user?.id;
  const { data: activeJobs = [], isLoading } = useDriverAssignments({
    driverId: effectiveDriverId,
    dateTo: getTodayDateKey(),
    activeOnly: true,
    includeItems: false,
  });

  const quickActions: QuickAction[] = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox className="h-5 w-5" />, href: '/delivery?tab=inbox', badge: activeJobs.length },
    { id: 'route', label: 'Route', icon: <Navigation className="h-5 w-5" />, href: '/delivery?tab=route' },
    { id: 'pickups', label: 'Pickups', icon: <PackageCheck className="h-5 w-5" />, href: '/delivery?tab=pickups' },
    { id: 'returns', label: 'Returns', icon: <RotateCcw className="h-5 w-5" />, href: '/delivery?tab=returns' },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="h-5 w-5" />, href: '/delivery?tab=analytics' },
    { id: 'profile', label: 'Profile', icon: <Settings className="h-5 w-5" />, href: '/settings/profile' },
  ];

  return (
    <div className="p-4 space-y-6">
      <HeroSummaryCard
        title="Today's Deliveries"
        value={activeJobs.length}
        subtitle="Active jobs waiting"
        viewAllLink="/delivery?tab=inbox"
        viewAllLabel="Start Delivering"
        icon={<Truck className="h-5 w-5" />}
        isLoading={isLoading}
        accentColor="gold"
        illustration={capybaraDriver}
        greeting={`Hello, ${profile?.display_name?.split(' ')[0] || 'Driver'}`}
        greetingSubtitle="Driver Dashboard · Hit the road and deliver."
      />

      <QuickActionsGrid actions={quickActions} columns={3} />
    </div>
  );
}

// ===== MAIN =====
export function MobileDashboard() {
  const { role, profileStatus } = useAuth();
  
  useRealtimeUpdates();

  if (profileStatus === 'loading' || profileStatus === 'idle' || !role) {
    return <MobileDashboardLoading />;
  }

  const renderDashboard = () => {
    switch (role) {
      case 'driver': return <DriverMobileDashboard />;
      case 'runner': return <RunnerMobileDashboard />;
      case 'admin': return <AdminMobileDashboard />;
      case 'manager': return <ManagerMobileDashboard />;
      case 'salesperson': return <SalespersonMobileDashboard />;
    }
  };

  return (
    <MobileLayout>
      {renderDashboard()}
    </MobileLayout>
  );
}
