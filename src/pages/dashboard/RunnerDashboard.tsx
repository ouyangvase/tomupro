import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Clock, Truck, CheckCircle, XCircle, TrendingUp, DollarSign,
  Send, Ban, AlertTriangle, Receipt, ArrowRight, Inbox, Zap
} from 'lucide-react';
import { useRunnerDashboardStats } from '@/hooks/useRunnerDashboardStats';
import { formatBND } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { LivePulse } from '@/components/dashboard/LivePulse';
import { MissionSection } from '@/components/dashboard/MissionSection';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';
import { QuickActionTile } from '@/components/dashboard/QuickActionTile';

export function RunnerDashboard() {
  const navigate = useNavigate();
  const { data: dashData, isLoading, dataUpdatedAt } = useRunnerDashboardStats();
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  const totalAttempts = (dashData?.todayStats.deliveredToday ?? 0) + (dashData?.todayStats.failedToday ?? 0);
  const completionRate = totalAttempts > 0 
    ? Math.round((dashData?.todayStats.deliveredToday ?? 0) / totalAttempts * 100) 
    : 100;

  const totalClaimable = (dashData?.earningsStats.pendingClaimValue ?? 0) + 
                         (dashData?.earningsStats.submittedClaimValue ?? 0) + 
                         (dashData?.earningsStats.approvedClaimValue ?? 0);
  const claimProgress = totalClaimable > 0 
    ? Math.round((dashData?.earningsStats.approvedClaimValue ?? 0) / totalClaimable * 100) 
    : 0;

  return (
    <div className="space-y-8">
      <LivePulse lastUpdated={lastUpdated} isRefreshing={isLoading} />

      {/* Section 1: Today's Mission */}
      <MissionSection icon={Zap} title="What should I do now?" urgencyCount={(dashData?.todayStats.pendingAssignment ?? 0) + (dashData?.todayStats.failedToday ?? 0) || undefined}>
        <div className="grid gap-4 md:grid-cols-4">
          <Card 
            className={cn("cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200", (dashData?.todayStats.pendingAssignment ?? 0) > 0 && "border-[hsl(var(--status-warning)/0.5)] bg-[hsl(var(--status-warning)/0.05)]")}
            onClick={() => navigate('/runner/inbox')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Needs Driver</p>
                  {isLoading ? <Skeleton className="h-9 w-16 mt-1" /> : (
                    <p className="text-3xl font-bold text-[hsl(var(--status-warning))]">
                      <AnimatedCounter value={dashData?.todayStats.pendingAssignment ?? 0} />
                    </p>
                  )}
                </div>
                <Clock className="h-8 w-8 text-[hsl(var(--status-warning))]" />
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200" onClick={() => navigate('/runner/driver-inbox')}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">In Progress</p>
                  {isLoading ? <Skeleton className="h-9 w-16 mt-1" /> : (
                    <p className="text-3xl font-bold text-[hsl(var(--status-pending))]">
                      <AnimatedCounter value={dashData?.todayStats.inProgress ?? 0} />
                    </p>
                  )}
                </div>
                <Truck className="h-8 w-8 text-[hsl(var(--status-pending))]" />
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200" onClick={() => navigate('/runner/delivered-orders')}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Delivered Today</p>
                  {isLoading ? <Skeleton className="h-9 w-16 mt-1" /> : (
                    <p className="text-3xl font-bold text-[hsl(var(--status-success))]">
                      <AnimatedCounter value={dashData?.todayStats.deliveredToday ?? 0} />
                    </p>
                  )}
                </div>
                <CheckCircle className="h-8 w-8 text-[hsl(var(--status-success))]" />
              </div>
            </CardContent>
          </Card>

          <Card 
            className={cn("cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200", (dashData?.todayStats.failedToday ?? 0) > 0 && "border-destructive bg-destructive/5")}
            onClick={() => navigate('/runner/failed-orders')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Failed Today</p>
                  {isLoading ? <Skeleton className="h-9 w-16 mt-1" /> : (
                    <p className={cn("text-3xl font-bold", (dashData?.todayStats.failedToday ?? 0) > 0 ? "text-destructive" : "text-muted-foreground")}>
                      <AnimatedCounter value={dashData?.todayStats.failedToday ?? 0} />
                    </p>
                  )}
                </div>
                <XCircle className={cn("h-8 w-8", (dashData?.todayStats.failedToday ?? 0) > 0 ? "text-destructive" : "text-muted-foreground")} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Success Rate */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Today's Success Rate</span>
              <span className={cn("text-sm font-bold",
                completionRate >= 90 ? "text-[hsl(var(--status-success))]" : completionRate >= 70 ? "text-[hsl(var(--status-warning))]" : "text-destructive"
              )}>
                <AnimatedCounter value={completionRate} suffix="%" />
              </span>
            </div>
            <Progress value={completionRate} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {dashData?.todayStats.deliveredToday ?? 0} delivered, {dashData?.todayStats.failedToday ?? 0} failed out of {totalAttempts} attempts
            </p>
          </CardContent>
        </Card>
      </MissionSection>

      {/* Section 2: Earnings */}
      <MissionSection icon={TrendingUp} title="How much have I earned today?">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="relative overflow-hidden bg-gradient-to-br from-[hsl(var(--status-success)/0.15)] via-[hsl(var(--status-success)/0.08)] to-transparent border-[hsl(var(--status-success)/0.3)] shadow-md">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[hsl(var(--status-success)/0.1)] rounded-full blur-2xl translate-x-1/3 -translate-y-1/3" />
            <CardContent className="pt-6 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--status-success))]">Today's Earnings</p>
                  {isLoading ? <Skeleton className="h-9 w-32 mt-1" /> : (
                    <p className="text-3xl font-extrabold text-[hsl(var(--status-success))] tracking-tight">
                      <AnimatedCounter value={dashData?.earningsStats.deliveredTodayValue ?? 0} formatter={(v) => formatBND(v)} />
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-2xl bg-[hsl(var(--status-success)/0.2)]">
                  <DollarSign className="h-8 w-8 text-[hsl(var(--status-success))]" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card 
            className="relative overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-0.5 transition-all border-primary/40 bg-gradient-to-br from-primary/15 via-primary/8 to-transparent group"
            onClick={() => navigate('/runner/delivered-orders')}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl translate-x-1/3 -translate-y-1/3" />
            <CardContent className="pt-6 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-primary">Ready to Claim</p>
                  {isLoading ? <Skeleton className="h-9 w-32 mt-1" /> : (
                    <>
                      <p className="text-3xl font-extrabold text-primary tracking-tight">
                        <AnimatedCounter value={dashData?.earningsStats.pendingClaimValue ?? 0} formatter={(v) => formatBND(v)} />
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 font-medium">
                        {dashData?.earningsStats.pendingClaimCount ?? 0} orders
                      </p>
                    </>
                  )}
                </div>
                <div className="p-3 rounded-2xl bg-primary/20 group-hover:scale-110 transition-transform">
                  <Send className="h-7 w-7 text-primary" />
                </div>
              </div>
              {(dashData?.earningsStats.pendingClaimCount ?? 0) > 0 && (
                <Button size="sm" className="w-full mt-4 shadow-md font-semibold" onClick={(e) => { e.stopPropagation(); navigate('/runner/delivered-orders'); }}>
                  Claim Now <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-3">Claim Status</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[hsl(var(--status-warning))]" />
                    Pending Approval
                  </span>
                  <span className="font-medium">{formatBND(dashData?.earningsStats.submittedClaimValue ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[hsl(var(--status-success))]" />
                    Approved
                  </span>
                  <span className="font-medium text-[hsl(var(--status-success))]">{formatBND(dashData?.earningsStats.approvedClaimValue ?? 0)}</span>
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
      </MissionSection>

      {/* Section 3: Blockers */}
      <MissionSection icon={Ban} title="What is blocking my payout?">
        {((dashData?.blockerStats.failedOrdersCount ?? 0) > 0 || 
          (dashData?.blockerStats.missingDeliveryChargesCount ?? 0) > 0) ? (
          <div className="grid gap-4 md:grid-cols-2">
            {(dashData?.blockerStats.failedOrdersCount ?? 0) > 0 && (
              <Card className="border-destructive/50 bg-destructive/5 cursor-pointer hover:shadow-md transition-all" onClick={() => navigate('/runner/failed-orders')}>
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
            {(dashData?.blockerStats.missingDeliveryChargesCount ?? 0) > 0 && (
              <Card className="border-[hsl(var(--status-warning)/0.5)] bg-[hsl(var(--status-warning)/0.05)] cursor-pointer hover:shadow-md transition-all" onClick={() => navigate('/runner/delivery-charges')}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-[hsl(var(--status-warning)/0.15)] rounded-lg">
                      <Receipt className="h-6 w-6 text-[hsl(var(--status-warning))]" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-[hsl(var(--status-warning))]">Missing Delivery Charges</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {dashData?.blockerStats.missingDeliveryChargesCount} area(s) need approved delivery charges.
                      </p>
                      <Button variant="outline" size="sm" className="mt-3 border-[hsl(var(--status-warning))] text-[hsl(var(--status-warning))]">
                        Set Charges <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card className="border-[hsl(var(--status-success)/0.3)] bg-[hsl(var(--status-success)/0.05)]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[hsl(var(--status-success)/0.15)] rounded-lg">
                  <CheckCircle className="h-6 w-6 text-[hsl(var(--status-success))]" />
                </div>
                <div>
                  <h3 className="font-semibold text-[hsl(var(--status-success))]">All Clear!</h3>
                  <p className="text-sm text-muted-foreground">No blockers. Submit your claims when ready.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </MissionSection>

      {/* Section 4: Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2">
            <QuickActionTile icon={Inbox} title="Runner Inbox" subtitle="Manage pending orders" href="/runner/inbox" />
            <QuickActionTile icon={Truck} title="Driver Inbox" subtitle="Track in-progress deliveries" href="/runner/driver-inbox" />
            <QuickActionTile icon={CheckCircle} title="Delivered Orders" subtitle="View completed deliveries" href="/runner/delivered-orders" iconColor="text-[hsl(var(--status-success))]" iconBg="bg-[hsl(var(--status-success)/0.15)]" />
            <QuickActionTile icon={Receipt} title="My Claim Batches" subtitle="Submit and track claims" href="/runner/claim-batches" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
