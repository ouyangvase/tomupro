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
import { cn } from '@/lib/utils';
import { GlobalSearchBar } from '@/components/GlobalSearchBar';
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
} from 'lucide-react';

// Loading component for mobile
function MobileDashboardLoading() {
  return (
    <MobileLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading dashboard...</p>
      </div>
    </MobileLayout>
  );
}

// Stat tile for mobile grid
interface MobileStatTileProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  href: string;
  color?: 'default' | 'success' | 'warning' | 'destructive';
  isLoading?: boolean;
}

function MobileStatTile({ label, value, icon, href, color = 'default', isLoading }: MobileStatTileProps) {
  const navigate = useNavigate();
  
  const colorClasses = {
    default: 'border-border/50',
    success: 'border-status-success/30 bg-status-success/5',
    warning: 'border-status-warning/30 bg-status-warning/5',
    destructive: 'border-destructive/30 bg-destructive/5',
  };
  
  const valueColorClasses = {
    default: 'text-foreground',
    success: 'text-status-success',
    warning: 'text-status-warning',
    destructive: 'text-destructive',
  };

  return (
    <Card 
      className={cn("cursor-pointer active:scale-95 transition-transform", colorClasses[color])}
      onClick={() => navigate(href)}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="p-2 rounded-lg bg-muted/50">{icon}</div>
        </div>
        {isLoading ? (
          <Skeleton className="h-8 w-16 mb-1" />
        ) : (
          <p className={cn("text-2xl font-bold", valueColorClasses[color])}>{value}</p>
        )}
        <p className="text-xs text-muted-foreground truncate">{label}</p>
      </CardContent>
    </Card>
  );
}

// Salesperson Mobile Dashboard
function SalespersonMobileDashboard() {
  const { data: dashData, isLoading } = useSalespersonDashboard();
  const { data: actionStats } = useSalespersonActionRequiredStats();

  const quickActions: QuickAction[] = [
    { id: 'new-order', label: 'New Order', icon: <ShoppingCart className="h-5 w-5" />, href: '/sales/booking' },
    { id: 'booking', label: 'Booking', icon: <Package className="h-5 w-5" />, href: '/sales/booking' },
    { id: 'ready', label: 'Ready', icon: <Truck className="h-5 w-5" />, href: '/sales/ready' },
    { id: 'delivered', label: 'Delivered', icon: <CheckCircle className="h-5 w-5" />, href: '/sales/delivered' },
    { id: 'action', label: 'Actions', icon: <AlertTriangle className="h-5 w-5" />, href: '/sales/action-required', badge: actionStats?.total, badgeColor: 'warning' },
    { id: 'stock', label: 'Stock', icon: <Warehouse className="h-5 w-5" />, href: '/inventory' },
    { id: 'products', label: 'Products', icon: <PackageCheck className="h-5 w-5" />, href: '/products' },
    { id: 'claims', label: 'Claims', icon: <Receipt className="h-5 w-5" />, href: '/claims/history' },
  ];

  return (
    <div className="p-4 space-y-6">
      {/* Global Search Bar */}
      <GlobalSearchBar variant="mobile" />

      {/* Hero Summary - Today Sales */}
      <HeroSummaryCard
        title="Today Sales"
        value={dashData?.todaySalesAmount ?? 0}
        isCurrency
        subtitle={`${dashData?.todayDeliveredCount ?? 0} orders delivered`}
        viewAllLink="/sales/delivered"
        viewAllLabel="View Delivered"
        icon={<DollarSign className="h-5 w-5" />}
        isLoading={isLoading}
        accentColor="gold"
      />

      {/* Quick Actions */}
      <QuickActionsGrid actions={quickActions} columns={4} />

      {/* Key Stats Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Overview</h3>
        <div className="grid grid-cols-2 gap-3">
          <MobileStatTile
            label="Month Sales"
            value={formatBND(dashData?.mtdSalesAmount ?? 0)}
            icon={<TrendingUp className="h-4 w-4 text-status-success" />}
            href="/sales/delivered"
            color="success"
            isLoading={isLoading}
          />
          <MobileStatTile
            label="Commission"
            value={formatBND(dashData?.totalCommission ?? 0)}
            icon={<DollarSign className="h-4 w-4 text-primary" />}
            href="/"
            isLoading={isLoading}
          />
          <MobileStatTile
            label="Failed Orders"
            value={dashData?.failedOrdersCount ?? 0}
            icon={<XCircle className="h-4 w-4 text-destructive" />}
            href="/sales/action-required"
            color={(dashData?.failedOrdersCount ?? 0) > 0 ? 'destructive' : 'default'}
            isLoading={isLoading}
          />
          <MobileStatTile
            label="Pending Delivery"
            value={dashData?.pendingDeliveryCount ?? 0}
            icon={<Clock className="h-4 w-4 text-status-warning" />}
            href="/sales/ready"
            color={(dashData?.pendingDeliveryCount ?? 0) > 0 ? 'warning' : 'default'}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Target Progress */}
      {dashData?.monthlyTarget && (
        <Card className="border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Monthly Target</span>
              </div>
              <Badge variant="outline" className="text-primary">
                {(dashData.targetProgress ?? 0).toFixed(0)}%
              </Badge>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min(dashData.targetProgress ?? 0, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {dashData.targetType === 'ORDER_COUNT' 
                ? `${dashData.mtdDeliveredCount ?? 0} / ${dashData.monthlyTarget} orders`
                : `${formatBND(dashData.mtdSalesAmount ?? 0)} / ${formatBND(dashData.monthlyTarget)}`
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Manager Mobile Dashboard
function ManagerMobileDashboard() {
  const { data: dashData, isLoading } = useManagerDashboard('mtd');
  const { data: actionStats } = useManagerActionRequiredStats();

  const quickActions: QuickAction[] = [
    { id: 'team-booking', label: 'Booking', icon: <Package className="h-5 w-5" />, href: '/sales/booking', badge: dashData?.teamOverview.bookingOrders },
    { id: 'team-ready', label: 'Ready', icon: <Truck className="h-5 w-5" />, href: '/sales/ready', badge: dashData?.teamOverview.readyOrders },
    { id: 'team-delivered', label: 'Delivered', icon: <CheckCircle className="h-5 w-5" />, href: '/sales/delivered' },
    { id: 'oversight', label: 'Oversight', icon: <Users className="h-5 w-5" />, href: '/manager/oversight' },
    { id: 'action', label: 'Actions', icon: <AlertTriangle className="h-5 w-5" />, href: '/sales/action-required', badge: actionStats?.systemTotal, badgeColor: 'warning' },
    { id: 'stock', label: 'Stock', icon: <Warehouse className="h-5 w-5" />, href: '/inventory' },
    { id: 'approvals', label: 'Approvals', icon: <FileCheck className="h-5 w-5" />, href: '/manager/pending-approvals' },
    { id: 'ranking', label: 'Ranking', icon: <BarChart3 className="h-5 w-5" />, href: '/manager/ranking-board' },
  ];

  return (
    <div className="p-4 space-y-6">
      {/* Global Search Bar */}
      <GlobalSearchBar variant="mobile" />

      {/* Hero - Team GMV */}
      <HeroSummaryCard
        title="Team GMV (MTD)"
        value={dashData?.teamOverview.realizedGmv ?? 0}
        isCurrency
        subtitle={`${dashData?.teamOverview.deliveredOrders ?? 0} orders delivered`}
        viewAllLink="/manager/oversight"
        viewAllLabel="Team Oversight"
        icon={<TrendingUp className="h-5 w-5" />}
        isLoading={isLoading}
        accentColor="gold"
      />

      {/* Quick Actions */}
      <QuickActionsGrid actions={quickActions} columns={4} />

      {/* Team Stats */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Team Overview</h3>
        <div className="grid grid-cols-2 gap-3">
          <MobileStatTile
            label="Booking"
            value={dashData?.teamOverview.bookingOrders ?? 0}
            icon={<Package className="h-4 w-4 text-blue-500" />}
            href="/sales/booking"
            isLoading={isLoading}
          />
          <MobileStatTile
            label="Ready"
            value={dashData?.teamOverview.readyOrders ?? 0}
            icon={<Truck className="h-4 w-4 text-primary" />}
            href="/sales/ready"
            isLoading={isLoading}
          />
          <MobileStatTile
            label="Failed"
            value={actionStats?.failedDelivery ?? 0}
            icon={<XCircle className="h-4 w-4 text-destructive" />}
            href="/sales/action-required"
            color={(actionStats?.failedDelivery ?? 0) > 0 ? 'destructive' : 'default'}
            isLoading={isLoading}
          />
          <MobileStatTile
            label="Rescheduled"
            value={actionStats?.rescheduled ?? 0}
            icon={<Clock className="h-4 w-4 text-status-warning" />}
            href="/sales/action-required"
            color={(actionStats?.rescheduled ?? 0) > 0 ? 'warning' : 'default'}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}

// Runner Mobile Dashboard
function RunnerMobileDashboard() {
  const { data: stats, isLoading } = useRunnerDashboardStats();

  const quickActions: QuickAction[] = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox className="h-5 w-5" />, href: '/runner/inbox', badge: stats?.todayStats.inProgress },
    { id: 'delivered', label: 'Delivered', icon: <CheckCircle className="h-5 w-5" />, href: '/runner/delivered' },
    { id: 'failed', label: 'Failed', icon: <XCircle className="h-5 w-5" />, href: '/runner/failed', badge: stats?.blockerStats.failedOrdersCount, badgeColor: 'destructive' },
    { id: 'inbound', label: 'Inbound', icon: <Package className="h-5 w-5" />, href: '/runner/inbound' },
    { id: 'claims', label: 'Claims', icon: <Receipt className="h-5 w-5" />, href: '/runner/claim-batches' },
    { id: 'charges', label: 'Charges', icon: <DollarSign className="h-5 w-5" />, href: '/runner/delivery-charges' },
    { id: 'drivers', label: 'Drivers', icon: <Navigation className="h-5 w-5" />, href: '/runner/drivers' },
    { id: 'stock', label: 'Stock', icon: <Warehouse className="h-5 w-5" />, href: '/runner/allocated-stock' },
  ];

  return (
    <div className="p-4 space-y-6">
      {/* Global Search Bar */}
      <GlobalSearchBar variant="mobile" />

      {/* Hero - Assigned Jobs */}
      <HeroSummaryCard
        title="In Progress"
        value={stats?.todayStats.inProgress ?? 0}
        subtitle="Orders waiting for delivery"
        viewAllLink="/runner/inbox"
        viewAllLabel="View Inbox"
        icon={<Inbox className="h-5 w-5" />}
        isLoading={isLoading}
        accentColor="gold"
      />

      {/* Quick Actions */}
      <QuickActionsGrid actions={quickActions} columns={4} />

      {/* Stats Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Today's Stats</h3>
        <div className="grid grid-cols-2 gap-3">
          <MobileStatTile
            label="Delivered"
            value={stats?.todayStats.deliveredToday ?? 0}
            icon={<CheckCircle className="h-4 w-4 text-status-success" />}
            href="/runner/delivered"
            color="success"
            isLoading={isLoading}
          />
          <MobileStatTile
            label="Failed"
            value={stats?.todayStats.failedToday ?? 0}
            icon={<XCircle className="h-4 w-4 text-destructive" />}
            href="/runner/failed"
            color={(stats?.todayStats.failedToday ?? 0) > 0 ? 'destructive' : 'default'}
            isLoading={isLoading}
          />
          <MobileStatTile
            label="Pending Assign"
            value={stats?.todayStats.pendingAssignment ?? 0}
            icon={<Truck className="h-4 w-4 text-primary" />}
            href="/runner/inbox"
            isLoading={isLoading}
          />
          <MobileStatTile
            label="Pending Claims"
            value={stats?.earningsStats.pendingClaimCount ?? 0}
            icon={<Receipt className="h-4 w-4 text-status-warning" />}
            href="/runner/claim-batches"
            color={(stats?.earningsStats.pendingClaimCount ?? 0) > 0 ? 'warning' : 'default'}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}

// Driver Mobile Dashboard
function DriverMobileDashboard() {
  const quickActions: QuickAction[] = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox className="h-5 w-5" />, href: '/driver/inbox' },
    { id: 'route', label: 'Route', icon: <Navigation className="h-5 w-5" />, href: '/driver/route' },
    { id: 'pickups', label: 'Pickups', icon: <PackageCheck className="h-5 w-5" />, href: '/driver/pickups' },
    { id: 'returns', label: 'Returns', icon: <RotateCcw className="h-5 w-5" />, href: '/driver/returns' },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="h-5 w-5" />, href: '/driver/analytics' },
    { id: 'profile', label: 'Profile', icon: <Settings className="h-5 w-5" />, href: '/settings/profile' },
  ];

  return (
    <div className="p-4 space-y-6">
      {/* Global Search Bar */}
      <GlobalSearchBar variant="mobile" />

      {/* Hero */}
      <HeroSummaryCard
        title="Today's Deliveries"
        value={0}
        subtitle="Your delivery performance"
        viewAllLink="/driver/inbox"
        viewAllLabel="Start Delivering"
        icon={<Truck className="h-5 w-5" />}
        accentColor="gold"
      />

      {/* Quick Actions */}
      <QuickActionsGrid actions={quickActions} columns={3} />
    </div>
  );
}

// Admin Mobile Dashboard
function AdminMobileDashboard() {
  const { data: stats, isLoading } = useAdminStats();
  const { data: actionStats } = useAdminActionRequiredStats();

  const quickActions: QuickAction[] = [
    { id: 'orders', label: 'Orders', icon: <ShoppingCart className="h-5 w-5" />, href: '/sales/booking' },
    { id: 'users', label: 'Users', icon: <Users className="h-5 w-5" />, href: '/settings/users' },
    { id: 'stock', label: 'Stock', icon: <Warehouse className="h-5 w-5" />, href: '/inventory' },
    { id: 'products', label: 'Products', icon: <Package className="h-5 w-5" />, href: '/products' },
    { id: 'claims', label: 'Claims', icon: <Receipt className="h-5 w-5" />, href: '/admin/claim-batches' },
    { id: 'disputes', label: 'Disputes', icon: <AlertTriangle className="h-5 w-5" />, href: '/disputes', badge: stats?.disputes, badgeColor: 'warning' },
    { id: 'bindings', label: 'Bindings', icon: <Settings className="h-5 w-5" />, href: '/settings/bindings' },
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="h-5 w-5" />, href: '/admin/overview' },
  ];

  return (
    <div className="p-4 space-y-6">
      {/* Global Search Bar */}
      <GlobalSearchBar variant="mobile" />

      {/* Hero - System Overview */}
      <HeroSummaryCard
        title="Total Orders"
        value={(stats?.bookingOrders ?? 0) + (stats?.readyOrders ?? 0) + (stats?.deliveredOrders ?? 0)}
        subtitle="System-wide activity"
        viewAllLink="/admin/overview"
        viewAllLabel="View Overview"
        icon={<BarChart3 className="h-5 w-5" />}
        isLoading={isLoading}
        accentColor="gold"
      />

      {/* Quick Actions */}
      <QuickActionsGrid actions={quickActions} columns={4} />

      {/* Stats Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Action Required</h3>
        <div className="grid grid-cols-2 gap-3">
          <MobileStatTile
            label="Failed Deliveries"
            value={actionStats?.failedDelivery ?? 0}
            icon={<XCircle className="h-4 w-4 text-destructive" />}
            href="/sales/action-required"
            color={(actionStats?.failedDelivery ?? 0) > 0 ? 'destructive' : 'default'}
            isLoading={isLoading}
          />
          <MobileStatTile
            label="Disputes"
            value={stats?.disputes ?? 0}
            icon={<AlertTriangle className="h-4 w-4 text-status-warning" />}
            href="/disputes"
            color={(stats?.disputes ?? 0) > 0 ? 'warning' : 'default'}
            isLoading={isLoading}
          />
          <MobileStatTile
            label="Total Users"
            value={stats?.totalUsers ?? 0}
            icon={<Users className="h-4 w-4 text-primary" />}
            href="/settings/users"
            isLoading={isLoading}
          />
          <MobileStatTile
            label="Rescheduled"
            value={actionStats?.rescheduled ?? 0}
            icon={<Clock className="h-4 w-4 text-muted-foreground" />}
            href="/sales/action-required"
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}

// Main Mobile Dashboard Component
export function MobileDashboard() {
  const { role, profileStatus } = useAuth();
  
  useRealtimeUpdates();

  // CRITICAL: Show loading spinner while profile is being resolved
  // Never default to any role - wait for the actual role
  if (profileStatus === 'loading' || profileStatus === 'idle' || !role) {
    return <MobileDashboardLoading />;
  }

  const renderDashboard = () => {
    switch (role) {
      case 'driver':
        return <DriverMobileDashboard />;
      case 'runner':
        return <RunnerMobileDashboard />;
      case 'admin':
        return <AdminMobileDashboard />;
      case 'manager':
        return <ManagerMobileDashboard />;
      case 'salesperson':
        return <SalespersonMobileDashboard />;
      // No default case - all roles are explicitly handled
    }
  };

  return (
    <MobileLayout>
      {renderDashboard()}
    </MobileLayout>
  );
}
