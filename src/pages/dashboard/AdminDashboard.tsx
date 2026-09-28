import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Package, ShoppingCart, Truck, CheckCircle, AlertTriangle,
  Receipt, PackageCheck, Users, ArrowRight, RefreshCw,
  TrendingUp, Warehouse, Settings,
} from 'lucide-react';
import { useAdminStats } from '@/hooks/useDashboardStats';
import { useAdminActionRequiredStats } from '@/hooks/useActionRequiredStats';

const linkStyle = 'group transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export function AdminDashboard() {
  const statsQuery = useAdminStats();
  const actionQuery = useAdminActionRequiredStats();
  const { data: stats, isLoading, isError } = statsQuery;
  const { data: actions } = actionQuery;
  const refreshing = statsQuery.isFetching || actionQuery.isFetching;
  const metrics = [
    { label: 'Booking', value: stats?.bookingOrders, icon: Package, detail: 'Orders being prepared', href: '/sales/booking' },
    { label: 'Ready', value: stats?.readyOrders, icon: ShoppingCart, detail: 'Ready for delivery', href: '/sales/ready' },
    { label: 'Pending delivery', value: stats?.pendingDelivery, icon: Truck, detail: 'Assigned or taken by Runner', href: '/runner/inbox' },
    { label: 'Delivered', value: stats?.deliveredOrders, icon: CheckCircle, detail: 'All completed deliveries', href: '/reconciliation/admin' },
  ];
  const resources = [
    { label: 'Active products', value: stats?.productsCount, icon: Package, href: '/inventory?tab=products' },
    { label: 'Claims', value: stats?.totalClaims, icon: Receipt, href: '/reconciliation/admin' },
    { label: 'Inbounds', value: stats?.totalInbounds, icon: PackageCheck, href: '/inbound/pending' },
    { label: 'Users', value: stats?.totalUsers, icon: Users, href: '/settings/users' },
  ];
  const shortcuts = [
    { title: 'Orders', description: 'Bookings and delivery progress', icon: ShoppingCart, href: '/orders' },
    { title: 'Finance', description: 'Claims, reconciliation and payouts', icon: Receipt, href: '/finance' },
    { title: 'Inventory', description: 'Stock, products and warehouses', icon: Warehouse, href: '/inventory' },
    { title: 'Team', description: 'User accounts and permissions', icon: Users, href: '/settings/users' },
    { title: 'Performance', description: 'Team results and leaderboard', icon: TrendingUp, href: '/leaderboard' },
    { title: 'System', description: 'Settings and administration', icon: Settings, href: '/system' },
  ];
  const attention = [
    { label: 'Failed deliveries', value: actions?.failedDelivery },
    { label: 'Rescheduled orders', value: actions?.rescheduled },
    { label: 'Runner flagged', value: actions?.runnerFlagged },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-6 sm:space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Administration</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Operations overview</h1>
          <p className="mt-2 text-sm text-muted-foreground">Track orders, resolve exceptions and keep deliveries moving.</p>
        </div>
        <Button variant="outline" size="sm" disabled={refreshing} onClick={() => { void statsQuery.refetch(); void actionQuery.refetch(); }}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
          {refreshing ? 'Updating…' : 'Refresh'}
        </Button>
      </header>

      {isError && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">Order counts could not be updated. Select Refresh to try again.</p>}

      <section aria-labelledby="order-overview-title">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="order-overview-title" className="text-base font-semibold">Order overview</h2>
          <span className="text-xs text-muted-foreground">Across all teams</span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map((metric) => (
            <Link key={metric.label} to={metric.href} className={`${linkStyle} rounded-2xl border border-border bg-card p-4 sm:p-5`}>
              <div className="mb-5 flex items-center justify-between">
                <metric.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </div>
              {isLoading ? <Skeleton className="mb-2 h-10 w-20" /> : <p className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">{isError ? '—' : (metric.value ?? 0).toLocaleString()}</p>}
              <h3 className="mt-2 text-sm font-medium">{metric.label}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{metric.detail}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <section aria-labelledby="attention-title" className="overflow-hidden rounded-2xl border border-primary/20 bg-card">
          <div className="border-b border-border bg-primary/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 id="attention-title" className="flex items-center gap-2 text-base font-semibold"><AlertTriangle className="h-4 w-4 text-primary" aria-hidden="true" />Needs attention</h2>
              {actionQuery.isLoading ? <Skeleton className="h-7 w-10" /> : <span className="text-2xl font-semibold tabular-nums">{actionQuery.isError ? '—' : actions?.systemTotal ?? 0}</span>}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Delivery exceptions across all teams.</p>
          </div>
          {actionQuery.isError ? <p role="alert" className="p-5 text-sm text-destructive">Alerts could not be loaded. Select Refresh to retry.</p> : (
            <div className="px-5">
              {attention.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 border-b border-border py-3.5 last:border-0">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  {actionQuery.isLoading ? <Skeleton className="h-5 w-8" /> : <span className="font-medium tabular-nums">{(item.value ?? 0).toLocaleString()}</span>}
                </div>
              ))}
              {!actionQuery.isLoading && actions?.systemTotal === 0 && <p className="pb-3 text-sm text-muted-foreground">No orders need attention right now.</p>}
            </div>
          )}
          <div className="grid grid-cols-2 border-t border-border text-sm font-medium">
            <Link to="/sales/action-required" className={`${linkStyle} flex items-center justify-center gap-2 p-4 text-primary`}>Review orders<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            <Link to="/disputes" className={`${linkStyle} border-l border-border p-4 text-center`}>View disputes</Link>
          </div>
        </section>

        <section aria-labelledby="workspace-title" className="rounded-2xl border border-border bg-card p-5">
          <h2 id="workspace-title" className="text-base font-semibold">Your workspace</h2>
          <p className="mt-1 text-xs text-muted-foreground">Go straight to the work you need.</p>
          <div className="mt-4 grid gap-1 sm:grid-cols-2">
            {shortcuts.map((item) => (
              <Link key={item.title} to={item.href} className={`${linkStyle} flex items-start gap-3 rounded-xl p-3`}>
                <span className="rounded-lg bg-muted p-2.5"><item.icon className="h-4 w-4 text-primary" aria-hidden="true" /></span>
                <div className="min-w-0 pt-0.5"><h3 className="text-sm font-medium">{item.title}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p></div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section aria-label="Business resources" className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-card lg:grid-cols-4">
        {resources.map((item) => (
          <Link key={item.label} to={item.href} className={`${linkStyle} flex items-center gap-3 p-4 sm:p-5`}>
            <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div><p className="text-xs text-muted-foreground">{item.label}</p>{isLoading ? <Skeleton className="mt-1 h-6 w-12" /> : <p className="mt-1 text-xl font-semibold tabular-nums">{isError ? '—' : (item.value ?? 0).toLocaleString()}</p>}</div>
          </Link>
        ))}
      </section>
    </div>
  );
}
