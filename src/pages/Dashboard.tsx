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
  RefreshCw,
  Trophy,
  AlertCircle,
  Warehouse
} from 'lucide-react';
import { 
  useSalespersonStats, 
  useAdminStats, 
  useRecentActivity 
} from '@/hooks/useDashboardStats';
import { useRunnerDashboardStats } from '@/hooks/useRunnerDashboardStats';
import { useSalespersonDashboard } from '@/hooks/useSalespersonDashboard';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { LeaderboardDashboardCard } from '@/components/leaderboard/LeaderboardDashboardCard';

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
  const { data: dashData, isLoading, dataUpdatedAt } = useSalespersonDashboard();
  
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <div className="space-y-8">
      {/* Real-time indicator - Modern floating pill */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-secondary/50 backdrop-blur-sm border border-border/50">
          <RefreshCw className={cn("h-4 w-4 text-primary", isLoading && "animate-spin")} />
          <span className="text-sm font-medium text-muted-foreground">
            {lastUpdated ? `Updated ${formatDistanceToNow(lastUpdated, { addSuffix: true })}` : 'Loading...'}
          </span>
        </div>
        <Badge className="bg-[hsl(var(--status-success)/0.15)] text-[hsl(var(--status-success))] border-[hsl(var(--status-success)/0.3)] px-3 py-1.5">
          <span className="w-2 h-2 bg-[hsl(var(--status-success))] rounded-full mr-2 animate-pulse" />
          Live
        </Badge>
      </div>

      {/* Section 1: Hero Performance Cards */}
      <div className="space-y-5">
        <h2 className="text-xl font-bold flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          Performance Summary
        </h2>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Today's Sales Amount - Hero Card */}
          <Card className="relative overflow-hidden bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 border-primary/30 shadow-lg">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-6 relative">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-primary/80">Today Sales</p>
                  {isLoading ? (
                    <Skeleton className="h-9 w-32 mt-1" />
                  ) : (
                    <p className="text-3xl font-bold text-primary tracking-tight">
                      {formatBND(dashData?.todaySalesAmount ?? 0)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5 text-[hsl(var(--status-success))]" />
                    {dashData?.todayDeliveredCount ?? 0} orders delivered
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-primary/20">
                  <DollarSign className="h-8 w-8 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* MTD Sales Amount */}
          <Card className="relative overflow-hidden bg-gradient-to-br from-[hsl(var(--status-success)/0.15)] to-[hsl(var(--status-success)/0.05)] border-[hsl(var(--status-success)/0.3)]">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[hsl(var(--status-success)/0.1)] rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-6 relative">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[hsl(var(--status-success))]">Month-to-Date</p>
                  {isLoading ? (
                    <Skeleton className="h-9 w-32 mt-1" />
                  ) : (
                    <p className="text-3xl font-bold text-[hsl(var(--status-success))] tracking-tight">
                      {formatBND(dashData?.mtdSalesAmount ?? 0)}
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-2xl bg-[hsl(var(--status-success)/0.2)]">
                  <BarChart3 className="h-8 w-8 text-[hsl(var(--status-success))]" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Delivered Orders MTD */}
          <Card className="relative overflow-hidden border-border/50 hover:border-primary/30 transition-colors">
            <div className="absolute top-0 right-0 w-20 h-20 bg-secondary/50 rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-6 relative">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Delivered (MTD)</p>
                  {isLoading ? (
                    <Skeleton className="h-9 w-16 mt-1" />
                  ) : (
                    <p className="text-3xl font-bold tracking-tight">{dashData?.mtdDeliveredCount ?? 0}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">orders this month</p>
                </div>
                <div className="p-3 rounded-2xl bg-[hsl(var(--status-success)/0.15)]">
                  <CheckCircle className="h-8 w-8 text-[hsl(var(--status-success))]" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Commission Summary - Premium Gold */}
          <Card className="relative overflow-hidden bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border-primary/40">
            <div className="absolute top-0 right-0 w-28 h-28 bg-primary/15 rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-6 relative">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-primary/80">Commission (MTD)</p>
                  {isLoading ? (
                    <Skeleton className="h-9 w-32 mt-1" />
                  ) : (
                    <p className="text-3xl font-bold text-primary tracking-tight">
                      {formatBND(dashData?.totalCommission ?? 0)}
                    </p>
                  )}
                  <div className="flex gap-2 text-xs mt-2">
                    <span className="px-2 py-0.5 rounded-full bg-[hsl(var(--status-success)/0.15)] text-[hsl(var(--status-success))] font-medium">
                      ✓ {formatBND(dashData?.finalCommission ?? 0)}
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-primary/20">
                  <Trophy className="h-8 w-8 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section 2: Monthly Target Progress */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Monthly Target Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Target: {dashData?.targetType === 'ORDER_COUNT' 
                    ? `${dashData?.monthlyTarget ?? 0} orders` 
                    : formatBND(dashData?.monthlyTarget ?? 0)}
                </p>
                <p className="text-2xl font-bold">
                  {dashData?.targetType === 'ORDER_COUNT' 
                    ? `${dashData?.mtdDeliveredCount ?? 0} orders`
                    : formatBND(dashData?.mtdSalesAmount ?? 0)}
                </p>
              </div>
              <div className="text-right">
                {isLoading ? (
                  <Skeleton className="h-12 w-16" />
                ) : (
                  <p className={cn(
                    "text-3xl font-bold",
                    (dashData?.targetProgress ?? 0) >= 100 
                      ? "text-green-600" 
                      : (dashData?.targetProgress ?? 0) >= 75 
                        ? "text-yellow-600" 
                        : "text-muted-foreground"
                  )}>
                    {(dashData?.targetProgress ?? 0).toFixed(0)}%
                  </p>
                )}
              </div>
            </div>
            <Progress value={dashData?.targetProgress ?? 0} className="h-3" />
            {(dashData?.remainingToTarget ?? 0) > 0 ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-primary">
                  {dashData?.targetType === 'ORDER_COUNT'
                    ? `${Math.ceil(dashData?.remainingToTarget ?? 0)} orders`
                    : formatBND(dashData?.remainingToTarget ?? 0)}
                </span> more to reach your target
              </p>
            ) : (
              <p className="text-sm text-green-600 font-medium">
                🎉 You've reached your monthly target!
              </p>
            )}
          </CardContent>
        </Card>

        {/* Tier Progress (if applicable) */}
        {dashData?.isTiered && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Commission Tier Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Current Tier</p>
                  <p className="text-2xl font-bold">
                    {dashData?.currentTier ? `Tier ${dashData.currentTier}` : 'Not started'}
                  </p>
                  {dashData?.currentTierValue && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {dashData.commissionMode === 'PER_ORDER' 
                        ? `${formatBND(dashData.currentTierValue)} per order`
                        : `${dashData.currentTierValue}% commission`}
                    </p>
                  )}
                </div>
                {dashData?.nextTierValue && (
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Next Tier</p>
                    <p className="text-lg font-semibold text-primary">
                      {dashData.commissionMode === 'PER_ORDER'
                        ? formatBND(dashData.nextTierValue)
                        : `${dashData.nextTierValue}%`}
                    </p>
                  </div>
                )}
              </div>
              {dashData?.ordersToNextTier !== null && dashData?.nextTierAt !== null && (
                <>
                  <Progress 
                    value={dashData?.nextTierAt > 0 
                      ? ((dashData.nextTierAt - (dashData.ordersToNextTier ?? 0)) / dashData.nextTierAt) * 100 
                      : 0} 
                    className="h-2" 
                  />
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-primary">{dashData.ordersToNextTier}</span> more orders to unlock next tier
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Section 3: Action Required - Modern Alert Cards */}
      <div className="space-y-5">
        <h2 className="text-xl font-bold flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[hsl(var(--status-warning)/0.15)]">
            <AlertCircle className="h-5 w-5 text-[hsl(var(--status-warning))]" />
          </div>
          Action Required
        </h2>
        
        <div className="grid gap-4 md:grid-cols-3">
          {/* Failed Orders - Urgent Card */}
          <Card 
            className={cn(
              "cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group",
              (dashData?.failedOrdersCount ?? 0) > 0 
                ? "border-destructive/50 bg-gradient-to-br from-destructive/10 to-destructive/5" 
                : "border-border/50"
            )}
            onClick={() => navigate('/sales/action-required')}
          >
            {(dashData?.failedOrdersCount ?? 0) > 0 && (
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-destructive to-destructive/50" />
            )}
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Failed Orders</p>
                  {isLoading ? (
                    <Skeleton className="h-10 w-16 mt-1" />
                  ) : (
                    <p className={cn(
                      "text-4xl font-bold tracking-tight",
                      (dashData?.failedOrdersCount ?? 0) > 0 ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {dashData?.failedOrdersCount ?? 0}
                    </p>
                  )}
                </div>
                <div className={cn(
                  "p-3 rounded-2xl transition-colors",
                  (dashData?.failedOrdersCount ?? 0) > 0 
                    ? "bg-destructive/20 group-hover:bg-destructive/30" 
                    : "bg-secondary"
                )}>
                  <XCircle className={cn(
                    "h-7 w-7",
                    (dashData?.failedOrdersCount ?? 0) > 0 ? "text-destructive" : "text-muted-foreground/50"
                  )} />
                </div>
              </div>
              {(dashData?.failedOrdersCount ?? 0) > 0 && (
                <Button size="sm" variant="destructive" className="w-full gap-2 shadow-lg">
                  Resolve Now <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Pending Delivery - Info Card */}
          <Card 
            className="cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group border-border/50 hover:border-primary/30"
            onClick={() => navigate('/sales/ready')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Pending Delivery</p>
                  {isLoading ? (
                    <Skeleton className="h-10 w-16 mt-1" />
                  ) : (
                    <p className="text-4xl font-bold text-primary tracking-tight">{dashData?.pendingDeliveryCount ?? 0}</p>
                  )}
                </div>
                <div className="p-3 rounded-2xl bg-primary/15 group-hover:bg-primary/25 transition-colors">
                  <Truck className="h-7 w-7 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pending Claim */}
          <Card 
            className="cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group border-border/50 hover:border-[hsl(var(--status-pending))/0.5]"
            onClick={() => navigate('/runner/delivered-orders')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Pending Claim</p>
                  {isLoading ? (
                    <Skeleton className="h-10 w-16 mt-1" />
                  ) : (
                    <p className="text-4xl font-bold text-[hsl(var(--status-pending))] tracking-tight">{dashData?.pendingClaimCount ?? 0}</p>
                  )}
                </div>
                <div className="p-3 rounded-2xl bg-[hsl(var(--status-pending)/0.15)] group-hover:bg-[hsl(var(--status-pending)/0.25)] transition-colors">
                  <Receipt className="h-7 w-7 text-[hsl(var(--status-pending))]" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section 4: My Stock Snapshot */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Warehouse className="h-5 w-5 text-primary" />
              My Stock Snapshot
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/inventory')}>
              View All <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (dashData?.stockItems?.length ?? 0) > 0 ? (
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {dashData?.stockItems?.slice(0, 10).map((item) => (
                  <div 
                    key={item.productId} 
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border",
                      item.isLowStock && "border-destructive/50 bg-destructive/5"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-muted-foreground">
                        {item.skuCode || 'N/A'}
                      </span>
                      <span className="text-sm font-medium">{item.productName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-lg font-bold",
                        item.isLowStock ? "text-destructive" : ""
                      )}>
                        {item.balance}
                      </span>
                      {item.isLowStock && (
                        <Badge variant="destructive" className="text-xs">Low</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Warehouse className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No stock items found</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 5: Sales Ranking (if applicable) */}
      {dashData?.ranking && dashData.ranking.totalSalespersons > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Your Ranking This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg",
                  dashData.ranking.mtdSalesRank === 1 
                    ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400" 
                    : dashData.ranking.mtdSalesRank <= 3 
                      ? "bg-primary/10 text-primary" 
                      : "bg-muted text-muted-foreground"
                )}>
                  #{dashData.ranking.mtdSalesRank}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sales Amount Rank</p>
                  <p className="font-semibold">
                    {dashData.ranking.mtdSalesRank} of {dashData.ranking.totalSalespersons}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg",
                  dashData.ranking.mtdDeliveredRank === 1 
                    ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400" 
                    : dashData.ranking.mtdDeliveredRank <= 3 
                      ? "bg-primary/10 text-primary" 
                      : "bg-muted text-muted-foreground"
                )}>
                  #{dashData.ranking.mtdDeliveredRank}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Delivered Orders Rank</p>
                  <p className="font-semibold">
                    {dashData.ranking.mtdDeliveredRank} of {dashData.ranking.totalSalespersons}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 6: Leaderboard Preview */}
      <LeaderboardDashboardCard />
    </div>
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
    { label: 'Booking Orders', value: stats?.bookingOrders, icon: Package, color: 'text-primary', href: '/sales/booking' },
    { label: 'Ready Orders', value: stats?.readyOrders, icon: ShoppingCart, color: 'text-[hsl(var(--status-success))]', href: '/sales/ready' },
    { label: 'Pending Delivery', value: stats?.pendingDelivery, icon: Truck, color: 'text-[hsl(var(--status-pending))]', href: '/runner/inbox' },
    { label: 'Delivered', value: stats?.deliveredOrders, icon: CheckCircle, color: 'text-[hsl(var(--status-success))]', href: '/reconciliation/admin' },
    { label: 'Disputes', value: stats?.disputes, icon: AlertTriangle, color: 'text-destructive', href: '/disputes' },
    { label: 'Products', value: stats?.productsCount, icon: BarChart3, color: 'text-muted-foreground', href: '/products' },
    { label: 'Total Claims', value: stats?.totalClaims, icon: Receipt, color: 'text-primary', href: '/reconciliation/admin' },
    { label: 'Inbound Shipments', value: stats?.totalInbounds, icon: PackageCheck, color: 'text-[hsl(var(--status-warning))]', href: '/inbound/pending' },
    { label: 'Total Users', value: stats?.totalUsers, icon: Users, color: 'text-muted-foreground', href: '/settings/users' },
  ];

  return (
    <div className="space-y-8">
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

      {/* Stats Grid - Modern Cards */}
      <div className="space-y-5">
        <h2 className="text-xl font-bold flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          System Overview
        </h2>
        
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-3">
          {statCards.map((stat) => (
            <Card 
              key={stat.label}
              className="cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group border-border/50 hover:border-primary/30 relative overflow-hidden"
              onClick={() => navigate(stat.href)}
            >
              <div className="absolute top-0 right-0 w-20 h-20 bg-secondary/30 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/10 transition-colors" />
              <CardContent className="pt-6 relative">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                    {isLoading ? (
                      <Skeleton className="h-9 w-16 mt-1" />
                    ) : (
                      <p className="text-3xl font-bold tracking-tight">{stat.value ?? 0}</p>
                    )}
                  </div>
                  <div className={cn("p-3 rounded-2xl bg-secondary/50 group-hover:bg-primary/15 transition-colors", stat.color)}>
                    <stat.icon className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Quick Actions & Activity */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Quick Actions - Modern Button List */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-bold flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <button 
              onClick={() => navigate('/admin/overview')} 
              className="w-full text-left p-4 rounded-xl bg-gradient-to-r from-[hsl(var(--status-warning)/0.1)] to-transparent border border-[hsl(var(--status-warning)/0.2)] hover:border-[hsl(var(--status-warning)/0.4)] hover:shadow-md transition-all flex items-center gap-3 group"
            >
              <div className="p-2 rounded-lg bg-[hsl(var(--status-warning)/0.15)]">
                <AlertCircle className="h-4 w-4 text-[hsl(var(--status-warning))]" />
              </div>
              <span className="font-medium">Action Required Overview</span>
              {(actionStats?.systemTotal ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-auto shadow-lg">{actionStats?.systemTotal}</Badge>
              )}
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform ml-auto" />
            </button>
            
            <button 
              onClick={() => navigate('/sales/booking')} 
              className="w-full text-left p-4 rounded-xl hover:bg-secondary/50 border border-transparent hover:border-border/50 transition-all flex items-center gap-3 group"
            >
              <div className="p-2 rounded-lg bg-secondary/50">
                <Package className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="font-medium">Manage All Orders</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform ml-auto" />
            </button>
            
            <button 
              onClick={() => navigate('/reconciliation/admin')} 
              className="w-full text-left p-4 rounded-xl hover:bg-secondary/50 border border-transparent hover:border-border/50 transition-all flex items-center gap-3 group"
            >
              <div className="p-2 rounded-lg bg-[hsl(var(--status-success)/0.15)]">
                <FileCheck className="h-4 w-4 text-[hsl(var(--status-success))]" />
              </div>
              <span className="font-medium">Admin Reconciliation</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform ml-auto" />
            </button>
            
            <button 
              onClick={() => navigate('/disputes')} 
              className="w-full text-left p-4 rounded-xl hover:bg-secondary/50 border border-transparent hover:border-border/50 transition-all flex items-center gap-3 group"
            >
              <div className="p-2 rounded-lg bg-destructive/15">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              <span className="font-medium">Handle Disputes</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform ml-auto" />
            </button>
            
            <button 
              onClick={() => navigate('/settings/users')} 
              className="w-full text-left p-4 rounded-xl hover:bg-secondary/50 border border-transparent hover:border-border/50 transition-all flex items-center gap-3 group"
            >
              <div className="p-2 rounded-lg bg-secondary/50">
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="font-medium">Manage Users</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform ml-auto" />
            </button>
          </CardContent>
        </Card>

        <RecentActivityCard activity={activity} isLoading={activityLoading} />
      </div>
    </div>
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
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-bold flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : activity && activity.length > 0 ? (
          <div className="space-y-2">
            {activity.map((item) => (
              <div 
                key={item.id} 
                className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors border border-transparent hover:border-border/30"
              >
                <div className="flex items-center gap-3">
                  <Badge 
                    variant={getActionBadgeVariant(item.action)} 
                    className="text-xs font-medium px-2.5 py-1"
                  >
                    {item.action}
                  </Badge>
                  <span className="text-sm text-muted-foreground font-medium">
                    {formatEntityType(item.entity_type)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground/70 font-medium">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Clock className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">No recent activity</p>
          </div>
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
      <div className="space-y-8">
        {/* Premium Welcome Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/15 via-primary/10 to-transparent p-6 md:p-8 border border-primary/20">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-1/2 w-48 h-48 bg-primary/5 rounded-full blur-2xl" />
          <div className="relative">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Welcome back, <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">{profile?.display_name}</span>
            </h1>
            <p className="text-muted-foreground mt-2 flex items-center gap-2">
              Here's an overview of your operations
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-secondary/80 text-muted-foreground">
                <RefreshCw className="h-3 w-3" /> auto-refreshes
              </span>
            </p>
          </div>
        </div>

        {renderDashboard()}
      </div>
    </AppLayout>
  );
}
