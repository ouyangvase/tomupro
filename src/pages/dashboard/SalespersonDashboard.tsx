import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  TrendingUp, DollarSign, CheckCircle, XCircle, Truck, Receipt,
  AlertCircle, Warehouse, ArrowRight, Trophy, Target
} from 'lucide-react';
import { useSalespersonDashboard } from '@/hooks/useSalespersonDashboard';
import { formatBND } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LeaderboardDashboardCard } from '@/components/leaderboard/LeaderboardDashboardCard';
import { LivePulse } from '@/components/dashboard/LivePulse';
import { MissionSection } from '@/components/dashboard/MissionSection';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';

export function SalespersonDashboard() {
  const navigate = useNavigate();
  const { data: dashData, isLoading, dataUpdatedAt } = useSalespersonDashboard();
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <div className="space-y-8">
      {/* ── 1. HERO PANEL (handled by parent RoleHeroBanner) ── */}
      <LivePulse lastUpdated={lastUpdated} isRefreshing={isLoading} />

      {/* ── 2. ACTION CARDS ── */}
      <MissionSection icon={AlertCircle} title="Action Required" urgencyCount={
        ((dashData?.failedOrdersCount ?? 0) + (dashData?.pendingDeliveryCount ?? 0) + (dashData?.pendingClaimCount ?? 0)) || undefined
      }>
        <div className="grid gap-4 md:grid-cols-3">
          <Card 
            className={cn(
              "cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 relative overflow-hidden group",
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
                  {isLoading ? <Skeleton className="h-10 w-16 mt-1" /> : (
                    <p className={cn("text-4xl font-bold tracking-tight", (dashData?.failedOrdersCount ?? 0) > 0 ? "text-destructive" : "text-muted-foreground")}>
                      <AnimatedCounter value={dashData?.failedOrdersCount ?? 0} />
                    </p>
                  )}
                </div>
                <div className={cn("p-3 rounded-2xl transition-colors", (dashData?.failedOrdersCount ?? 0) > 0 ? "bg-destructive/20 group-hover:bg-destructive/30" : "bg-secondary")}>
                  <XCircle className={cn("h-7 w-7", (dashData?.failedOrdersCount ?? 0) > 0 ? "text-destructive" : "text-muted-foreground/50")} />
                </div>
              </div>
              {(dashData?.failedOrdersCount ?? 0) > 0 && (
                <Button size="sm" variant="destructive" className="w-full gap-2 shadow-lg">
                  Resolve Now <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group border-border/50 hover:border-primary/30"
            onClick={() => navigate('/sales/ready')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Pending Delivery</p>
                  {isLoading ? <Skeleton className="h-10 w-16 mt-1" /> : (
                    <p className="text-4xl font-bold text-primary tracking-tight">
                      <AnimatedCounter value={dashData?.pendingDeliveryCount ?? 0} />
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-2xl bg-primary/15 group-hover:bg-primary/25 transition-colors">
                  <Truck className="h-7 w-7 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group border-border/50"
            onClick={() => navigate('/runner/delivered-orders')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Pending Claim</p>
                  {isLoading ? <Skeleton className="h-10 w-16 mt-1" /> : (
                    <p className="text-4xl font-bold text-[hsl(var(--status-pending))] tracking-tight">
                      <AnimatedCounter value={dashData?.pendingClaimCount ?? 0} />
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-2xl bg-[hsl(var(--status-pending)/0.15)] group-hover:bg-[hsl(var(--status-pending)/0.25)] transition-colors">
                  <Receipt className="h-7 w-7 text-[hsl(var(--status-pending))]" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </MissionSection>

      {/* ── 3. VISUAL PIPELINE — Target Progress ── */}
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
                {isLoading ? <Skeleton className="h-12 w-16" /> : (
                  <p className={cn(
                    "text-3xl font-bold",
                    (dashData?.targetProgress ?? 0) >= 100 
                      ? "text-[hsl(var(--status-success))]" 
                      : (dashData?.targetProgress ?? 0) >= 75 
                        ? "text-[hsl(var(--status-warning))]" 
                        : "text-muted-foreground"
                  )}>
                    <AnimatedCounter value={dashData?.targetProgress ?? 0} suffix="%" />
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
              <p className="text-sm text-[hsl(var(--status-success))] font-medium">🎉 You've reached your monthly target!</p>
            )}
          </CardContent>
        </Card>

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

      {/* ── 4. PERFORMANCE CARDS ── */}
      <MissionSection icon={TrendingUp} title="Performance Summary">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Today's Sales */}
          <Card className="relative overflow-hidden bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 border-primary/30 shadow-lg">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-6 relative">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-primary/80">Today Sales</p>
                  {isLoading ? <Skeleton className="h-9 w-32 mt-1" /> : (
                    <p className="text-3xl font-bold text-primary tracking-tight">
                      <AnimatedCounter value={dashData?.todaySalesAmount ?? 0} formatter={(v) => formatBND(v)} />
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5 text-[hsl(var(--status-success))]" />
                    {dashData?.todayDeliveredCount ?? 0} delivered
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-primary/20">
                  <DollarSign className="h-8 w-8 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* MTD Sales */}
          <Card className="relative overflow-hidden bg-gradient-to-br from-[hsl(var(--status-success)/0.15)] to-[hsl(var(--status-success)/0.05)] border-[hsl(var(--status-success)/0.3)]">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[hsl(var(--status-success)/0.1)] rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-6 relative">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[hsl(var(--status-success))]">Month-to-Date</p>
                  {isLoading ? <Skeleton className="h-9 w-32 mt-1" /> : (
                    <p className="text-3xl font-bold text-[hsl(var(--status-success))] tracking-tight">
                      <AnimatedCounter value={dashData?.mtdSalesAmount ?? 0} formatter={(v) => formatBND(v)} />
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-2xl bg-[hsl(var(--status-success)/0.2)]">
                  <TrendingUp className="h-8 w-8 text-[hsl(var(--status-success))]" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Delivered MTD */}
          <Card className="relative overflow-hidden border-border/50 hover:border-primary/30 transition-colors">
            <div className="absolute top-0 right-0 w-20 h-20 bg-secondary/50 rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-6 relative">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Delivered (MTD)</p>
                  {isLoading ? <Skeleton className="h-9 w-16 mt-1" /> : (
                    <p className="text-3xl font-bold tracking-tight">
                      <AnimatedCounter value={dashData?.mtdDeliveredCount ?? 0} />
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">orders this month</p>
                </div>
                <div className="p-3 rounded-2xl bg-[hsl(var(--status-success)/0.15)]">
                  <CheckCircle className="h-8 w-8 text-[hsl(var(--status-success))]" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Commission */}
          <Card className="relative overflow-hidden bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border-primary/40">
            <div className="absolute top-0 right-0 w-28 h-28 bg-primary/15 rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-6 relative">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-primary/80">Commission (MTD)</p>
                  {isLoading ? <Skeleton className="h-9 w-32 mt-1" /> : (
                    <p className="text-3xl font-bold text-primary tracking-tight">
                      <AnimatedCounter value={dashData?.totalCommission ?? 0} formatter={(v) => formatBND(v)} />
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
      </MissionSection>

      {/* ── 5. ALERTS — Stock Snapshot ── */}
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
                      <span className="font-mono text-sm text-muted-foreground">{item.skuCode || 'N/A'}</span>
                      <span className="text-sm font-medium">{item.productName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-lg font-bold", item.isLowStock ? "text-destructive" : "")}>
                        {item.balance}
                      </span>
                      {item.isLowStock && <Badge variant="destructive" className="text-xs">Low</Badge>}
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

      {/* ── 6. ACTIVITY FEED — Ranking + Leaderboard ── */}
      {dashData?.ranking && dashData.ranking.totalSalespersons > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Your Ranking This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg",
                  dashData.ranking.mtdSalesRank === 1 
                    ? "bg-primary/20 text-primary" 
                    : dashData.ranking.mtdSalesRank <= 3 
                      ? "bg-primary/10 text-primary" 
                      : "bg-muted text-muted-foreground"
                )}>
                  #{dashData.ranking.mtdSalesRank}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sales Amount Rank</p>
                  <p className="font-semibold">{dashData.ranking.mtdSalesRank} of {dashData.ranking.totalSalespersons}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg",
                  dashData.ranking.mtdDeliveredRank === 1 
                    ? "bg-[hsl(var(--status-success)/0.2)] text-[hsl(var(--status-success))]" 
                    : dashData.ranking.mtdDeliveredRank <= 3 
                      ? "bg-primary/10 text-primary" 
                      : "bg-muted text-muted-foreground"
                )}>
                  #{dashData.ranking.mtdDeliveredRank}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Delivered Orders Rank</p>
                  <p className="font-semibold">{dashData.ranking.mtdDeliveredRank} of {dashData.ranking.totalSalespersons}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <LeaderboardDashboardCard />
    </div>
  );
}
