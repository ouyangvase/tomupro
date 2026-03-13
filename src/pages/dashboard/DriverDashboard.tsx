import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Inbox, Navigation, Target, Package, RotateCcw, BarChart3,
  CheckCircle, XCircle, Truck, Clock, TrendingUp, ArrowRight, Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MissionSection } from '@/components/dashboard/MissionSection';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';
import { QuickActionTile } from '@/components/dashboard/QuickActionTile';
import { useDriverAnalytics } from '@/hooks/useDriverAnalytics';
import { useAuth } from '@/contexts/AuthContext';
import { formatBND } from '@/lib/currency';

export function DriverDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: analytics, isLoading } = useDriverAnalytics(user?.id);

  const todayDelivered = analytics?.thisWeek.delivered ?? 0;
  const todayFailed = analytics?.thisWeek.failed ?? 0;
  const totalAttempts = todayDelivered + todayFailed;
  const successRate = totalAttempts > 0 ? Math.round((todayDelivered / totalAttempts) * 100) : 100;

  return (
    <div className="space-y-6">
      {/* ── 1. HERO PANEL (handled by parent RoleHeroBanner) ── */}

      {/* ── 2. ACTION CARDS — Start Your Day ── */}
      <MissionSection icon={Zap} title="Start Your Day">
        <div className="grid gap-3 md:grid-cols-3">
          <Card 
            className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group border-primary/20 bg-gradient-to-br from-primary/8 to-transparent"
            onClick={() => navigate('/driver/inbox')}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-primary">My Deliveries</p>
                  <p className="text-xs text-muted-foreground mt-1">View assigned orders</p>
                </div>
                <div className="p-3 rounded-2xl bg-primary/15 group-hover:bg-primary/25 transition-colors">
                  <Inbox className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card 
            className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group"
            onClick={() => navigate('/driver/route')}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Optimized Route</p>
                  <p className="text-xs text-muted-foreground mt-1">Plan your deliveries</p>
                </div>
                <div className="p-3 rounded-2xl bg-secondary group-hover:bg-primary/10 transition-colors">
                  <Navigation className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card 
            className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group"
            onClick={() => navigate('/driver/analytics')}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">My Analytics</p>
                  <p className="text-xs text-muted-foreground mt-1">Track your performance</p>
                </div>
                <div className="p-3 rounded-2xl bg-secondary group-hover:bg-primary/10 transition-colors">
                  <Target className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </MissionSection>

      {/* ── 3. VISUAL PIPELINE — This Week's Mission Stats ── */}
      <MissionSection icon={Truck} title="This Week's Mission">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card 
            className="cursor-pointer hover:shadow-md transition-all border-[hsl(var(--status-success)/0.2)] bg-gradient-to-br from-[hsl(var(--status-success)/0.08)] to-transparent"
            onClick={() => navigate('/driver/inbox')}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[hsl(var(--status-success)/0.15)]">
                  <CheckCircle className="h-5 w-5 text-[hsl(var(--status-success))]" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Delivered</p>
                  {isLoading ? <Skeleton className="h-7 w-10" /> : (
                    <p className="text-2xl font-bold text-[hsl(var(--status-success))]">
                      <AnimatedCounter value={todayDelivered} />
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={cn(
            "cursor-pointer hover:shadow-md transition-all",
            todayFailed > 0 ? "border-destructive/20 bg-gradient-to-br from-destructive/5 to-transparent" : "border-border/40"
          )}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn("p-2.5 rounded-xl", todayFailed > 0 ? "bg-destructive/10" : "bg-secondary")}>
                  <XCircle className={cn("h-5 w-5", todayFailed > 0 ? "text-destructive" : "text-muted-foreground")} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Failed</p>
                  {isLoading ? <Skeleton className="h-7 w-10" /> : (
                    <p className={cn("text-2xl font-bold", todayFailed > 0 ? "text-destructive" : "text-muted-foreground")}>
                      <AnimatedCounter value={todayFailed} />
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Earnings</p>
                  {isLoading ? <Skeleton className="h-7 w-20" /> : (
                    <p className="text-2xl font-bold text-primary">
                      <AnimatedCounter value={analytics?.thisWeek.totalAmount ?? 0} formatter={(v) => formatBND(v)} />
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
                  <Clock className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Speed</p>
                  {isLoading ? <Skeleton className="h-7 w-16" /> : (
                    <p className="text-2xl font-bold">
                      {analytics?.thisWeek.avgDeliveryTimeMinutes 
                        ? `${Math.round(analytics.thisWeek.avgDeliveryTimeMinutes)}m`
                        : '—'}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </MissionSection>

      {/* ── 4. PERFORMANCE CARDS — Success Rate ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Weekly Success Rate</span>
            {isLoading ? <Skeleton className="h-5 w-12" /> : (
              <span className={cn("text-sm font-bold",
                successRate >= 90 ? "text-[hsl(var(--status-success))]" : successRate >= 70 ? "text-[hsl(var(--status-warning))]" : "text-destructive"
              )}>
                <AnimatedCounter value={successRate} suffix="%" />
              </span>
            )}
          </div>
          <Progress value={successRate} className="h-2.5" />
          <p className="text-xs text-muted-foreground mt-1.5">
            {todayDelivered} delivered, {todayFailed} failed of {totalAttempts} attempts
          </p>
        </CardContent>
      </Card>

      {/* ── 5. ALERTS (none for driver currently) ── */}

      {/* ── 6. ACTIVITY FEED — Quick Actions ── */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <QuickActionTile icon={Inbox} title="View My Deliveries" subtitle="Check assigned orders" href="/driver/inbox" />
          <QuickActionTile icon={Navigation} title="Plan Optimized Route" subtitle="Efficient delivery paths" href="/driver/route" />
          <QuickActionTile icon={Package} title="View Pickups" subtitle="Scheduled stock pickups" href="/driver/pickups" />
          <QuickActionTile icon={RotateCcw} title="Submit Returns" subtitle="Return unsold items" href="/driver/returns" />
          <QuickActionTile icon={TrendingUp} title="Driver Ranking" subtitle="See how you compare" href="/driver/ranking" iconColor="text-primary" iconBg="bg-primary/10" />
        </CardContent>
      </Card>
    </div>
  );
}
