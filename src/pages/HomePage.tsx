import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileAppLayout } from '@/components/layout/MobileAppLayout';
import { AppLayout } from '@/components/layout/AppLayout';
import { HeroSummaryCard, QuickActionsGrid, SectionHeader, MobileListCard, type QuickAction } from '@/components/mobile';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ShoppingCart, 
  Package, 
  Truck, 
  FileCheck, 
  AlertTriangle, 
  BarChart3,
  CheckCircle,
  XCircle,
  Users,
  Receipt,
  Inbox,
  DollarSign,
  ClipboardList,
  PackageCheck,
  Settings,
  ArrowRight,
  Clock,
  TrendingUp,
  AlertCircle,
  Warehouse,
  Shield,
  UserCog,
} from 'lucide-react';
import { useSalespersonDashboard } from '@/hooks/useSalespersonDashboard';
import { useRunnerDashboardStats } from '@/hooks/useRunnerDashboardStats';
import { useAdminStats } from '@/hooks/useDashboardStats';
import { formatBND } from '@/lib/currency';
import { Button } from '@/components/ui/button';

// Salesperson Quick Actions
const salespersonActions: QuickAction[] = [
  { icon: ClipboardList, label: 'Booking', href: '/sales/booking' },
  { icon: Package, label: 'Ready Sales', href: '/sales/ready' },
  { icon: CheckCircle, label: 'Delivered', href: '/reconciliation/sp' },
  { icon: AlertTriangle, label: 'Action Required', href: '/sales/action-required' },
  { icon: BarChart3, label: 'Stock', href: '/inventory' },
  { icon: ShoppingCart, label: 'Products', href: '/products' },
  { icon: XCircle, label: 'Cancelled', href: '/sales/cancelled' },
  { icon: Receipt, label: 'Claims', href: '/claims' },
];

// Manager Quick Actions
const managerActions: QuickAction[] = [
  { icon: Users, label: 'Team Oversight', href: '/manager/oversight' },
  { icon: Package, label: 'Team Orders', href: '/sales/ready' },
  { icon: AlertTriangle, label: 'Action Required', href: '/sales/action-required' },
  { icon: BarChart3, label: 'Stock Balance', href: '/inventory' },
  { icon: ShoppingCart, label: 'Products', href: '/products' },
  { icon: Shield, label: 'Disputes', href: '/disputes' },
  { icon: PackageCheck, label: 'Approvals', href: '/manager/pending-approvals' },
  { icon: TrendingUp, label: 'Impact Board', href: '/manager/impact-board' },
];

// Runner Quick Actions
const runnerActions: QuickAction[] = [
  { icon: Inbox, label: 'Inbox', href: '/runner/inbox' },
  { icon: Truck, label: 'Driver Inbox', href: '/runner/driver-inbox' },
  { icon: CheckCircle, label: 'Delivered', href: '/runner/delivered-orders' },
  { icon: XCircle, label: 'Failed', href: '/runner/failed-orders' },
  { icon: Package, label: 'Inbound', href: '/runner/inbound' },
  { icon: Receipt, label: 'Claims', href: '/runner/claims' },
  { icon: DollarSign, label: 'Delivery Fees', href: '/runner/delivery-charges' },
  { icon: Users, label: 'Drivers', href: '/runner/drivers' },
];

// Driver Quick Actions
const driverActions: QuickAction[] = [
  { icon: Inbox, label: 'Inbox', href: '/driver/inbox' },
  { icon: Truck, label: 'Route', href: '/driver/route' },
  { icon: Package, label: 'Pickups', href: '/driver/pickups' },
  { icon: PackageCheck, label: 'Returns', href: '/driver/returns' },
  { icon: BarChart3, label: 'Analytics', href: '/driver/analytics' },
  { icon: TrendingUp, label: 'Ranking', href: '/driver/ranking' },
];

// Admin Quick Actions
const adminActions: QuickAction[] = [
  { icon: Users, label: 'Users', href: '/settings/users' },
  { icon: Package, label: 'Orders', href: '/admin/runner-inbox' },
  { icon: Receipt, label: 'Claims', href: '/admin/claim-batches' },
  { icon: Shield, label: 'Disputes', href: '/disputes' },
  { icon: Warehouse, label: 'Warehouses', href: '/admin/warehouses' },
  { icon: Settings, label: 'Reasons', href: '/settings/reasons' },
  { icon: UserCog, label: 'Bindings', href: '/settings/bindings' },
  { icon: DollarSign, label: 'Delivery Fees', href: '/admin/delivery-charges' },
];

// Salesperson Home Content
function SalespersonHome() {
  const navigate = useNavigate();
  const { data: dashData, isLoading } = useSalespersonDashboard();

  return (
    <div className="space-y-6">
      {/* Hero Summary Card */}
      <HeroSummaryCard
        title="This Month Profit"
        subtitle={new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        value={isLoading ? '...' : formatBND(dashData?.mtdSalesAmount ?? 0)}
        isLoading={isLoading}
        linkText="View All Accounts"
        onLinkClick={() => navigate('/reconciliation/sp')}
        showPrivacyToggle
      />

      {/* Quick Actions */}
      <QuickActionsGrid 
        actions={salespersonActions}
        showViewAll={false}
      />

      {/* Action Required Section */}
      {(dashData?.failedOrdersCount ?? 0) > 0 && (
        <div className="space-y-3">
          <SectionHeader title="Action Required" />
          <Card 
            className="border-destructive/30 bg-destructive/5 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate('/sales/action-required')}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-destructive/10">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="font-semibold">Failed Orders</p>
                  <p className="text-sm text-muted-foreground">
                    {dashData?.failedOrdersCount} orders need attention
                  </p>
                </div>
              </div>
              <Button size="sm" variant="destructive">
                Resolve
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stats Cards */}
      <div className="space-y-3">
        <SectionHeader title="Today's Summary" />
        <div className="grid grid-cols-2 gap-3">
          <Card className="mobile-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Today Sales</p>
              {isLoading ? (
                <Skeleton className="h-8 w-20 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-primary">
                  {formatBND(dashData?.todaySalesAmount ?? 0)}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="mobile-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Delivered</p>
              {isLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-[hsl(var(--status-success))]">
                  {dashData?.todayDeliveredCount ?? 0}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="mobile-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Pending</p>
              {isLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold">
                  {dashData?.pendingDeliveryCount ?? 0}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="mobile-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Commission</p>
              {isLoading ? (
                <Skeleton className="h-8 w-20 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-primary">
                  {formatBND(dashData?.totalCommission ?? 0)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Manager Home Content
function ManagerHome() {
  const navigate = useNavigate();
  const { data: dashData, isLoading } = useSalespersonDashboard();

  return (
    <div className="space-y-6">
      {/* Hero Summary Card */}
      <HeroSummaryCard
        title="Team Performance"
        subtitle={new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        value={isLoading ? '...' : formatBND(dashData?.mtdSalesAmount ?? 0)}
        isLoading={isLoading}
        linkText="View Team Oversight"
        onLinkClick={() => navigate('/manager/oversight')}
        showPrivacyToggle
      />

      {/* Quick Actions */}
      <QuickActionsGrid actions={managerActions} />

      {/* Stats Cards */}
      <div className="space-y-3">
        <SectionHeader title="Team Summary" />
        <div className="grid grid-cols-2 gap-3">
          <Card className="mobile-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Team Delivered</p>
              {isLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-[hsl(var(--status-success))]">
                  {dashData?.mtdDeliveredCount ?? 0}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="mobile-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Pending</p>
              {isLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold">
                  {dashData?.pendingDeliveryCount ?? 0}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Runner Home Content
function RunnerHome() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useRunnerDashboardStats();

  return (
    <div className="space-y-6">
      {/* Hero Summary Card */}
      <HeroSummaryCard
        title="Today's Jobs"
        subtitle="Assigned deliveries"
        value={isLoading ? '...' : `${stats?.todayStats?.inProgress ?? 0}`}
        isLoading={isLoading}
        linkText="View Inbox"
        onLinkClick={() => navigate('/runner/inbox')}
      />

      {/* Quick Actions */}
      <QuickActionsGrid actions={runnerActions} />

      {/* Stats Cards */}
      <div className="space-y-3">
        <SectionHeader title="Today's Summary" />
        <div className="grid grid-cols-2 gap-3">
          <Card className="mobile-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Delivered</p>
              {isLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-[hsl(var(--status-success))]">
                  {stats?.todayStats?.deliveredToday ?? 0}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="mobile-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Failed</p>
              {isLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-destructive">
                  {stats?.todayStats?.failedToday ?? 0}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="mobile-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Pending Claims</p>
              {isLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-primary">
                  {stats?.earningsStats?.pendingClaimCount ?? 0}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="mobile-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Amount</p>
              {isLoading ? (
                <Skeleton className="h-8 w-20 mt-1" />
              ) : (
                <p className="text-2xl font-bold">
                  {formatBND(stats?.todayStats?.totalTodayValue ?? 0)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Driver Home Content
function DriverHome() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Hero Summary Card */}
      <HeroSummaryCard
        title="Today's Deliveries"
        subtitle="Your assigned route"
        value="View Route"
        linkText="Start Delivery"
        onLinkClick={() => navigate('/driver/route')}
      />

      {/* Quick Actions */}
      <QuickActionsGrid actions={driverActions} columns={3} />
    </div>
  );
}

// Admin Home Content
function AdminHome() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useAdminStats();

  const totalOrders = (stats?.bookingOrders ?? 0) + (stats?.readyOrders ?? 0) + (stats?.deliveredOrders ?? 0);

  return (
    <div className="space-y-6">
      {/* Hero Summary Card */}
      <HeroSummaryCard
        title="System Overview"
        subtitle="Today's activity"
        value={isLoading ? '...' : `${totalOrders} Orders`}
        isLoading={isLoading}
        linkText="View All Orders"
        onLinkClick={() => navigate('/admin/runner-inbox')}
      />

      {/* Quick Actions */}
      <QuickActionsGrid actions={adminActions} />

      {/* Stats Cards */}
      <div className="space-y-3">
        <SectionHeader title="System Stats" />
        <div className="grid grid-cols-2 gap-3">
          <Card className="mobile-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Claims</p>
              {isLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-primary">
                  {stats?.totalClaims ?? 0}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="mobile-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Active Disputes</p>
              {isLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-destructive">
                  {stats?.disputes ?? 0}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Main Home Page Component
export default function HomePage() {
  const { role, profile } = useAuth();
  const isMobile = useIsMobile();

  const renderContent = () => {
    switch (role) {
      case 'salesperson':
        return <SalespersonHome />;
      case 'manager':
        return <ManagerHome />;
      case 'runner':
        return <RunnerHome />;
      case 'driver':
        return <DriverHome />;
      case 'admin':
        return <AdminHome />;
      default:
        return <SalespersonHome />;
    }
  };

  // Use mobile layout on mobile, desktop layout otherwise
  if (isMobile) {
    return (
      <MobileAppLayout>
        {renderContent()}
      </MobileAppLayout>
    );
  }

  // Desktop: Use existing AppLayout with the same content
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">
            Welcome back, {profile?.display_name}
          </h1>
          <p className="text-muted-foreground">Here's your dashboard overview</p>
        </div>
        {renderContent()}
      </div>
    </AppLayout>
  );
}
