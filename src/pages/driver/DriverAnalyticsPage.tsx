import { useMemo, useState } from 'react';
import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  getDay,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  setMonth,
  subMonths,
  addMonths,
} from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverAnalytics } from '@/hooks/useDriverAnalytics';
import { useDriverAssignments, type DriverAssignment } from '@/hooks/useDriverAssignments';
import { formatBND } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Target } from 'lucide-react';

type Period = 'today' | 'week' | 'month' | 'year' | 'custom';

const periodOptions: Array<{ value: Period; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'custom', label: 'Custom' },
];

function dateKey(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

function getOrderSkuItems(order: DriverAssignment) {
  return (order.order_items || []).map((item) => ({
    id: item.id,
    sku: item.product?.sku_code || item.sku_label || 'Unknown SKU',
    qty: Number(item.qty || 0),
  }));
}

export default function DriverAnalyticsPage() {
  const { profile } = useAuth();
  const [period, setPeriod] = useState<Period>('month');
  const [calendarMonth, setCalendarMonth] = useState(startOfMonth(new Date()));
  const [customFrom, setCustomFrom] = useState(dateKey(startOfMonth(new Date())));
  const [customTo, setCustomTo] = useState(dateKey(new Date()));
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [inactiveOpen, setInactiveOpen] = useState(false);

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

  const calendarFrom = dateKey(startOfMonth(calendarMonth));
  const calendarTo = dateKey(endOfMonth(calendarMonth));
  const { data: analytics, isLoading } = useDriverAnalytics(profile?.id, {
    dateFrom: range.from,
    dateTo: range.to,
    calendarFrom,
    calendarTo,
  });
  const { data: selectedOrdersWithItems } = useDriverAssignments({
    driverId: profile?.id,
    dateFrom: selectedDate,
    dateTo: selectedDate,
    includeItems: true,
  });

  const selectedDay = analytics?.daily.find((day) => day.date === selectedDate);
  const selectedOrders = selectedOrdersWithItems ?? selectedDay?.orders ?? [];
  const selectedActiveOrders = selectedOrders.filter((order) => order.assignment_state !== 'INACTIVE');
  const selectedInactiveOrders = selectedOrders.filter((order) => order.assignment_state === 'INACTIVE');
  const leadingDays = (getDay(startOfMonth(calendarMonth)) + 6) % 7;
  const summary = analytics?.summary;
  const yearMonths = useMemo(() => {
    if (period !== 'year') return [];
    return Array.from({ length: 12 }, (_, monthIndex) => {
      const monthOrders = (analytics?.rangeOrders || []).filter(
        (order) => Number(order.operational_date.slice(5, 7)) === monthIndex + 1,
      );
      const assigned = monthOrders.filter((order) => order.assignment_state !== 'INACTIVE').length;
      const delivered = monthOrders.filter((order) => order.assignment_state === 'DELIVERED').length;
      const failed = monthOrders.filter((order) => order.assignment_state === 'FAILED').length;
      return { monthIndex, assigned, delivered, failed };
    });
  }, [analytics?.rangeOrders, period]);

  return (
    <AppLayout>
      <div className="mx-auto w-full min-w-0 max-w-3xl space-y-4 overflow-x-hidden pb-24">
        <header className="border-b border-border pb-4">
          <p className="text-xs font-bold uppercase text-primary">Performance</p>
          <h1 className="mt-1 text-2xl font-bold">Delivery calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Delivered / assigned for each day</p>
        </header>

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

        {period === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-muted-foreground">
              From
              <Input className="mt-1" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              To
              <Input className="mt-1" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
            </label>
          </div>
        )}

        <section className="border-b border-border pb-4">
          <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Delivered</p>
              <p className="mt-1 text-xl font-bold sm:text-2xl">{summary?.delivered ?? 0} / {summary?.assigned ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Delivery rate</p>
              <p className="mt-1 text-xl font-bold sm:text-2xl">{(summary?.deliveryRate ?? 0).toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cash collected</p>
              <p className="mt-1 break-words text-lg font-bold sm:text-xl">BND {(summary?.cashCollected ?? 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Failed</p>
              <p className="mt-1 text-xl font-bold text-destructive">{summary?.failed ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="mt-1 text-xl font-bold">{summary?.pending ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending acceptance</p>
              <p className="mt-1 text-xl font-bold">{summary?.pendingAcceptance ?? 0}</p>
            </div>
          </div>
        </section>

        {period === 'year' ? (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous year"
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear() - 1, 0, 1))}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <h2 className="font-bold">{format(calendarMonth, 'yyyy')}</h2>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next year"
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear() + 1, 0, 1))}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
              {yearMonths.map((month) => (
                <button
                  key={month.monthIndex}
                  type="button"
                  className="min-h-24 bg-background p-3 text-left transition-colors hover:bg-muted"
                  onClick={() => {
                    const selectedMonth = setMonth(startOfYear(calendarMonth), month.monthIndex);
                    setCalendarMonth(selectedMonth);
                    setSelectedDate(dateKey(startOfMonth(selectedMonth)));
                    setPeriod('month');
                  }}
                >
                  <span className="text-sm font-semibold">{format(setMonth(startOfYear(calendarMonth), month.monthIndex), 'MMM')}</span>
                  <span className="mt-3 block text-xl font-bold">{month.delivered} / {month.assigned}</span>
                  <span className="text-xs text-muted-foreground">{month.failed} failed</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous month"
              onClick={() => {
                const month = subMonths(calendarMonth, 1);
                setCalendarMonth(month);
                setSelectedDate(dateKey(startOfMonth(month)));
              }}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="font-bold">{format(calendarMonth, 'MMMM yyyy')}</h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next month"
              onClick={() => {
                const month = addMonths(calendarMonth, 1);
                setCalendarMonth(month);
                setSelectedDate(dateKey(startOfMonth(month)));
              }}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-muted-foreground sm:text-xs">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} className="min-w-0 py-2">
                <span className="sm:hidden">{day.slice(0, 1)}</span>
                <span className="hidden sm:inline">{day}</span>
              </div>
            ))}
          </div>

          <div className="grid w-full min-w-0 grid-cols-7 border-l border-t border-border">
            {Array.from({ length: leadingDays }).map((_, index) => (
              <div key={`blank-${index}`} className="h-14 min-w-0 border-b border-r border-border bg-muted/30 sm:aspect-square sm:h-auto" />
            ))}
            {(analytics?.daily || []).map((day) => (
              <button
                key={day.date}
                type="button"
                onClick={() => {
                  setSelectedDate(day.date);
                  setInactiveOpen(false);
                }}
                className={cn(
                  'h-14 min-w-0 overflow-hidden border-b border-r border-border p-1 text-left transition-colors hover:bg-muted sm:aspect-square sm:h-auto',
                  selectedDate === day.date && 'bg-primary/10 ring-2 ring-inset ring-primary',
                )}
              >
                <span className="block text-xs font-semibold">{format(parseISO(day.date), 'd')}</span>
                <span
                  className={cn(
                    'mt-1 block whitespace-nowrap text-center text-[10px] font-bold sm:text-sm',
                    day.failed > 0 && 'text-destructive',
                    day.assigned > 0 && day.delivered === day.assigned && 'text-emerald-700',
                  )}
                >
                  {day.delivered} / {day.assigned}
                </span>
              </button>
            ))}
          </div>
          {isLoading && <p className="py-4 text-center text-sm text-muted-foreground">Loading calendar...</p>}
        </section>
        )}

        <section className="border-t border-border pt-5">
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">Selected day</p>
            <h2 className="mt-1 font-bold">{format(parseISO(selectedDate), 'dd MMMM yyyy')}</h2>
          </div>

          <div className="mt-3 divide-y divide-border border-y border-border">
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">Runner-accepted total</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{formatBND(selectedDay?.acceptedAmount ?? 0)}</p>
              </div>
              <p className="shrink-0 text-xs text-muted-foreground">
                {selectedDay?.delivered ?? 0} accepted
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">Pending acceptance amount</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {formatBND(selectedDay?.pendingAcceptanceAmount ?? 0)}
                </p>
              </div>
              <p className="shrink-0 text-xs text-muted-foreground">
                {selectedDay?.pendingAcceptance ?? 0} pending
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground">Total orders</p>
              <p className="text-xl font-bold tabular-nums">{selectedDay?.assigned ?? 0}</p>
            </div>
          </div>

          {!selectedDay || selectedDay.orders.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <CalendarDays className="mx-auto mb-2 h-7 w-7" />
              No assigned orders on this day.
            </div>
          ) : (
            <div className="mt-3">
              {selectedActiveOrders.length === 0 && (
                <p className="border-y border-border py-5 text-center text-sm text-muted-foreground">
                  No active assignments on this day.
                </p>
              )}
              <div className="divide-y divide-border border-y border-border">
              {selectedActiveOrders.map((order) => {
                const skuItems = getOrderSkuItems(order);
                return (
                  <div key={order.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{order.order_code}</p>
                      {skuItems.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {skuItems.map((item) => (
                            <p key={item.id} className="break-words text-xs font-medium">
                              {item.sku} <span className="text-muted-foreground">x {item.qty}</span>
                            </p>
                          ))}
                        </div>
                      )}
                      <p className="mt-1 truncate text-xs text-muted-foreground">{order.customer_name}</p>
                    </div>
                    <Badge
                      variant={order.assignment_state === 'FAILED' ? 'destructive' : 'outline'}
                      className={cn(
                        'shrink-0',
                        order.assignment_state === 'DELIVERED' && 'border-emerald-600 text-emerald-700',
                        order.assignment_state === 'PENDING_ACCEPTANCE' && 'border-amber-600 text-amber-700',
                      )}
                    >
                      {order.assignment_state.replaceAll('_', ' ')}
                    </Badge>
                  </div>
                );
              })}
              </div>

              {selectedInactiveOrders.length > 0 && (
                <div className="mt-3 border-y border-border">
                  <button
                    type="button"
                    aria-expanded={inactiveOpen}
                    onClick={() => setInactiveOpen((open) => !open)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 py-3 text-left"
                  >
                    <span>
                      <span className="block text-sm font-bold">Inactive orders</span>
                      <span className="block text-xs text-muted-foreground">
                        {selectedInactiveOrders.length} hidden
                      </span>
                    </span>
                    <ChevronDown className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform', inactiveOpen && 'rotate-180')} />
                  </button>
                  {inactiveOpen && (
                    <div className="divide-y divide-border border-t border-border">
                      {selectedInactiveOrders.map((order) => (
                        <div key={order.id} className="flex items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold">{order.order_code}</p>
                            <p className="truncate text-xs text-muted-foreground">{order.customer_name}</p>
                          </div>
                          <Badge variant="outline" className="shrink-0 text-muted-foreground">INACTIVE</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {!analytics && !isLoading && (
          <div className="py-12 text-center text-muted-foreground">
            <Target className="mx-auto mb-2 h-8 w-8" />
            No performance data yet.
          </div>
        )}
      </div>
    </AppLayout>
  );
}
