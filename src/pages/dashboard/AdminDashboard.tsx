import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  RefreshCw,
  RotateCcw,
  UserRound,
  UsersRound,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBND } from '@/lib/currency';
import { useAdminOperationsDashboard, type AdminOperationsDashboard, type OperationsRunnerMetric } from '@/hooks/useAdminOperationsDashboard';
import { cn } from '@/lib/utils';

const linkClass = 'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

function rateLabel(rate: number | null) {
  return rate === null ? 'No deliveries' : `${rate.toFixed(1)}% delivered`;
}

function formatDateLabel(value: string) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-BN', { day: 'numeric', month: 'short' });
}

function LoadingBlock() {
  return <div className="space-y-4" aria-label="Loading operations dashboard"><Skeleton className="h-36 w-full rounded-3xl" /><div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-44 rounded-3xl" /><Skeleton className="h-44 rounded-3xl" /></div><Skeleton className="h-52 w-full rounded-3xl" /></div>;
}

function DeliveryCard({ title, metric, href, comparison }: { title: string; metric: AdminOperationsDashboard['yesterday'] | AdminOperationsDashboard['month']; href: string; comparison?: string }) {
  const periodLabel = 'date' in metric
    ? formatDateLabel(metric.date)
    : `${formatDateLabel(metric.fromDate)} – ${formatDateLabel(metric.toDate)}`;
  return (
    <Link to={href} className={`${linkClass} group block rounded-3xl border border-border/70 bg-card p-5 hover:border-primary/50 hover:bg-primary/[0.03]`}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{title}</p><p className="mt-1 text-xs text-muted-foreground">{periodLabel}</p></div><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden="true" /></div>
      <p className="mt-5 text-3xl font-semibold tracking-tight tabular-nums">{metric.total === 0 ? '—' : `${metric.delivered.toLocaleString()} / ${metric.total.toLocaleString()}`}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{metric.total === 0 ? 'No deliveries expected' : rateLabel(metric.rate)}</p>
      {'date' in metric ? (
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs"><span><strong className="block text-foreground">{metric.delivered.toLocaleString()}</strong><span className="text-muted-foreground">Completed yesterday</span></span><span><strong className="block text-foreground">{metric.total.toLocaleString()}</strong><span className="text-muted-foreground">Expected yesterday</span></span></div>
      ) : (
        <div className="mt-4 grid grid-cols-4 gap-2 border-t border-border/60 pt-3 text-xs"><span><strong className="block text-foreground">{metric.delivered.toLocaleString()}</strong><span className="text-muted-foreground">Delivered</span></span><span><strong className="block text-foreground">{metric.failed.toLocaleString()}</strong><span className="text-muted-foreground">Failed</span></span><span><strong className="block text-foreground">{metric.rescheduled.toLocaleString()}</strong><span className="text-muted-foreground">Moved</span></span><span><strong className="block text-foreground">{metric.pending.toLocaleString()}</strong><span className="text-muted-foreground">Pending</span></span></div>
      )}
      {comparison && <p className="mt-3 text-xs font-medium text-primary">{comparison}</p>}
    </Link>
  );
}

function RunnerRow({ runner }: { runner: OperationsRunnerMetric }) {
  const needsAttention = runner.month.total > runner.month.delivered || runner.outstanding.amount > 0;
  return (
    <Link to={`/finance?tab=overview&runner=${encodeURIComponent(runner.runnerId)}`} className={`${linkClass} block min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-background/60 p-4 hover:border-primary/50 hover:bg-primary/[0.03]`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><UserRound className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><p className="truncate font-semibold">{runner.runnerName}</p>{needsAttention && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Review</span>}</div>{runner.areas && <p className="mt-1 truncate pl-6 text-xs text-muted-foreground">{runner.areas}</p>}</div><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /></div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3"><div className="min-w-0"><p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">Yesterday</p><p className="mt-1 font-semibold tabular-nums">{runner.yesterday.total ? `${runner.yesterday.delivered}/${runner.yesterday.total}` : '—'}</p><p className="truncate text-xs text-muted-foreground">{rateLabel(runner.yesterday.rate)}</p></div><div className="min-w-0"><p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">This month</p><p className="mt-1 font-semibold tabular-nums">{runner.month.total ? `${runner.month.delivered}/${runner.month.total}` : '—'}</p><p className="truncate text-xs text-muted-foreground">{rateLabel(runner.month.rate)}</p></div><div className="min-w-0"><p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">Outstanding</p><p className="mt-1 font-semibold tabular-nums">{runner.outstanding.amount ? formatBND(runner.outstanding.amount) : '—'}</p><p className="truncate text-xs text-muted-foreground">{runner.outstanding.orders ? `${runner.outstanding.orders} orders` : 'Cleared'}</p></div></div>
    </Link>
  );
}

function ActionRow({ label, value, href, icon: Icon, tone = 'text-foreground' }: { label: string; value: number; href: string; icon: typeof AlertTriangle; tone?: string }) {
  return <Link to={href} className={`${linkClass} flex items-center justify-between gap-3 rounded-xl px-3 py-3 hover:bg-muted/60`}><span className="flex min-w-0 items-center gap-2 text-sm"><Icon className={cn('h-4 w-4 shrink-0', tone)} aria-hidden="true" /><span className="truncate">{label}</span></span><span className={cn('font-semibold tabular-nums', tone)}>{value.toLocaleString()}</span></Link>;
}

export function AdminDashboard() {
  const dashboardQuery = useAdminOperationsDashboard();
  const data = dashboardQuery.data;
  const refreshing = dashboardQuery.isFetching;

  if (dashboardQuery.isLoading) return <LoadingBlock />;
  if (dashboardQuery.isError || !data) return <div className="rounded-3xl border border-destructive/20 bg-destructive/5 p-5" role="alert"><p className="font-semibold text-destructive">Operations data could not be loaded.</p><p className="mt-1 text-sm text-muted-foreground">The dashboard uses the production finance and delivery aggregates. Try again to reconnect.</p><Button variant="outline" size="sm" className="mt-4" onClick={() => void dashboardQuery.refetch()} disabled={refreshing}><RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />Retry</Button></div>;

  const monthDelta = data.month.rate !== null && data.month.previousRate !== null ? data.month.rate - data.month.previousRate : null;
  const monthComparison = monthDelta === null ? undefined : `${monthDelta >= 0 ? '↑' : '↓'} ${Math.abs(monthDelta).toFixed(1)}% vs last month`;
  const overviewHref = `/finance?tab=overview&month=${(data.yesterday.date || data.month.fromDate).slice(0, 7)}`;

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-8">
      <header className="flex items-end justify-between gap-4 border-b border-border/60 pb-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Administration</p><h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Operations control tower</h1><p className="mt-1 text-sm text-muted-foreground">Money, deliveries and issues that need your attention.</p></div><Button variant="ghost" size="icon" aria-label="Refresh operations data" onClick={() => void dashboardQuery.refetch()} disabled={refreshing}><RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} /></Button></header>

      <Link to="/finance?tab=claims" className={`${linkClass} group block rounded-3xl border border-primary/30 bg-primary/[0.06] p-5 hover:border-primary/60 md:p-6`}><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary"><CircleDollarSign className="h-4 w-4" aria-hidden="true" />Money outstanding</div><p className="mt-3 text-4xl font-semibold tracking-tight tabular-nums md:text-5xl">{formatBND(data.outstanding.amount)}</p><p className="mt-1 text-sm font-medium">Not claimed</p></div><ArrowRight className="h-5 w-5 text-primary transition-transform group-hover:translate-x-1" aria-hidden="true" /></div><div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-primary/15 pt-3 text-sm text-muted-foreground"><span>{data.outstanding.runners.toLocaleString()} runners</span><span>Oldest: {data.outstanding.oldestDays ? `${data.outstanding.oldestDays} days` : '—'}</span><span className="font-medium text-primary">View runner breakdown</span></div></Link>

      <div className="grid gap-4 sm:grid-cols-2"><DeliveryCard title="Yesterday" metric={data.yesterday} href={overviewHref} /><DeliveryCard title="This month" metric={data.month} href={`/finance?tab=overview&month=${data.month.fromDate.slice(0, 7)}`} comparison={monthComparison} /></div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"><section className="rounded-3xl border border-border/70 bg-card p-5" aria-labelledby="today-operations-title"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Today</p><h2 id="today-operations-title" className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{data.today.total.toLocaleString()} <span className="text-base font-medium text-muted-foreground">orders</span></h2></div><CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" /></div><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"><Link to="/orders?tab=ready" className={`${linkClass} rounded-xl bg-muted/50 p-3 hover:bg-muted`}><p className="text-xl font-semibold tabular-nums">{data.today.ready.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Ready</p></Link><Link to="/dispatch?tab=inbox" className={`${linkClass} rounded-xl bg-muted/50 p-3 hover:bg-muted`}><p className="text-xl font-semibold tabular-nums">{data.today.assigned.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Assigned</p></Link><Link to="/orders?tab=ready" className={`${linkClass} rounded-xl bg-muted/50 p-3 hover:bg-muted`}><p className={cn('text-xl font-semibold tabular-nums', data.today.unassigned > 0 && 'text-amber-700')}>{data.today.unassigned.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Unassigned</p></Link><Link to="/orders?tab=action-required" className={`${linkClass} rounded-xl bg-muted/50 p-3 hover:bg-muted`}><p className="text-xl font-semibold tabular-nums">{data.today.rescheduledToday.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Rescheduled today</p></Link></div></section><section className="rounded-3xl border border-border/70 bg-card p-5" aria-labelledby="attention-title"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Needs attention</p><h2 id="attention-title" className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{data.attention.total.toLocaleString()}</h2></div><AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" /></div><div className="mt-4 divide-y divide-border/60"><ActionRow label="Unassigned" value={data.attention.unassigned} href="/orders?tab=ready" icon={UsersRound} tone={data.attention.unassigned ? 'text-amber-700' : undefined} /><ActionRow label="Failed awaiting action" value={data.attention.failed} href="/orders?tab=action-required" icon={XCircle} tone={data.attention.failed ? 'text-destructive' : undefined} /><ActionRow label="Rescheduled" value={data.attention.rescheduled} href="/orders?tab=action-required" icon={RotateCcw} tone={data.attention.rescheduled ? 'text-amber-700' : undefined} /><ActionRow label="Pending over 24h" value={data.attention.pending24h} href="/orders?tab=ready" icon={Clock3} /><ActionRow label="Payment issues" value={data.attention.paymentIssues} href="/finance?tab=reconciliation" icon={CircleDollarSign} tone={data.attention.paymentIssues ? 'text-destructive' : undefined} /></div></section></div>

      <section className="rounded-3xl border border-border/70 bg-card p-5" aria-labelledby="runner-operations-title"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Runner operations</p><h2 id="runner-operations-title" className="mt-1 text-xl font-semibold">Where follow-up is needed</h2></div><Link to={overviewHref} className={`${linkClass} inline-flex items-center gap-1 text-sm font-medium text-primary`}>View all runners<ArrowRight className="h-4 w-4" /></Link></div>{data.runners.length === 0 ? <p className="mt-5 rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">No runner activity is available for this period.</p> : <div className="mt-4 grid gap-3 md:grid-cols-2">{data.runners.map((runner) => <RunnerRow key={runner.runnerId} runner={runner} />)}</div>}</section>

      {data.outstanding.byRunner.length > 0 && <section className="rounded-3xl border border-border/70 bg-card p-5" aria-labelledby="breakdown-title"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Runner breakdown</p><h2 id="breakdown-title" className="mt-1 text-xl font-semibold">Unclaimed settlement</h2></div><Link to="/finance?tab=claims" className={`${linkClass} text-sm font-medium text-primary`}>Open claims</Link></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data.outstanding.byRunner.slice(0, 6).map((row) => <Link key={row.runnerId || row.runnerName} to={row.runnerId ? `/finance?tab=overview&runner=${encodeURIComponent(row.runnerId)}` : '/finance?tab=claims'} className={`${linkClass} rounded-2xl border border-border/60 p-4 hover:border-primary/50`}><div className="flex items-start justify-between gap-2"><span className="font-medium">{row.runnerName}</span><ArrowRight className="h-4 w-4 text-muted-foreground" /></div>{row.areas && <p className="mt-1 text-xs text-muted-foreground">{row.areas}</p>}<p className="mt-3 text-lg font-semibold tabular-nums">{formatBND(row.amount)}</p><p className="text-xs text-muted-foreground">{row.orders.toLocaleString()} orders · oldest {row.oldestDays}d</p></Link>)}</div></section>}
    </div>
  );
}
