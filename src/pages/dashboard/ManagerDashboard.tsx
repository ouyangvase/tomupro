import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Package, ShoppingCart, Truck, CheckCircle, AlertTriangle,
  Clock, Zap, ArrowRight, Users, TrendingUp, Award,
  DollarSign, Activity, Target, BarChart3
} from 'lucide-react';
import { useManagerDashboard, type PeriodType } from '@/hooks/useManagerDashboard';
import { useManagerActionRequiredStats } from '@/hooks/useActionRequiredStats';
import { useRecentActivity } from '@/hooks/useDashboardStats';
import { ActionRequiredCard } from '@/components/dashboard/ActionRequiredCard';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { MissionSection } from '@/components/dashboard/MissionSection';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';
import { QuickActionTile } from '@/components/dashboard/QuickActionTile';
import { formatBND } from '@/lib/currency';

export function ManagerDashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodType>('mtd');
  const { data: dashData, isLoading } = useManagerDashboard(period);
  const { data: actionStats, isLoading: actionLoading } = useManagerActionRequiredStats();
  const { data: activity, isLoading: activityLoading } = useRecentActivity();

  const leadershipScore = dashData?.leadershipScore ?? 0;
  const maxScore = 65;
  const scorePercent = Math.min(100, Math.round((leadershipScore / maxScore) * 100));

  return (
    <div className="space-y-6">
      {/* ── 1. HERO PANEL (handled by parent RoleHeroBanner) ── */}

      {/* Period Toggle */}
      <div className="flex items-center justify-between">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
          <TabsList className="h-8">
            <TabsTrigger value="last7" className="text-xs px-3">Last 7 Days</TabsTrigger>
            <TabsTrigger value="mtd" className="text-xs px-3">This Month</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* ── 2. ACTION CARDS — Quick Actions ── */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <QuickActionTile icon={Package} title="New Order" subtitle="Create a booking" href="/sales/booking" />
          <QuickActionTile icon={AlertTriangle} title="Team Alerts" subtitle="Resolve pending items" href="/sales/action-required" badge={actionStats?.systemTotal} iconColor="text-[hsl(var(--status-warning))]" iconBg="bg-[hsl(var(--status-warning)/0.1)]" />
          <QuickActionTile icon={Users} title="Team Oversight" subtitle="Monitor team activity" href="/manager/oversight" />
          <QuickActionTile icon={Award} title="Ranking Board" subtitle="Leadership rankings" href="/manager/ranking-board" iconColor="text-primary" iconBg="bg-primary/10" />
          <QuickActionTile icon={CheckCircle} title="Stock Balance" subtitle="Inventory overview" href="/inventory" iconColor="text-[hsl(var(--status-success))]" iconBg="bg-[hsl(var(--status-success)/0.1)]" />
        </CardContent>
      </Card>

      {/* ── 3. VISUAL PIPELINE — Team Overview KPIs ── */}
      <MissionSection icon={Activity} title="Team Overview">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card className="border-primary/20 bg-gradient-to-br from-primary/8 to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/15">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Team GMV</p>
                  {isLoading ? <Skeleton className="h-7 w-20" /> : (
                    <p className="text-xl font-bold text-primary">
                      <AnimatedCounter value={dashData?.teamOverview.realizedGmv ?? 0} formatter={(v) => formatBND(v)} />
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[hsl(var(--status-success)/0.2)] bg-gradient-to-br from-[hsl(var(--status-success)/0.06)] to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[hsl(var(--status-success)/0.15)]">
                  <CheckCircle className="h-5 w-5 text-[hsl(var(--status-success))]" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Team Delivered</p>
                  {isLoading ? <Skeleton className="h-7 w-12" /> : (
                    <p className="text-xl font-bold">
                      <AnimatedCounter value={dashData?.teamOverview.deliveredOrders ?? 0} />
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[hsl(var(--status-pending)/0.2)] bg-gradient-to-br from-[hsl(var(--status-pending)/0.06)] to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[hsl(var(--status-pending)/0.15)]">
                  <Package className="h-5 w-5 text-[hsl(var(--status-pending))]" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pipeline</p>
                  {isLoading ? <Skeleton className="h-7 w-20" /> : (
                    <p className="text-xl font-bold">
                      <AnimatedCounter value={dashData?.teamOverview.pipelineGmv ?? 0} formatter={(v) => formatBND(v)} />
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-secondary">
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Active Members</p>
                  {isLoading ? <Skeleton className="h-7 w-10" /> : (
                    <p className="text-xl font-bold">
                      <AnimatedCounter value={dashData?.teamHealth.activeTeamMembers ?? 0} />
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </MissionSection>

      {/* ── 4. PERFORMANCE CARDS — Leadership Score + Team Health ── */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Leadership Score */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Leadership Score
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              {isLoading ? <Skeleton className="h-12 w-20" /> : (
                <p className="text-4xl font-extrabold text-primary">
                  <AnimatedCounter value={leadershipScore} />
                </p>
              )}
              <p className="text-sm text-muted-foreground">/ {maxScore} pts</p>
            </div>
            <Progress value={scorePercent} className="h-2.5" />
            
            {dashData?.scoreBreakdown && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-secondary/50">
                  <p className="text-muted-foreground">Team Growth</p>
                  <p className="font-bold">{dashData.scoreBreakdown.teamGrowth} pts</p>
                </div>
                <div className="p-2 rounded-lg bg-secondary/50">
                  <p className="text-muted-foreground">Improvement</p>
                  <p className="font-bold">{dashData.scoreBreakdown.bottom30Improvement} pts</p>
                </div>
                <div className="p-2 rounded-lg bg-secondary/50">
                  <p className="text-muted-foreground">Interventions</p>
                  <p className="font-bold">{dashData.scoreBreakdown.opsInterventions} pts</p>
                </div>
                <div className="p-2 rounded-lg bg-secondary/50">
                  <p className="text-muted-foreground">Personal</p>
                  <p className="font-bold">{dashData.scoreBreakdown.personalContribution} pts</p>
                </div>
              </div>
            )}

            <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => navigate('/manager/ranking-board')}>
              <TrendingUp className="h-4 w-4" />
              View Rankings
            </Button>
          </CardContent>
        </Card>

        {/* Team Health */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Team Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Members with orders</span>
                {isLoading ? <Skeleton className="h-5 w-10" /> : (
                  <span className="font-bold">
                    {dashData?.teamHealth.teamMembersWithOrders ?? 0} / {dashData?.teamHealth.activeTeamMembers ?? 0}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Dependency ratio</span>
                {isLoading ? <Skeleton className="h-5 w-16" /> : (
                  <span className={cn("font-bold", (dashData?.teamHealth.dependencyRatio ?? 0) > 0.5 ? "text-destructive" : "text-[hsl(var(--status-success))]")}>
                    {Math.round((dashData?.teamHealth.dependencyRatio ?? 0) * 100)}%
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Top/Bottom gap</span>
                {isLoading ? <Skeleton className="h-5 w-10" /> : (
                  <span className={cn("font-bold", (dashData?.teamHealth.topBottomGapRatio ?? 0) > 5 ? "text-[hsl(var(--status-warning))]" : "text-muted-foreground")}>
                    {(dashData?.teamHealth.topBottomGapRatio ?? 0).toFixed(1)}x
                  </span>
                )}
              </div>
            </div>

            {/* Personal Performance */}
            <div className="pt-3 border-t border-border/50">
              <p className="text-xs font-medium text-muted-foreground mb-2">Your Personal Sales</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-secondary/40">
                  <p className="text-lg font-bold">{dashData?.personalPerformance.personalDelivered ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">Delivered</p>
                </div>
                <div className="p-2 rounded-lg bg-secondary/40">
                  <p className="text-lg font-bold">{dashData?.personalPerformance.personalBooking ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">Booking</p>
                </div>
                <div className="p-2 rounded-lg bg-secondary/40">
                  <p className="text-lg font-bold">{dashData?.personalPerformance.personalReady ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">Ready</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 5. ALERTS — Team Alerts ── */}
      {(actionStats?.systemTotal ?? 0) > 0 && (
        <ActionRequiredCard
          total={actionStats?.systemTotal ?? 0}
          failedDelivery={actionStats?.failedDelivery}
          rescheduled={actionStats?.rescheduled}
          runnerFlagged={actionStats?.runnerFlagged}
          isLoading={actionLoading}
          href="/sales/action-required"
          title="Team Alerts"
          subtitle="Orders from your team requiring attention"
        />
      )}

      {/* ── 6. ACTIVITY FEED — Recent Activity ── */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/10">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              Recent Activity
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-xl" />)}
            </div>
          ) : activity && activity.length > 0 ? (
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
              {activity.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-2.5 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <Badge 
                      variant={item.action.includes('create') || item.action.includes('insert') ? 'default' : item.action.includes('delete') ? 'destructive' : 'secondary'}
                      className="text-[10px] font-semibold px-2 py-0.5"
                    >
                      {item.action}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-medium">
                      {item.entity_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/60 shrink-0">
                    {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">No recent activity</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
