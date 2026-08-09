import { useEffect, useMemo, useState } from 'react';
import { addMonths, endOfMonth, endOfYear, format, getDay, getDaysInMonth, startOfMonth, startOfYear, subMonths } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardList, PackageCheck, RefreshCw, Truck, TriangleAlert } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { formatBND } from '@/lib/currency';
import { cn } from '@/lib/utils';
import {
  useFinanceOverviewAreas,
  useFinanceOverviewDay,
  useFinanceOverviewReport,
  useFinanceOverviewRunners,
  type FinanceOverviewDay,
  type FinanceOverviewOrder,
} from '@/hooks/useFinanceOverview';
import { useSearchParams } from 'react-router-dom';

type ViewMode = 'month' | 'year';
type DetailFilter = 'ALL' | 'ASSIGNED' | 'DELIVERED' | 'FAILED_DELIVERY' | 'RESCHEDULED' | 'OTHER';

const emptySummary = {
  assigned: 0, delivered: 0, failed: 0, rescheduled: 0, otherActionRequired: 0,
  openCurrent: 0, deliveredAmount: 0, codCount: 0, codAmount: 0, transferCount: 0, transferAmount: 0,
};

function MetricCard({ label, value, hint, icon: Icon, tone = 'text-foreground' }: { label: string; value: string; hint?: string; icon: typeof Truck; tone?: string }) {
  return (
    <Card className="border-border/60 bg-card/80">
      <CardContent className="flex items-start justify-between gap-3 p-4 md:p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className={cn('mt-2 text-xl font-semibold md:text-2xl', tone)}>{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="rounded-xl bg-muted p-2 text-muted-foreground"><Icon className="h-4 w-4" /></div>
      </CardContent>
    </Card>
  );
}

function CalendarDayCell({ day, metric, onSelect }: { day: number; metric?: FinanceOverviewDay; onSelect: () => void }) {
  const hasData = Boolean(metric && (metric.assigned || metric.delivered || metric.failed || metric.rescheduled || metric.otherActionRequired || metric.codAmount || metric.transferAmount));
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Day ${day}: ${metric?.assigned || 0} assigned, ${metric?.delivered || 0} delivered, ${metric?.failed || 0} failed, ${metric?.rescheduled || 0} rescheduled`}
      className={cn('min-h-[112px] min-w-0 overflow-hidden rounded-xl border p-1.5 text-left transition-colors hover:border-primary/60 hover:bg-muted/60 sm:min-h-[136px] sm:p-2', hasData ? 'border-border bg-card' : 'border-border/50 bg-muted/15')}
    >
      <span className="text-xs font-semibold sm:text-sm">{day}</span>
      {hasData ? (
        <div className="mt-2 space-y-1 text-[10px] leading-tight sm:text-[11px]">
          <p className="font-medium text-slate-700">A {metric?.assigned || 0}</p>
          <p className="font-medium text-emerald-700">D {metric?.delivered || 0}</p>
          <p className="font-medium text-red-700">F {metric?.failed || 0}</p>
          <p className="font-medium text-amber-700">R {metric?.rescheduled || 0}</p>
          {(metric?.codAmount || 0) > 0 && <p className="truncate font-medium text-sky-700">COD {formatBND(metric?.codAmount || 0)}</p>}
        </div>
      ) : <p className="mt-3 text-[10px] text-muted-foreground sm:text-xs">No results</p>}
    </button>
  );
}

function DetailOrder({ order }: { order: FinanceOverviewOrder }) {
  const labels: Record<FinanceOverviewOrder['classification'], string> = {
    ASSIGNED: 'Assigned', DELIVERED: 'Delivered', FAILED_DELIVERY: 'Failed', RESCHEDULED: 'Rescheduled', RUNNER_FLAGGED: 'Other action', MANUAL: 'Other action',
  };
  const tones: Record<FinanceOverviewOrder['classification'], string> = {
    ASSIGNED: 'border-slate-200 bg-slate-50 text-slate-700', DELIVERED: 'border-emerald-200 bg-emerald-50 text-emerald-700', FAILED_DELIVERY: 'border-red-200 bg-red-50 text-red-700', RESCHEDULED: 'border-amber-200 bg-amber-50 text-amber-700', RUNNER_FLAGGED: 'border-blue-200 bg-blue-50 text-blue-700', MANUAL: 'border-blue-200 bg-blue-50 text-blue-700',
  };
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="font-mono text-sm font-semibold">{order.orderCode}</p><p className="mt-1 text-sm font-medium">{order.customerName || 'Unnamed customer'}</p>{order.area && <p className="mt-1 text-xs text-muted-foreground">{order.area}</p>}</div>
        <Badge className={cn('border', tones[order.classification])}>{labels[order.classification]}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div><p className="text-xs text-muted-foreground">Order total</p><p className="font-semibold">{formatBND(order.totalAmount)}</p></div>
        <div><p className="text-xs text-muted-foreground">Payment</p><p className="font-medium">{order.paymentMethod || '-'}</p></div>
        <div><p className="text-xs text-muted-foreground">Source</p><p className="font-medium">{order.source.replaceAll('_', ' ')}</p></div>
        {order.rescheduleDate && <div><p className="text-xs text-muted-foreground">Next delivery</p><p className="font-medium text-amber-700">{order.rescheduleDate}</p></div>}
      </div>
      {order.reason && <p className="mt-3 text-xs text-muted-foreground">{order.reason}</p>}
    </div>
  );
}

export default function AdminOverview() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [runnerId, setRunnerId] = useState('');
  const [area, setArea] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailFilter, setDetailFilter] = useState<DetailFilter>('ALL');
  const [preferencesReady, setPreferencesReady] = useState(false);
  const { data: runners = [], isLoading: runnersLoading } = useFinanceOverviewRunners();
  const { data: areas = [], isLoading: areasLoading } = useFinanceOverviewAreas();

  useEffect(() => {
    if (!user?.id || preferencesReady) return;
    const saved = JSON.parse(localStorage.getItem(`tomu:finance-overview:${user.id}`) || '{}') as { runnerId?: string; area?: string; month?: string; viewMode?: ViewMode };
    const month = searchParams.get('month') || saved.month;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [year, monthNumber] = month.split('-').map(Number);
      setCalendarMonth(new Date(year, monthNumber - 1, 1));
    }
    setRunnerId(searchParams.get('runner') ?? saved.runnerId ?? '');
    setArea(searchParams.get('area') ?? saved.area ?? '');
    setViewMode((searchParams.get('view') as ViewMode) || saved.viewMode || 'month');
    setPreferencesReady(true);
  }, [preferencesReady, searchParams, user?.id]);

  useEffect(() => {
    if (!preferencesReady || !user?.id) return;
    const month = format(calendarMonth, 'yyyy-MM');
    localStorage.setItem(`tomu:finance-overview:${user.id}`, JSON.stringify({ runnerId, area, month, viewMode }));
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'overview');
    next.set('month', month);
    next.set('view', viewMode);
    if (runnerId) next.set('runner', runnerId); else next.delete('runner');
    if (area) next.set('area', area); else next.delete('area');
    setSearchParams(next, { replace: true });
  }, [area, calendarMonth, preferencesReady, runnerId, searchParams, setSearchParams, user?.id, viewMode]);

  useEffect(() => {
    if (runners.length && runnerId && !runners.some((runner) => runner.id === runnerId)) setRunnerId('');
  }, [runnerId, runners]);
  useEffect(() => {
    if (areas.length && area && !areas.includes(area)) setArea('');
  }, [area, areas]);

  const fromDate = format(viewMode === 'year' ? startOfYear(calendarMonth) : startOfMonth(calendarMonth), 'yyyy-MM-dd');
  const toDate = format(viewMode === 'year' ? endOfYear(calendarMonth) : endOfMonth(calendarMonth), 'yyyy-MM-dd');
  const reportQuery = useFinanceOverviewReport({ runnerId: runnerId || null, area: area || null, fromDate, toDate });
  const dayQuery = useFinanceOverviewDay({ runnerId: runnerId || null, area: area || null, date: selectedDate });
  const report = reportQuery.data;
  const summary = report?.summary || emptySummary;
  const daysByDate = useMemo(() => new Map((report?.days || []).map((day) => [day.date, day])), [report?.days]);
  const yearMonths = useMemo(() => viewMode === 'year' ? Array.from({ length: 12 }, (_, month) => {
    const prefix = `${format(calendarMonth, 'yyyy')}-${String(month + 1).padStart(2, '0')}`;
    const monthDays = (report?.days || []).filter((day) => day.date.startsWith(prefix));
    return { month, assigned: monthDays.reduce((n, day) => n + day.assigned, 0), delivered: monthDays.reduce((n, day) => n + day.delivered, 0), failed: monthDays.reduce((n, day) => n + day.failed, 0), rescheduled: monthDays.reduce((n, day) => n + day.rescheduled, 0), cod: monthDays.reduce((n, day) => n + day.codAmount, 0) };
  }) : [], [calendarMonth, report?.days, viewMode]);
  const detailOrders = useMemo(() => {
    const orders = dayQuery.data?.orders || [];
    if (detailFilter === 'ALL') return orders;
    if (detailFilter === 'OTHER') return orders.filter((order) => order.classification === 'RUNNER_FLAGGED' || order.classification === 'MANUAL');
    return orders.filter((order) => order.classification === detailFilter);
  }, [dayQuery.data?.orders, detailFilter]);

  const movePeriod = (direction: -1 | 1) => { setSelectedDate(null); setCalendarMonth((current) => direction === 1 ? addMonths(current, viewMode === 'year' ? 12 : 1) : subMonths(current, viewMode === 'year' ? 12 : 1)); };
  const monthDays = viewMode === 'month' ? getDaysInMonth(calendarMonth) : 0;
  const firstWeekday = viewMode === 'month' ? (getDay(startOfMonth(calendarMonth)) + 6) % 7 : 0;
  const runnerName = runnerId ? runners.find((runner) => runner.id === runnerId)?.display_name || runnerId : 'All permitted runners';
  const detailSummary = dayQuery.data?.summary;
  const detailTabs: Array<{ key: DetailFilter; label: string; count: number }> = [
    { key: 'ALL', label: 'All', count: detailOrders.length },
    { key: 'ASSIGNED', label: 'Assigned', count: detailSummary?.assigned || 0 },
    { key: 'DELIVERED', label: 'Delivered', count: detailSummary?.delivered || 0 },
    { key: 'FAILED_DELIVERY', label: 'Failed', count: detailSummary?.failed || 0 },
    { key: 'RESCHEDULED', label: 'Rescheduled', count: detailSummary?.rescheduled || 0 },
    { key: 'OTHER', label: 'Other action', count: detailSummary?.otherActionRequired || 0 },
  ];

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1400px] space-y-5 p-1 md:p-2">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Finance overview</p><h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Operational results</h1><p className="mt-1 text-sm text-muted-foreground">Delivered and Action Required metrics use the same canonical order sources as Orders.</p></div>

        <Card className="border-border/60 bg-card/80"><CardContent className="flex flex-wrap items-center gap-2 p-4">
          <select aria-label="Runner" value={runnerId} onChange={(event) => { setRunnerId(event.target.value); setSelectedDate(null); }} disabled={runnersLoading} className="h-10 min-w-[190px] rounded-lg border border-border bg-background px-3 text-sm"><option value="">All permitted runners</option>{runners.map((runner) => <option key={runner.id} value={runner.id}>{runner.display_name || runner.email || runner.id}</option>)}</select>
          <select aria-label="Area" value={area} onChange={(event) => { setArea(event.target.value); setSelectedDate(null); }} disabled={areasLoading} className="h-10 min-w-[170px] rounded-lg border border-border bg-background px-3 text-sm"><option value="">All areas</option>{areas.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <input type="month" aria-label="Report month" value={format(calendarMonth, 'yyyy-MM')} onChange={(event) => { const [year, month] = event.target.value.split('-').map(Number); if (year && month) { setCalendarMonth(new Date(year, month - 1, 1)); setViewMode('month'); setSelectedDate(null); } }} className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
          <div className="flex rounded-lg border border-border bg-muted/40 p-1" role="group" aria-label="Report view">{(['month', 'year'] as const).map((mode) => <button key={mode} type="button" onClick={() => { setViewMode(mode); setSelectedDate(null); }} className={cn('rounded-md px-3 py-1.5 text-sm capitalize', viewMode === mode ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground')}>{mode}</button>)}</div>
          <Button variant="outline" size="sm" onClick={() => { setRunnerId(''); setArea(''); setCalendarMonth(new Date()); setViewMode('month'); setSelectedDate(null); }}>Reset</Button>
          <Button variant="ghost" size="icon" aria-label="Refresh report" onClick={() => void reportQuery.refetch()}><RefreshCw className={cn(reportQuery.isFetching && 'animate-spin')} /></Button>
        </CardContent></Card>

        {reportQuery.isError ? <Card className="border-red-200 bg-red-50/50"><CardContent className="flex items-center justify-between gap-3 p-5 text-sm text-red-800"><span>Finance Overview could not be loaded. No zero values were substituted for this error.</span><Button variant="outline" size="sm" onClick={() => void reportQuery.refetch()}>Retry</Button></CardContent></Card> : reportQuery.isLoading || !report ? <Skeleton className="h-[420px] w-full" /> : <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Delivered" value={String(summary.delivered)} hint={formatBND(summary.deliveredAmount)} icon={PackageCheck} tone="text-emerald-700" /><MetricCard label="Failed" value={String(summary.failed)} hint="Canonical Action Required" icon={TriangleAlert} tone="text-red-700" /><MetricCard label="Rescheduled" value={String(summary.rescheduled)} hint="Delivery Tomorrow / reschedule" icon={ClipboardList} tone="text-amber-700" /><MetricCard label="Delivered amount" value={formatBND(summary.deliveredAmount)} hint={`COD ${formatBND(summary.codAmount)} · Transfer ${formatBND(summary.transferAmount)}`} icon={CircleDollarSign} /></div>
          <Card className="border-border/60 bg-card/80"><CardHeader className="p-4 pb-2"><CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4 text-primary" /> Open / In Progress</CardTitle><p className="text-sm text-muted-foreground">Current active workload snapshot; it is not a historical Pending subtraction.</p></CardHeader><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-2xl font-semibold">{summary.openCurrent}</p><p className="text-xs text-muted-foreground">Open orders</p></div>{[['Booking', report.open.booking], ['Ready', report.open.ready], ['Assigned / Delivery', report.open.assignedDelivery], ['Awaiting Runner Acceptance', report.open.awaitingRunnerAcceptance], ['Future Scheduled', report.open.futureScheduled], ['Other unresolved', report.open.otherUnresolved]].map(([label, value]) => <div key={label as string} className="rounded-lg border border-border/60 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}</CardContent></Card>
          <Card className="min-w-0 overflow-hidden border-border/60 bg-card/80"><CardHeader className="flex flex-row items-center justify-between p-4 pb-3 sm:p-6 sm:pb-3"><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-primary" /> {viewMode === 'year' ? format(calendarMonth, 'yyyy') : format(calendarMonth, 'MMMM yyyy')}</CardTitle><div className="flex items-center gap-2"><Button variant="outline" size="icon" aria-label="Previous period" onClick={() => movePeriod(-1)}><ChevronLeft /></Button><Button variant="outline" size="icon" aria-label="Next period" onClick={() => movePeriod(1)}><ChevronRight /></Button></div></CardHeader><CardContent className="px-0 pb-4 sm:p-6 sm:pt-0">
            {viewMode === 'month' ? <><div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:gap-2 sm:text-xs">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}</div><div className="grid grid-cols-7 gap-1 sm:gap-2">{Array.from({ length: firstWeekday }, (_, index) => <div key={`blank-${index}`} />)}{Array.from({ length: monthDays }, (_, index) => { const day = index + 1; const date = format(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day), 'yyyy-MM-dd'); return <CalendarDayCell key={date} day={day} metric={daysByDate.get(date)} onSelect={() => { setSelectedDate(date); setDetailFilter('ALL'); }} />; })}</div></> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{yearMonths.map((month) => <button key={month.month} type="button" onClick={() => { setCalendarMonth(new Date(calendarMonth.getFullYear(), month.month, 1)); setViewMode('month'); }} className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/60 hover:bg-muted/40"><div className="flex items-center justify-between"><h2 className="font-semibold">{format(new Date(calendarMonth.getFullYear(), month.month, 1), 'MMMM')}</h2><span className="text-xs text-muted-foreground">COD {formatBND(month.cod)}</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Assigned</p><p className="font-semibold">{month.assigned}</p></div><div><p className="text-xs text-muted-foreground">Delivered</p><p className="font-semibold text-emerald-700">{month.delivered}</p></div><div><p className="text-xs text-muted-foreground">Failed</p><p className="font-semibold text-red-700">{month.failed}</p></div><div><p className="text-xs text-muted-foreground">Rescheduled</p><p className="font-semibold text-amber-700">{month.rescheduled}</p></div></div></button>)}</div>}
          </CardContent></Card>
        </>}
      </div>

      <Sheet open={Boolean(selectedDate)} onOpenChange={(open) => { if (!open) setSelectedDate(null); }}><SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-2xl px-4 pb-8 sm:px-6"><SheetHeader className="mx-auto w-full max-w-4xl pb-4 text-left"><SheetTitle>Daily operational results · {selectedDate}</SheetTitle><SheetDescription>Each tab is the exact order/event list behind the selected count. Runner: {runnerName}. Area: {area || 'All areas'}.</SheetDescription></SheetHeader><div className="mx-auto w-full max-w-4xl space-y-4">{dayQuery.isLoading ? <Skeleton className="h-32 w-full" /> : dayQuery.isError ? <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">Daily details could not be loaded. Please retry.</div> : dayQuery.data && <><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{detailTabs.map((tab) => <button key={tab.key} type="button" onClick={() => setDetailFilter(tab.key)} className={cn('rounded-lg border px-3 py-2 text-left text-xs', detailFilter === tab.key ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground')}><span className="block font-medium">{tab.label}</span><span className="mt-1 block text-base font-semibold">{tab.count}</span></button>)}</div><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{detailOrders.length} row(s) shown</span><span>Asia/Brunei · {dayQuery.data.date}</span></div><div className="space-y-3">{detailOrders.map((order) => <DetailOrder key={`${order.eventId}-${order.orderId}`} order={order} />)}</div>{detailOrders.length === 0 && <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No records for this filter.</div>}</>}</div></SheetContent></Sheet>
    </AppLayout>
  );
}
