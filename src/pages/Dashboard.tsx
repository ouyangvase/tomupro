import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  Package, 
  ShoppingCart, 
  Truck, 
  FileCheck, 
  AlertTriangle, 
  BarChart3,
  CheckCircle,
  XCircle,
  Users,
  Receipt,
  PackageCheck,
  Inbox,
  Navigation,
  Target,
  TrendingUp,
  Clock,
  DollarSign,
  Send,
  Ban,
  Zap,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { 
  useSalespersonStats, 
  useAdminStats, 
  useRecentActivity 
} from '@/hooks/useDashboardStats';
import { useRunnerDashboardStats } from '@/hooks/useRunnerDashboardStats';
import { formatBND } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  useSalespersonActionRequiredStats, 
  useAdminActionRequiredStats,
  useManagerActionRequiredStats
} from '@/hooks/useActionRequiredStats';
import { ActionRequiredCard } from '@/components/dashboard/ActionRequiredCard';
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';
import { formatDistanceToNow } from 'date-fns';

interface StatCardProps {
  label: string;
  value: number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  href: string;
  isLoading: boolean;
}

function StatCard({ label, value, icon: Icon, color, href, isLoading }: StatCardProps) {
  const navigate = useNavigate();

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate(href)}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className={`h-5 w-5 ${color}`} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-9 w-16" />
        ) : (
          <div className="text-3xl font-bold">{value ?? 0}</div>
        )}
      </CardContent>
    </Card>
  );
}

function SalespersonDashboard() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useSalespersonStats();
  const { data: actionStats, isLoading: actionLoading } = useSalespersonActionRequiredStats();
  const { data: activity, isLoading: activityLoading } = useRecentActivity();

  const statCards = [
    { label: 'Booking Orders', value: stats?.bookingOrders, icon: Package, color: 'text-chart-2', href: '/sales/booking' },
    { label: 'Ready Orders', value: stats?.readyOrders, icon: ShoppingCart, color: 'text-chart-1', href: '/sales/ready' },
    { label: 'Pending Delivery', value: stats?.pendingDelivery, icon: Truck, color: 'text-chart-3', href: '/sales/ready' },
    { label: 'Pending Reconciliation', value: stats?.pendingReconciliation, icon: FileCheck, color: 'text-chart-4', href: '/reconciliation/sp' },
    { label: 'Disputes', value: stats?.disputes, icon: AlertTriangle, color: 'text-destructive', href: '/disputes' },
    { label: 'Products', value: stats?.productsCount, icon: BarChart3, color: 'text-secondary', href: '/products' },
  ];

  return (
    <>
      {/* Action Required - Priority Display */}
      <ActionRequiredCard
        total={actionStats?.total ?? 0}
        failedDelivery={actionStats?.failedDelivery}
        rescheduled={actionStats?.rescheduled}
        runnerFlagged={actionStats?.runnerFlagged}
        isLoading={actionLoading}
        href="/sales/action-required"
        title="Action Required"
        subtitle="Orders requiring your decision before workflow can continue"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => (
          <StatCard key={stat.label} {...stat} isLoading={isLoading} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <button onClick={() => navigate('/sales/action-required')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors flex items-center gap-2">
              ⚠️ Resolve Action Required
              {(actionStats?.total ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-auto">{actionStats?.total}</Badge>
              )}
            </button>
            <button onClick={() => navigate('/sales/booking')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              📋 Manage Booking Orders
            </button>
            <button onClick={() => navigate('/inbound/pending')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              📦 Acknowledge Inbound
            </button>
            <button onClick={() => navigate('/reconciliation/sp')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              ✅ Review Claims
            </button>
            <button onClick={() => navigate('/inventory')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              🏭 View Stock Balance
            </button>
          </CardContent>
        </Card>

        <RecentActivityCard activity={activity} isLoading={activityLoading} />
      </div>
    </>
  );
}

function RunnerDashboard() {
  const navigate = useNavigate();
  const { data: dashData, isLoading, dataUpdatedAt } = useRunnerDashboardStats();

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  // Calculate delivery completion rate
  const totalAttempts = (dashData?.todayStats.deliveredToday ?? 0) + (dashData?.todayStats.failedToday ?? 0);
  const completionRate = totalAttempts > 0 
    ? Math.round((dashData?.todayStats.deliveredToday ?? 0) / totalAttempts * 100) 
    : 100;

  // Calculate claim progress
  const totalClaimable = (dashData?.earningsStats.pendingClaimValue ?? 0) + 
                         (dashData?.earningsStats.submittedClaimValue ?? 0) + 
                         (dashData?.earningsStats.approvedClaimValue ?? 0);
  const claimProgress = totalClaimable > 0 
    ? Math.round((dashData?.earningsStats.approvedClaimValue ?? 0) / totalClaimable * 100) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Real-time indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>
            {lastUpdated ? `Updated ${formatDistanceToNow(lastUpdated, { addSuffix: true })}` : 'Loading...'}
          </span>
        </div>
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
          Live
        </Badge>
      </div>

      {/* Section 1: What should I do now? */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500" />
          What should I do now?
        </h2>
        
        <div className="grid gap-4 md:grid-cols-4">
          {/* Pending Assignment */}
          <Card 
            className={`cursor-pointer hover:shadow-md transition-all ${(dashData?.todayStats.pendingAssignment ?? 0) > 0 ? 'border-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/20' : ''}`}
            onClick={() => navigate('/runner/inbox')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Needs Driver</p>
                  {isLoading ? (
                    <Skeleton className="h-9 w-16 mt-1" />
                  ) : (
                    <p className="text-3xl font-bold text-yellow-600">{dashData?.todayStats.pendingAssignment ?? 0}</p>
                  )}
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          {/* In Progress */}
          <Card 
            className="cursor-pointer hover:shadow-md transition-all"
            onClick={() => navigate('/runner/driver-inbox')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">In Progress</p>
                  {isLoading ? (
                    <Skeleton className="h-9 w-16 mt-1" />
                  ) : (
                    <p className="text-3xl font-bold text-blue-600">{dashData?.todayStats.inProgress ?? 0}</p>
                  )}
                </div>
                <Truck className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          {/* Delivered Today */}
          <Card 
            className="cursor-pointer hover:shadow-md transition-all"
            onClick={() => navigate('/runner/delivered-orders')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Delivered Today</p>
                  {isLoading ? (
                    <Skeleton className="h-9 w-16 mt-1" />
                  ) : (
                    <p className="text-3xl font-bold text-green-600">{dashData?.todayStats.deliveredToday ?? 0}</p>
                  )}
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          {/* Failed Today */}
          <Card 
            className={`cursor-pointer hover:shadow-md transition-all ${(dashData?.todayStats.failedToday ?? 0) > 0 ? 'border-destructive bg-destructive/5' : ''}`}
            onClick={() => navigate('/runner/failed-orders')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Failed Today</p>
                  {isLoading ? (
                    <Skeleton className="h-9 w-16 mt-1" />
                  ) : (
                    <p className={`text-3xl font-bold ${(dashData?.todayStats.failedToday ?? 0) > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {dashData?.todayStats.failedToday ?? 0}
                    </p>
                  )}
                </div>
                <XCircle className={`h-8 w-8 ${(dashData?.todayStats.failedToday ?? 0) > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Completion Rate Progress */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Today's Success Rate</span>
              <span className={`text-sm font-bold ${completionRate >= 90 ? 'text-green-600' : completionRate >= 70 ? 'text-yellow-600' : 'text-destructive'}`}>
                {completionRate}%
              </span>
            </div>
            <Progress value={completionRate} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {dashData?.todayStats.deliveredToday ?? 0} delivered, {dashData?.todayStats.failedToday ?? 0} failed out of {totalAttempts} attempts
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Section 2: How much have I earned today? */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-green-500" />
          How much have I earned today?
        </h2>

        <div className="grid gap-4 md:grid-cols-3">
          {/* Today's Delivered Value */}
          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-200 dark:border-green-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-700 dark:text-green-300">Today's Earnings</p>
                  {isLoading ? (
                    <Skeleton className="h-9 w-32 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                      {formatBND(dashData?.earningsStats.deliveredTodayValue ?? 0)}
                    </p>
                  )}
                </div>
                <DollarSign className="h-10 w-10 text-green-500" />
              </div>
            </CardContent>
          </Card>

          {/* Ready to Claim */}
          <Card 
            className="cursor-pointer hover:shadow-md transition-all border-primary/30 bg-primary/5"
            onClick={() => navigate('/runner/delivered-orders')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Ready to Claim</p>
                  {isLoading ? (
                    <Skeleton className="h-9 w-32 mt-1" />
                  ) : (
                    <>
                      <p className="text-2xl font-bold text-primary">
                        {formatBND(dashData?.earningsStats.pendingClaimValue ?? 0)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {dashData?.earningsStats.pendingClaimCount ?? 0} orders
                      </p>
                    </>
                  )}
                </div>
                <Send className="h-8 w-8 text-primary" />
              </div>
              {(dashData?.earningsStats.pendingClaimCount ?? 0) > 0 && (
                <Button size="sm" className="w-full mt-4" onClick={(e) => { e.stopPropagation(); navigate('/runner/delivered-orders'); }}>
                  Claim Now <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Claim Progress */}
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-3">Claim Status</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-yellow-500" />
                    Pending Approval
                  </span>
                  <span className="font-medium">{formatBND(dashData?.earningsStats.submittedClaimValue ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500" />
                    Approved
                  </span>
                  <span className="font-medium text-green-600">{formatBND(dashData?.earningsStats.approvedClaimValue ?? 0)}</span>
                </div>
              </div>
              {totalClaimable > 0 && (
                <div className="mt-4">
                  <Progress value={claimProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">{claimProgress}% of claims approved</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section 3: What is blocking my payout? */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Ban className="h-5 w-5 text-destructive" />
          What is blocking my payout?
        </h2>

        {((dashData?.blockerStats.failedOrdersCount ?? 0) > 0 || 
          (dashData?.blockerStats.missingDeliveryChargesCount ?? 0) > 0) ? (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Failed Orders Blocker */}
            {(dashData?.blockerStats.failedOrdersCount ?? 0) > 0 && (
              <Card 
                className="border-destructive/50 bg-destructive/5 cursor-pointer hover:shadow-md transition-all"
                onClick={() => navigate('/runner/failed-orders')}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-destructive/10 rounded-lg">
                      <AlertTriangle className="h-6 w-6 text-destructive" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-destructive">Failed Deliveries</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {dashData?.blockerStats.failedOrdersCount} order(s) need attention before you can claim.
                      </p>
                      <Button variant="destructive" size="sm" className="mt-3">
                        Resolve Now <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Missing Delivery Charges */}
            {(dashData?.blockerStats.missingDeliveryChargesCount ?? 0) > 0 && (
              <Card 
                className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20 cursor-pointer hover:shadow-md transition-all"
                onClick={() => navigate('/runner/delivery-charges')}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                      <Receipt className="h-6 w-6 text-yellow-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-yellow-700 dark:text-yellow-400">Missing Delivery Charges</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {dashData?.blockerStats.missingDeliveryChargesCount} area(s) need approved delivery charges.
                      </p>
                      <Button variant="outline" size="sm" className="mt-3 border-yellow-500 text-yellow-700 hover:bg-yellow-100">
                        Set Charges <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-green-700 dark:text-green-400">All Clear!</h3>
                  <p className="text-sm text-muted-foreground">No blockers. Submit your claims when ready.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-4">
            <Button variant="outline" className="justify-start h-auto py-3" onClick={() => navigate('/runner/inbox')}>
              <Inbox className="h-4 w-4 mr-2" />
              <span>Runner Inbox</span>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3" onClick={() => navigate('/runner/driver-inbox')}>
              <Truck className="h-4 w-4 mr-2" />
              <span>Driver Inbox</span>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3" onClick={() => navigate('/runner/delivered-orders')}>
              <CheckCircle className="h-4 w-4 mr-2" />
              <span>Delivered Orders</span>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3" onClick={() => navigate('/runner/claim-batches')}>
              <Receipt className="h-4 w-4 mr-2" />
              <span>My Claim Batches</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ManagerDashboard() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useAdminStats();
  const { data: actionStats, isLoading: actionLoading } = useManagerActionRequiredStats();
  const { data: activity, isLoading: activityLoading } = useRecentActivity();

  const statCards = [
    { label: 'Booking Orders', value: stats?.bookingOrders, icon: Package, color: 'text-chart-2', href: '/sales/booking' },
    { label: 'Ready Orders', value: stats?.readyOrders, icon: ShoppingCart, color: 'text-chart-1', href: '/sales/ready' },
    { label: 'Pending Delivery', value: stats?.pendingDelivery, icon: Truck, color: 'text-chart-3', href: '/runner/inbox' },
    { label: 'Delivered', value: stats?.deliveredOrders, icon: CheckCircle, color: 'text-primary', href: '/reconciliation/admin' },
    { label: 'Disputes', value: stats?.disputes, icon: AlertTriangle, color: 'text-destructive', href: '/disputes' },
  ];

  return (
    <>
      {/* Action Required Overview for Manager's Team */}
      <ActionRequiredCard
        total={actionStats?.systemTotal ?? 0}
        failedDelivery={actionStats?.failedDelivery}
        rescheduled={actionStats?.rescheduled}
        runnerFlagged={actionStats?.runnerFlagged}
        isLoading={actionLoading}
        href="/sales/action-required"
        title="Team Action Required"
        subtitle="Orders from your assigned agents requiring attention"
      />

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {statCards.map((stat) => (
          <StatCard key={stat.label} {...stat} isLoading={isLoading} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <button onClick={() => navigate('/sales/action-required')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors flex items-center gap-2">
              ⚠️ View Team Action Required
              {(actionStats?.systemTotal ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-auto">{actionStats?.systemTotal}</Badge>
              )}
            </button>
            <button onClick={() => navigate('/manager/oversight')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              👥 Team Oversight
            </button>
            <button onClick={() => navigate('/sales/booking')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              📋 View Team Orders
            </button>
            <button onClick={() => navigate('/disputes')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              ⚠️ Handle Disputes
            </button>
          </CardContent>
        </Card>

        <RecentActivityCard activity={activity} isLoading={activityLoading} />
      </div>
    </>
  );
}

function AdminDashboard() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useAdminStats();
  const { data: actionStats, isLoading: actionLoading } = useAdminActionRequiredStats();
  const { data: activity, isLoading: activityLoading } = useRecentActivity();

  const statCards = [
    { label: 'Booking Orders', value: stats?.bookingOrders, icon: Package, color: 'text-chart-2', href: '/sales/booking' },
    { label: 'Ready Orders', value: stats?.readyOrders, icon: ShoppingCart, color: 'text-chart-1', href: '/sales/ready' },
    { label: 'Pending Delivery', value: stats?.pendingDelivery, icon: Truck, color: 'text-chart-3', href: '/runner/inbox' },
    { label: 'Delivered', value: stats?.deliveredOrders, icon: CheckCircle, color: 'text-primary', href: '/reconciliation/admin' },
    { label: 'Disputes', value: stats?.disputes, icon: AlertTriangle, color: 'text-destructive', href: '/disputes' },
    { label: 'Products', value: stats?.productsCount, icon: BarChart3, color: 'text-secondary', href: '/products' },
    { label: 'Total Claims', value: stats?.totalClaims, icon: Receipt, color: 'text-chart-4', href: '/reconciliation/admin' },
    { label: 'Inbound Shipments', value: stats?.totalInbounds, icon: PackageCheck, color: 'text-chart-5', href: '/inbound/pending' },
    { label: 'Total Users', value: stats?.totalUsers, icon: Users, color: 'text-muted-foreground', href: '/settings/users' },
  ];

  return (
    <>
      {/* Action Required Overview - Priority Display */}
      <ActionRequiredCard
        total={actionStats?.systemTotal ?? 0}
        failedDelivery={actionStats?.failedDelivery}
        rescheduled={actionStats?.rescheduled}
        runnerFlagged={actionStats?.runnerFlagged}
        isLoading={actionLoading}
        href="/sales/action-required"
        title="System-Wide Action Required"
        subtitle="Total orders across all salespersons requiring attention"
      />

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-3">
        {statCards.map((stat) => (
          <StatCard key={stat.label} {...stat} isLoading={isLoading} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <button onClick={() => navigate('/admin/overview')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors flex items-center gap-2">
              📊 Action Required Overview
              {(actionStats?.systemTotal ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-auto">{actionStats?.systemTotal}</Badge>
              )}
            </button>
            <button onClick={() => navigate('/sales/booking')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              📋 Manage All Orders
            </button>
            <button onClick={() => navigate('/reconciliation/admin')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              ✅ Admin Reconciliation
            </button>
            <button onClick={() => navigate('/disputes')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              ⚠️ Handle Disputes
            </button>
            <button onClick={() => navigate('/settings/users')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
              👥 Manage Users
            </button>
          </CardContent>
        </Card>

        <RecentActivityCard activity={activity} isLoading={activityLoading} />
      </div>
    </>
  );
}

interface ActivityItem {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  created_at: string;
  actor_id: string | null;
}

function RecentActivityCard({ activity, isLoading }: { activity: ActivityItem[] | undefined; isLoading: boolean }) {
  const getActionBadgeVariant = (action: string) => {
    if (action.includes('create') || action.includes('insert')) return 'default';
    if (action.includes('update')) return 'secondary';
    if (action.includes('delete')) return 'destructive';
    return 'outline';
  };

  const formatEntityType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : activity && activity.length > 0 ? (
          <div className="space-y-3">
            {activity.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant={getActionBadgeVariant(item.action)} className="text-xs">
                    {item.action}
                  </Badge>
                  <span className="text-muted-foreground">
                    {formatEntityType(item.entity_type)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No recent activity</p>
        )}
      </CardContent>
    </Card>
  );
}

// Driver Dashboard
function DriverDashboard() {
  const navigate = useNavigate();

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate('/driver/inbox')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              My Deliveries
            </CardTitle>
            <Inbox className="h-5 w-5 text-chart-1" />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">View assigned orders</p>
          </CardContent>
        </Card>
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate('/driver/route')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Optimized Route
            </CardTitle>
            <Navigation className="h-5 w-5 text-chart-2" />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Plan your deliveries by area</p>
          </CardContent>
        </Card>
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate('/driver/analytics')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              My Analytics
            </CardTitle>
            <Target className="h-5 w-5 text-chart-3" />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Track your performance</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <button onClick={() => navigate('/driver/inbox')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
            📥 View My Deliveries
          </button>
          <button onClick={() => navigate('/driver/route')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
            🗺️ Plan Optimized Route
          </button>
          <button onClick={() => navigate('/driver/pickups')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
            📦 View Pickups
          </button>
          <button onClick={() => navigate('/driver/returns')} className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors">
            🔄 Submit Returns
          </button>
        </CardContent>
      </Card>
    </>
  );
}

export default function Dashboard() {
  const { profile, role } = useAuth();
  
  // Enable real-time updates for all authenticated users
  useRealtimeUpdates();

  const renderDashboard = () => {
    switch (role) {
      case 'driver':
        return <DriverDashboard />;
      case 'runner':
        return <RunnerDashboard />;
      case 'admin':
        return <AdminDashboard />;
      case 'manager':
        return <ManagerDashboard />;
      case 'salesperson':
      default:
        return <SalespersonDashboard />;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Welcome back, {profile?.display_name}</h1>
          <p className="text-muted-foreground mt-1">
            Here's an overview of your operations
            <span className="text-xs ml-2">(auto-refreshes every 30s)</span>
          </p>
        </div>

        {renderDashboard()}
      </div>
    </AppLayout>
  );
}
