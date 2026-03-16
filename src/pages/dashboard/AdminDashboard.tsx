import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Package, ShoppingCart, Truck, CheckCircle, AlertTriangle,
  BarChart3, Receipt, PackageCheck, Users, Zap, 
  FileCheck, Clock, ArrowRight, ShieldAlert, Activity, TrendingUp
} from 'lucide-react';
import { useAdminStats, useRecentActivity } from '@/hooks/useDashboardStats';
import { useAdminActionRequiredStats } from '@/hooks/useActionRequiredStats';
import { ActionRequiredCard } from '@/components/dashboard/ActionRequiredCard';
import { VisibilityDebugPanel } from '@/components/admin/VisibilityDebugPanel';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { MissionSection } from '@/components/dashboard/MissionSection';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';
import { QuickActionTile } from '@/components/dashboard/QuickActionTile';

export function AdminDashboard() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useAdminStats();
  const { data: actionStats, isLoading: actionLoading } = useAdminActionRequiredStats();
  const { data: activity, isLoading: activityLoading } = useRecentActivity();

  const primaryMetrics = [
    { label: 'Booking', value: stats?.bookingOrders, icon: Package, color: 'text-primary', bgColor: 'bg-primary/10', href: '/sales/booking' },
    { label: 'Ready', value: stats?.readyOrders, icon: ShoppingCart, color: 'text-[hsl(var(--status-success))]', bgColor: 'bg-[hsl(var(--status-success)/0.1)]', href: '/sales/ready' },
    { label: 'Pending', value: stats?.pendingDelivery, icon: Truck, color: 'text-[hsl(var(--status-pending))]', bgColor: 'bg-[hsl(var(--status-pending)/0.1)]', href: '/runner/inbox' },
    { label: 'Delivered', value: stats?.deliveredOrders, icon: CheckCircle, color: 'text-[hsl(var(--status-success))]', bgColor: 'bg-[hsl(var(--status-success)/0.1)]', href: '/reconciliation/admin' },
  ];

  const secondaryMetrics = [
    
    { label: 'Products', value: stats?.productsCount, icon: BarChart3, color: 'text-muted-foreground', bgColor: 'bg-secondary', href: '/products' },
    { label: 'Claims', value: stats?.totalClaims, icon: Receipt, color: 'text-primary', bgColor: 'bg-primary/10', href: '/reconciliation/admin' },
    { label: 'Inbound', value: stats?.totalInbounds, icon: PackageCheck, color: 'text-[hsl(var(--status-warning))]', bgColor: 'bg-[hsl(var(--status-warning)/0.1)]', href: '/inbound/pending' },
    { label: 'Users', value: stats?.totalUsers, icon: Users, color: 'text-muted-foreground', bgColor: 'bg-secondary', href: '/settings/users' },
  ];

  return (
    <div className="space-y-6">
      
      {/* Operations Alerts */}
      {(actionStats?.systemTotal ?? 0) > 0 && (
        <ActionRequiredCard
          total={actionStats?.systemTotal ?? 0}
          failedDelivery={actionStats?.failedDelivery}
          rescheduled={actionStats?.rescheduled}
          runnerFlagged={actionStats?.runnerFlagged}
          isLoading={actionLoading}
          href="/sales/action-required"
          title="Operations Alerts"
          subtitle="Orders across all users requiring immediate attention"
        />
      )}

      {/* Primary Operations KPIs */}
      <MissionSection icon={Activity} title="Operations Pipeline">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {primaryMetrics.map((stat) => (
            <Card 
              key={stat.label}
              className="cursor-pointer hover:shadow-md transition-all group"
              onClick={() => navigate(stat.href)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg shrink-0", stat.bgColor)}>
                    <stat.icon className={cn("h-4 w-4", stat.color)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                    {isLoading ? <Skeleton className="h-7 w-12 mt-0.5" /> : (
                      <p className="text-2xl font-bold tracking-tight tabular-nums">
                        <AnimatedCounter value={stat.value ?? 0} />
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </MissionSection>

      {/* System Health Strip */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {secondaryMetrics.map((stat) => (
          <Card 
            key={stat.label}
            className="cursor-pointer hover:shadow-sm transition-all"
            onClick={() => navigate(stat.href)}
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className={cn("p-1.5 rounded-md shrink-0", stat.bgColor)}>
                  <stat.icon className={cn("h-3.5 w-3.5", stat.color)} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-muted-foreground">{stat.label}</p>
                  {isLoading ? <Skeleton className="h-5 w-10" /> : (
                    <p className="text-base font-bold tabular-nums">
                      <AnimatedCounter value={stat.value ?? 0} />
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions & Live Activity */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <QuickActionTile icon={ShieldAlert} title="Operations Alert Center" subtitle="System-wide alerts" href="/sales/action-required" badge={actionStats?.systemTotal} iconColor="text-destructive" iconBg="bg-destructive/10" />
            <QuickActionTile icon={Package} title="Manage All Orders" subtitle="View booking orders" href="/sales/booking" />
            <QuickActionTile icon={FileCheck} title="Reconciliation" subtitle="Claims & payouts" href="/reconciliation/admin" iconColor="text-[hsl(var(--status-success))]" iconBg="bg-[hsl(var(--status-success)/0.1)]" />
            <QuickActionTile icon={AlertTriangle} title="Handle Disputes" subtitle="Resolve conflicts" href="/disputes" iconColor="text-destructive" iconBg="bg-destructive/10" />
            <QuickActionTile icon={TrendingUp} title="Leaderboard" subtitle="Performance rankings" href="/leaderboard" />
            <QuickActionTile icon={Users} title="Manage Users" subtitle="User accounts & roles" href="/settings/users" />
          </CardContent>
        </Card>

        {/* Live Activity Feed */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Live Activity
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[hsl(var(--status-success))]" />
                <span className="text-xs text-muted-foreground">Real-time</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
              </div>
            ) : activity && activity.length > 0 ? (
              <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                {activity.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-secondary/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={item.action.includes('create') || item.action.includes('insert') ? 'default' : item.action.includes('delete') ? 'destructive' : 'secondary'} 
                        className="text-[10px] font-medium px-2 py-0.5"
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
                <Clock className="h-6 w-6 mx-auto mb-2 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">No recent activity</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}