import { useMemo, useState } from 'react';
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  getDay,
  parseISO,
  setMonth,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
} from 'date-fns';
import { AlertCircle, BarChart3, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import {
  groupDriverAnalyticsOrders,
  normalizeDriverAnalyticsMetrics,
  useRunnerDriverAnalytics,
  type DriverAnalyticsDay,
  type DriverAnalyticsOrder,
  type DriverAnalyticsSummary,
} from '@/hooks/useDriverAnalytics';
import { useMyAssistantScope } from '@/hooks/useRunnerAssistants';
import { useRunnerDrivers } from '@/hooks/useDrivers';
import { formatBND } from '@/lib/currency';
import {
  getDriverAnalyticsCalendarCell,
} from '@/lib/driverAnalytics';
import {
  filterDriverPaymentOrders,
  getDriverPaymentFilterLabel,
  getDriverPaymentSummary,
  sortDriverPaymentOrders,
  type DriverPaymentFilter,
  type DriverPaymentSort,
} from '@/lib/driverPaymentSummary';
import { cn } from '@/lib/utils';

type Period = 'today' | 'week' | 'month' | 'year' | 'custom';

const periodOptions: Array<{ value: Period; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'custom', label: 'Custom' },
];

const orderGroupDefinitions = [
  { key: 'INACTIVE', label: 'Inactive', description: 'Driver assignment ended.' },
  { key: 'RESCHEDULED', label: 'Rescheduled', description: 'Reschedule outcome recorded.' },
  { key: 'DELIVERED', label: 'Delivered', description: 'Delivered and accepted by Runner.' },
  { key: 'FAILED', label: 'Failed', description: 'Failed delivery and accepted by Runner.' },
  { key: 'ACTIVE', label: 'Active', description: 'Active Driver assignment.' },
  { key: 'PENDING_ACCEPTANCE', label: 'Pending acceptance', description: 'Waiting for Runner acceptance.' },
] as const;

const summaryKeys: Array<keyof DriverAnalyticsSummary> = [
  'deliveredOrders',
  'totalSales',
  'cashAmount',
  'cashOrderCount',
  'cashOnHand',
  'cashOnHandCount',
  'transferAmount',
  'transferOrderCount',
  'runnerAcceptedOrders',
  'runnerAcceptedAmount',
  'assigned',
  'delivered',
  'deliveryRate',
  'failed',
  'inactive',
  'pending',
  'pendingAcceptance',
  'pendingAcceptanceAmount',
  'totalAssignedSales',
  'acceptedSales',
  'acceptedAmount',
  'pendingSales',
  'cashCollected',
  'cashCollectedCount',
  'cashPendingSettlement',
  'cashPendingSettlementCount',
  'transfer',
  'transferCount',
  'assignedOrders',
  'acceptedFailedOrders',
  'pendingCashAmount',
  'pendingCashOrderCount',
  'pendingTransferAmount',
  'pendingTransferOrderCount',
];

function dateKey(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

function addSummaries(summaries: DriverAnalyticsSummary[]) {
  const total = normalizeDriverAnalyticsMetrics();
  summaries.forEach((summary) => {
    summaryKeys.forEach((key) => {
      if (key === 'deliveryRate') return;
      total[key] += Number(summary[key] || 0);
    });
  });
  total.deliveryRate = total.assignedOrders > 0
    ? (total.deliveredOrders / total.assignedOrders) * 100
    : 0;
  return total;
}

function formatTimestamp(value?: string | null) {
  if (!value) return 'Timestamp unavailable';
  return new Intl.DateTimeFormat('en-BN', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function getDriverName(link: { driver_id: string; driver?: { display_name?: string | null; email?: string | null } | null }) {
  return link.driver?.display_name || link.driver?.email || link.driver_id;
}

function mergeSelectedDays(days: DriverAnalyticsDay[]) {
  if (days.length === 0) return null;
  return {
    date: days[0].date,
    summary: addSummaries(days.map((day) => day.summary)),
    orders: days.flatMap((day) => day.orders),
  } satisfies DriverAnalyticsDay;
}

export default function RunnerDriverAnalyticsPage() {
  const { profile } = useAuth();
  const isAssistant = profile?.role === 'runner_assistant';
  const { data: assistantScope, isLoading: assistantScopeLoading } = useMyAssistantScope(isAssistant);
  const runnerIds = profile?.role === 'runner'
    ? [profile.id]
    : isAssistant
      ? (assistantScope?.analyticsRunnerIds || [])
      : [];
  const { data: driverLinks = [], isLoading: driversLoading } = useRunnerDrivers(runnerIds);

  const [period, setPeriod] = useState<Period>('month');
  const [calendarMonth, setCalendarMonth] = useState(startOfMonth(new Date()));
  const [customFrom, setCustomFrom] = useState(dateKey(startOfMonth(new Date())));
  const [customTo, setCustomTo] = useState(dateKey(new Date()));
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<DriverPaymentFilter>('ALL');
  const [paymentSort, setPaymentSort] = useState<DriverPaymentSort>('RECENT');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const range = useMemo(() => {
    const now = new Date();
    if (period === 'today') return { from: dateKey(now), to: dateKey(now) };
    if (period === 'week') {
      return {
        from: dateKey(startOfWeek(now, { weekStartsOn: 1 })),
        to: dateKey(endOfWeek(now, { weekStartsOn: 1 })),
      };
    }
    if (period === 'year') return { from: dateKey(startOfYear(calendarMonth)), to: dateKey(endOfYear(calendarMonth)) };
    if (period === 'custom') return { from: customFrom, to: customTo };
    return { from: dateKey(startOfMonth(calendarMonth)), to: dateKey(endOfMonth(calendarMonth)) };
  }, [calendarMonth, customFrom, customTo, period]);

  const summaryQuery = useRunnerDriverAnalytics(runnerIds, {
    dateFrom: range.from,
    dateTo: range.to,
    calendarFrom: dateKey(startOfMonth(calendarMonth)),
    calendarTo: dateKey(endOfMonth(calendarMonth)),
    driverId: selectedDriverId || undefined,
    includeDetail: false,
  });
  const detailQuery = useRunnerDriverAnalytics(runnerIds, {
    dateFrom: range.from,
    dateTo: range.to,
    calendarFrom: dateKey(startOfMonth(calendarMonth)),
    calendarTo: dateKey(endOfMonth(calendarMonth)),
    detailDate: selectedDate,
    driverId: selectedDriverId || undefined,
    includeDetail: true,
    enabled: !summaryQuery.isLoading && !summaryQuery.isError,
  });
  const summaryRecords = summaryQuery.data || [];
  const detailRecords = detailQuery.data || [];
  const driverRecords = useMemo(() => {
    const detailsByDriver = new Map(detailRecords.map((record) => [record.driverId, record.day]));
    return summaryRecords.map((record) => ({
      ...record,
      day: detailsByDriver.get(record.driverId) || null,
    }));
  }, [detailRecords, summaryRecords]);
  const isLoading = summaryQuery.isLoading;
  const isError = summaryQuery.isError;
  const error = summaryQuery.error;
  const refetch = summaryQuery.refetch;
  const detailLoading = detailQuery.isLoading;

  const summary = useMemo(
    () => addSummaries(driverRecords.map((record) => record.analytics.summary)),
    [driverRecords],
  );
  const daily = useMemo(() => {
    const byDate = new Map<string, DriverAnalyticsSummary[]>();
    driverRecords.forEach((record) => record.analytics.daily.forEach((day) => {
      byDate.set(day.date, [...(byDate.get(day.date) || []), day]);
    }));
    return Array.from(byDate.entries()).map(([date, summaries]) => ({ date, ...addSummaries(summaries) }));
  }, [driverRecords]);
  const monthly = useMemo(() => {
    const byMonth = new Map<string, DriverAnalyticsSummary[]>();
    driverRecords.forEach((record) => record.analytics.monthly.forEach((month) => {
      byMonth.set(month.month, [...(byMonth.get(month.month) || []), month]);
    }));
    return Array.from(byMonth.entries()).map(([month, summaries]) => ({ month, ...addSummaries(summaries) }));
  }, [driverRecords]);
  const selectedDay = useMemo(
    () => mergeSelectedDays(driverRecords.map((record) => record.day).filter((day): day is DriverAnalyticsDay => Boolean(day))),
    [driverRecords],
  );
  const filteredOrders = useMemo(
    () => filterDriverPaymentOrders(selectedDay?.orders || [], paymentFilter),
    [paymentFilter, selectedDay?.orders],
  );
  const sortedOrders = useMemo(
    () => sortDriverPaymentOrders(filteredOrders, paymentSort),
    [filteredOrders, paymentSort],
  );
  const orderGroups = useMemo(() => groupDriverAnalyticsOrders(sortedOrders), [sortedOrders]);
  const paymentTotals = useMemo(
    () => filteredOrders.reduce((totals, order) => {
      const payment = getDriverPaymentSummary(order);
      totals.cash += payment.cashAmount;
      totals.transfer += payment.transferAmount;
      totals.total += payment.totalAmount;
      return totals;
    }, { cash: 0, transfer: 0, total: 0 }),
    [filteredOrders],
  );
  const leadingDays = (getDay(startOfMonth(calendarMonth)) + 6) % 7;
  const yearMonths = useMemo(() => Array.from({ length: 12 }, (_, monthIndex) => ({
    monthIndex,
    ...monthly.find((item) => Number(item.month.slice(5, 7)) === monthIndex + 1),
  })), [monthly]);
  const selectedDaySummary = selectedDay?.summary || summary;
  const accessLoading = assistantScopeLoading || (isAssistant && !assistantScope);

  const selectDate = (date: string) => {
    setSelectedDate(date);
    setOpenGroups({});
  };

  if (accessLoading) return <Skeleton className="h-96 w-full" />;

  if (runnerIds.length === 0) {
    return (
      <Card className="p-6 text-center">
        <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-3 text-lg font-bold">Driver Analytics access is not enabled</h2>
        <p className="mt-1 text-sm text-muted-foreground">Ask an administrator to enable Driver Analytics for this Runner Assistant.</p>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4 overflow-x-hidden pb-24">
      <header className="border-b border-border pb-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Finance</p>
        <h1 className="mt-1 text-2xl font-bold">Driver Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Track delivery results and payment totals for your assigned drivers.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Select value={selectedDriverId || 'all'} onValueChange={(value) => setSelectedDriverId(value === 'all' ? '' : value)}>
          <SelectTrigger aria-label="Filter by driver" className="h-11">
            <SelectValue placeholder="All drivers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All drivers</SelectItem>
            {driverLinks.map((link) => (
              <SelectItem key={link.driver_id} value={link.driver_id}>{getDriverName(link)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              className={cn(
                'h-9 shrink-0 rounded-md px-3 text-sm font-semibold transition-colors',
                period === option.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {period === 'custom' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-muted-foreground">From<Input className="mt-1" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label>
          <label className="text-xs font-semibold text-muted-foreground">To<Input className="mt-1" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-20 w-full" />)}
        </div>
      ) : isError ? (
        <div className="flex items-start gap-3 border-y border-destructive/30 py-4 text-sm">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1"><p className="font-semibold">Unable to load Driver Analytics</p><p className="mt-1 break-words text-muted-foreground">{error instanceof Error ? error.message : 'Please try again.'}</p></div>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry</Button>
        </div>
      ) : (
        <section className="grid grid-cols-2 gap-x-4 gap-y-4 border-b border-border pb-4 sm:grid-cols-3">
          <Metric label="Delivered / assigned" value={`${summary.deliveredOrders} / ${summary.assignedOrders}`} note={`${Math.round(summary.deliveryRate)}% complete · ${summary.pendingAcceptance} awaiting Runner`} />
          <Metric label="Total (Cash + Transfer)" value={formatBND(summary.totalSales)} />
          <Metric label="Cash" value={formatBND(summary.cashAmount)} note={`${summary.cashOrderCount} orders`} />
          <Metric label="Transfer" value={formatBND(summary.transferAmount)} note={`${summary.transferOrderCount} orders`} />
          <Metric label="Pending cash / transfer" value={`${formatBND(summary.pendingCashAmount)} / ${formatBND(summary.pendingTransferAmount)}`} note={`${summary.pendingCashOrderCount} cash · ${summary.pendingTransferOrderCount} transfer`} />
          <Metric label="Drivers shown" value={String(driverRecords.length || (driversLoading ? '…' : 0))} />
        </section>
      )}

      {period === 'year' ? (
        <section>
          <CalendarHeader label={format(calendarMonth, 'yyyy')} onPrevious={() => setCalendarMonth(new Date(calendarMonth.getFullYear() - 1, 0, 1))} onNext={() => setCalendarMonth(new Date(calendarMonth.getFullYear() + 1, 0, 1))} previousLabel="Previous year" nextLabel="Next year" />
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
            {yearMonths.map((month) => {
              const selectedMonth = setMonth(startOfYear(calendarMonth), month.monthIndex);
              const cell = getDriverAnalyticsCalendarCell(month.deliveredOrders || 0, month.assignedOrders || 0);
              return (
                <button key={month.monthIndex} type="button" className="min-h-24 bg-background p-3 text-left transition-colors hover:bg-muted" onClick={() => { setCalendarMonth(selectedMonth); selectDate(dateKey(startOfMonth(selectedMonth))); setPeriod('month'); }}>
                  <span className="text-sm font-semibold">{format(selectedMonth, 'MMM')}</span>
                  <span className="mt-3 block text-xl font-bold tabular-nums">{cell.label}</span>
                  <span className="text-xs text-muted-foreground">accepted delivered / assigned</span>
                  <span className="mt-2 block text-[10px] text-muted-foreground">Total {formatBND(month.totalSales || 0)} · Cash {formatBND(month.cashAmount || 0)} · Transfer {formatBND(month.transferAmount || 0)}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <section>
          <CalendarHeader label={format(calendarMonth, 'MMMM yyyy')} onPrevious={() => { const month = subMonths(calendarMonth, 1); setCalendarMonth(month); selectDate(dateKey(startOfMonth(month))); }} onNext={() => { const month = addMonths(calendarMonth, 1); setCalendarMonth(month); selectDate(dateKey(startOfMonth(month))); }} previousLabel="Previous month" nextLabel="Next month" />
          <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-muted-foreground sm:text-xs">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day} className="min-w-0 py-2"><span className="sm:hidden">{day.slice(0, 1)}</span><span className="hidden sm:inline">{day}</span></div>)}</div>
          <div className="grid w-full min-w-0 grid-cols-7 border-l border-t border-border">
            {Array.from({ length: leadingDays }).map((_, index) => <div key={`blank-${index}`} className="h-14 min-w-0 border-b border-r border-border bg-muted/30 sm:aspect-square sm:h-auto" />)}
            {daily.map((day) => {
              const cell = getDriverAnalyticsCalendarCell(day.deliveredOrders, day.assignedOrders);
              return (
                <button key={day.date} type="button" aria-label={`${format(parseISO(day.date), 'd MMMM yyyy')}: ${cell.label}`} onClick={() => selectDate(day.date)} className={cn('h-14 min-w-0 overflow-hidden border-b border-r border-border p-1 text-left transition-colors hover:bg-muted sm:aspect-square sm:h-auto', selectedDate === day.date && 'bg-primary/10 ring-2 ring-inset ring-primary')}>
                  <span className="block text-xs font-semibold">{format(parseISO(day.date), 'd')}</span>
                  <span className={cn('mt-1 block whitespace-nowrap text-center text-[10px] font-bold tabular-nums sm:text-sm', cell.status === 'complete' && 'text-emerald-700 dark:text-emerald-400', cell.status === 'partial' && 'text-amber-700 dark:text-amber-400', cell.status === 'zero' && 'text-red-700 dark:text-red-400', cell.status === 'empty' && 'text-muted-foreground')}>{cell.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="border-t border-border pt-5">
        <p className="text-xs font-bold uppercase text-muted-foreground">Selected day</p>
        <h2 className="mt-1 font-bold">{format(parseISO(selectedDate), 'dd MMMM yyyy')}</h2>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Select value={paymentFilter} onValueChange={(value) => setPaymentFilter(value as DriverPaymentFilter)}><SelectTrigger className="h-10 rounded-full"><SelectValue placeholder="Payment" /></SelectTrigger><SelectContent>{(['ALL', 'CASH', 'TRANSFER', 'CASH_TRANSFER'] as DriverPaymentFilter[]).map((filter) => <SelectItem key={filter} value={filter}>{getDriverPaymentFilterLabel(filter)}</SelectItem>)}</SelectContent></Select>
          <Select value={paymentSort} onValueChange={(value) => setPaymentSort(value as DriverPaymentSort)}><SelectTrigger className="h-10 rounded-full"><SelectValue placeholder="Sort" /></SelectTrigger><SelectContent><SelectItem value="RECENT">Recent first</SelectItem><SelectItem value="PAYMENT">Payment type</SelectItem><SelectItem value="AMOUNT_DESC">Amount: high to low</SelectItem><SelectItem value="AMOUNT_ASC">Amount: low to high</SelectItem></SelectContent></Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="font-semibold text-foreground">{filteredOrders.length} orders shown</span><span>Cash {formatBND(paymentTotals.cash)}</span><span>Transfer {formatBND(paymentTotals.transfer)}</span><span>Total {formatBND(paymentTotals.total)}</span></div>
        {selectedDay && <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-y border-border py-4 sm:grid-cols-3"><Metric label="Assigned" value={String(selectedDaySummary.assignedOrders)} /><Metric label="Runner-accepted delivered" value={String(selectedDaySummary.deliveredOrders)} /><Metric label="Awaiting acceptance" value={String(selectedDaySummary.pendingAcceptance)} /><Metric label="Failed" value={String(selectedDaySummary.acceptedFailedOrders)} /><Metric label="Total (Cash + Transfer)" value={formatBND(selectedDaySummary.totalSales)} /><Metric label="Cash / Transfer" value={`${formatBND(selectedDaySummary.cashAmount)} / ${formatBND(selectedDaySummary.transferAmount)}`} /></div>}
        {detailLoading ? <div className="py-10 text-center text-sm text-muted-foreground">Loading day orders…</div> : !selectedDay ? <div className="py-10 text-center text-sm text-muted-foreground">No assigned orders on this day.</div> : filteredOrders.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">No orders match this payment filter.</div> : <div className="mt-3 divide-y divide-border border-y border-border">{orderGroupDefinitions.map((group) => { const orders = orderGroups[group.key]; if (orders.length === 0) return null; const isOpen = Boolean(openGroups[group.key]); return <div key={group.key}><button type="button" aria-expanded={isOpen} onClick={() => setOpenGroups((current) => ({ ...current, [group.key]: !current[group.key] }))} className="flex min-h-14 w-full items-center justify-between gap-3 px-2 py-3 text-left transition-colors hover:bg-muted/50"><span className="min-w-0"><span className="flex items-center gap-2 text-sm font-bold">{group.label}<Badge variant="secondary">{orders.length}</Badge></span><span className="mt-1 block truncate text-xs text-muted-foreground">{group.description}</span></span><ChevronDown className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} /></button>{isOpen && <div className="divide-y divide-border border-t border-border px-2">{orders.map((order) => <AnalyticsOrder key={order.id} order={order} />)}</div>}</div>; })}</div>}
      </section>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words text-lg font-bold tabular-nums sm:text-xl">{value}</p>{note && <p className="text-[11px] text-muted-foreground">{note}</p>}</div>;
}

function CalendarHeader({ label, onPrevious, onNext, previousLabel, nextLabel }: { label: string; onPrevious: () => void; onNext: () => void; previousLabel: string; nextLabel: string }) {
  return <div className="mb-3 flex items-center justify-between"><Button variant="ghost" size="icon" aria-label={previousLabel} onClick={onPrevious}><ChevronLeft className="h-5 w-5" /></Button><h2 className="font-bold">{label}</h2><Button variant="ghost" size="icon" aria-label={nextLabel} onClick={onNext}><ChevronRight className="h-5 w-5" /></Button></div>;
}

function AnalyticsOrder({ order }: { order: DriverAnalyticsOrder }) {
  const payment = getDriverPaymentSummary(order);
  const eventTimestamp = order.historical_driver_submitted_at || order.driver_failed_at || order.driver_delivered_at;
  const eventLabel = order.historical_driver_result_type === 'DRIVER_DELIVERY_TOMORROW_SUBMITTED'
    ? 'Delivery Tomorrow'
    : order.historical_driver_result_type === 'DRIVER_FAILED_SUBMITTED'
      ? `Failed${order.historical_driver_failure_reason ? ` — ${order.historical_driver_failure_reason}` : ''}`
      : order.historical_driver_result_type === 'DRIVER_DELIVERED_SUBMITTED'
        ? 'Delivered'
        : order.driver_status || 'No Driver result recorded';
  const items = (order.order_items || []).map((item) => `${item.product?.sku_code || item.sku_label || 'Unknown SKU'} x ${item.qty}`);
  return <div className="flex items-start justify-between gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{order.order_code}</p>{items.map((item) => <p key={item} className="break-words text-xs font-medium">{item}</p>)}<p className="mt-1 truncate text-xs text-muted-foreground">{order.customer_name}</p><div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground"><p>Driver result: {eventLabel} · {formatTimestamp(eventTimestamp)}</p><p>{payment.label} · {payment.cashAmount > 0 ? `Cash ${formatBND(payment.cashAmount)}` : ''}{payment.cashAmount > 0 && payment.transferAmount > 0 ? ' · ' : ''}{payment.transferAmount > 0 ? `Transfer ${formatBND(payment.transferAmount)}` : ''}</p><p>{order.assignment_state.replaceAll('_', ' ')}</p></div></div><Badge variant={order.assignment_state === 'FAILED' ? 'destructive' : 'outline'}>{order.assignment_state.replaceAll('_', ' ')}</Badge></div>;
}
