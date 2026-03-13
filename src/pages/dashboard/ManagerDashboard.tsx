import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Package, ShoppingCart, Truck, CheckCircle, AlertTriangle,
  Clock, Zap, ArrowRight
} from 'lucide-react';
import { useAdminStats, useRecentActivity } from '@/hooks/useDashboardStats';
import { useManagerActionRequiredStats } from '@/hooks/useActionRequiredStats';
import { ActionRequiredCard } from '@/components/dashboard/ActionRequiredCard';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { MissionSection } from '@/components/dashboard/MissionSection';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';
import { QuickActionTile } from '@/components/dashboard/QuickActionTile';

export function ManagerDashboard() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useAdminStats();
  const { data: actionStats, isLoading: actionLoading } = useManagerActionRequiredStats();
  const { data: activity, isLoading: activityLoading } = useRecentActivity();

  const statCards = [
    { label: 'Booking Orders', value: stats?.bookingOrders, icon: Package, color: 'text-primary', href: '/sales/booking' },
    { label: 'Ready Orders', value: stats?.readyOrders, icon: ShoppingCart, color: 'text-[hsl(var(--status-success))]', href: '/sales/ready' },
    { label: 'Pending Delivery', value: stats?.pendingDelivery, icon: Truck, color: 'text-[hsl(var(--status-pending))]', href: '/runner/inbox' },
    { label: 'Delivered', value: stats?.deliveredOrders, icon: CheckCircle, color: 'text-[hsl(var(--status-success))]', href: '/reconciliation/admin' },
    { label: 'Disputes', value: stats?.disputes, icon: AlertTriangle, color: 'text-destructive', href: '/disputes' },
  ];

  return (
    <div className="space-y-8">
      {/* Team Action Required */}
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

      {/* KPI Grid */}
      <MissionSection icon={Zap} title="Team Overview">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {statCards.map((stat) => (
            <Card 
              key={stat.label}
              className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group border-border/50 hover:border-primary/30 relative overflow-hidden"
              onClick={() => navigate(stat.href)}
            >
              <div className="absolute top-0 right-0 w-20 h-20 bg-secondary/30 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/10 transition-colors" />
              <CardContent className="pt-6 relative">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                    {isLoading ? <Skeleton className="h-9 w-16 mt-1" /> : (
                      <p className="text-3xl font-bold tracking-tight">
                        <AnimatedCounter value={stat.value ?? 0} />
                      </p>
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
      </MissionSection>

      {/* Quick Actions & Activity */}
      <div className="grid gap-6 md:grid-cols-2">
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
            <QuickActionTile icon={Package} title="New Order" subtitle="Create a booking" href="/sales/booking" />
            <QuickActionTile icon={AlertTriangle} title="Team Action Required" subtitle="Resolve pending items" href="/sales/action-required" badge={actionStats?.systemTotal} iconColor="text-[hsl(var(--status-warning))]" iconBg="bg-[hsl(var(--status-warning)/0.15)]" />
            <QuickActionTile icon={Package} title="Manage Products" subtitle="Product catalog" href="/products" />
            <QuickActionTile icon={Truck} title="Team Oversight" subtitle="Monitor team activity" href="/manager/oversight" />
            <QuickActionTile icon={CheckCircle} title="Stock Balance" subtitle="Inventory overview" href="/inventory" iconColor="text-[hsl(var(--status-success))]" iconBg="bg-[hsl(var(--status-success)/0.15)]" />
            <QuickActionTile icon={AlertTriangle} title="Handle Disputes" subtitle="Resolve conflicts" href="/disputes" iconColor="text-destructive" iconBg="bg-destructive/15" />
          </CardContent>
        </Card>

        {/* Recent Activity */}
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
            {activityLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
              </div>
            ) : activity && activity.length > 0 ? (
              <div className="space-y-2">
                {activity.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors border border-transparent hover:border-border/30">
                    <div className="flex items-center gap-3">
                      <Badge 
                        variant={item.action.includes('create') || item.action.includes('insert') ? 'default' : item.action.includes('delete') ? 'destructive' : 'secondary'}
                        className="text-xs font-medium px-2.5 py-1"
                      >
                        {item.action}
                      </Badge>
                      <span className="text-sm text-muted-foreground font-medium">
                        {item.entity_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
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
      </div>
    </div>
  );
}
