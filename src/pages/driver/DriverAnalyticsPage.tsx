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
import {
  DeliveryPaymentDialog,
  type DriverPaymentMethod,
  type DriverPaymentSplit,
} from '@/components/driver/DeliveryPaymentDialog';
import { ProofPhotoPicker } from '@/components/driver/ProofPhotoPicker';
import { MobileActionSheet } from '@/components/mobile/MobileActionSheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useAttachments, useUploadAttachment } from '@/hooks/useAttachments';
import {
  groupDriverAnalyticsOrders,
  useDriverAnalytics,
  useDriverAnalyticsDay,
  type DriverAnalyticsOrder,
} from '@/hooks/useDriverAnalytics';
import type { DriverAssignment } from '@/hooks/useDriverAssignments';
import { useDriverAllocatedStock } from '@/hooks/useDriverPickups';
import { useDriverMarkDelivered } from '@/hooks/useDrivers';
import { compressImage } from '@/lib/imageCompression';
import { formatBND } from '@/lib/currency';
import {
  getDriverAnalyticsCalendarCell,
  summarizeDriverAnalyticsDay,
} from '@/lib/driverAnalytics';
import { cn } from '@/lib/utils';
import { AlertCircle, CalendarDays, Camera, ChevronDown, ChevronLeft, ChevronRight, Target } from 'lucide-react';
import { toast } from 'sonner';

type Period = 'today' | 'week' | 'month' | 'year' | 'custom';

const periodOptions: Array<{ value: Period; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'custom', label: 'Custom' },
];

const EMPTY_ANALYTICS_ORDERS: DriverAnalyticsOrder[] = [];

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

function formatBruneiTimestamp(value?: string | null) {
  if (!value) return 'Timestamp unavailable';
  return new Intl.DateTimeFormat('en-BN', {
    timeZone: 'Asia/Brunei',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export default function DriverAnalyticsPage() {
  const { profile } = useAuth();
  const [period, setPeriod] = useState<Period>('month');
  const [calendarMonth, setCalendarMonth] = useState(startOfMonth(new Date()));
  const [customFrom, setCustomFrom] = useState(dateKey(startOfMonth(new Date())));
  const [customTo, setCustomTo] = useState(dateKey(new Date()));
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [pendingAcceptanceOpen, setPendingAcceptanceOpen] = useState(false);
  const [correctionOrder, setCorrectionOrder] = useState<DriverAnalyticsOrder | null>(null);
  const [pendingProofOrder, setPendingProofOrder] = useState<DriverAnalyticsOrder | null>(null);
  const [pendingProofFiles, setPendingProofFiles] = useState<File[]>([]);
  const [pendingProofPreviews, setPendingProofPreviews] = useState<string[]>([]);
  const [pendingProofUploading, setPendingProofUploading] = useState(false);
  const markDelivered = useDriverMarkDelivered();
  const uploadAttachment = useUploadAttachment();
  const { data: pendingOrderAttachments = [] } = useAttachments({ orderId: pendingProofOrder?.id });
  const { data: stockOnHand = [] } = useDriverAllocatedStock();

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
  const {
    data: analytics,
    isLoading,
    isError,
    error,
    refetch: refetchAnalytics,
  } = useDriverAnalytics(profile?.id, {
    dateFrom: range.from,
    dateTo: range.to,
    calendarFrom,
    calendarTo,
  });
  const {
    data: selectedDayDetails,
    isLoading: isSelectedDayLoading,
    isError: isSelectedDayError,
    refetch: refetchSelectedOrders,
  } = useDriverAnalyticsDay(profile?.id, selectedDate);

  const selectedCalendarDay = analytics?.daily.find((day) => day.date === selectedDate);
  const selectedDay = selectedDayDetails?.summary ?? selectedCalendarDay;
  const selectedOrders = selectedDayDetails?.orders ?? EMPTY_ANALYTICS_ORDERS;
  const selectedOrderGroups = useMemo(
    () => groupDriverAnalyticsOrders(selectedOrders),
    [selectedOrders],
  );
  const selectedDayBreakdown = useMemo(
    () => summarizeDriverAnalyticsDay(selectedOrders, selectedDay?.assignedOrders ?? 0),
    [selectedDay?.assignedOrders, selectedOrders],
  );
  const pendingOrderProofCount = pendingOrderAttachments.filter(
    (attachment) => attachment.type === 'delivery_photo',
  ).length;
  const stockOnHandQty = stockOnHand.reduce(
    (total, item) => total + Number(item.allocated_qty || 0),
    0,
  );
  const leadingDays = (getDay(startOfMonth(calendarMonth)) + 6) % 7;
  const summary = analytics?.summary;
  const yearMonths = useMemo(() => {
    if (period !== 'year') return [];
    return Array.from({ length: 12 }, (_, monthIndex) => {
      const month = analytics?.monthly.find(
        (item) => Number(item.month.slice(5, 7)) === monthIndex + 1,
      );
      return { monthIndex, ...month };
    });
  }, [analytics?.monthly, period]);

  const selectAnalyticsDate = (date: string) => {
    setSelectedDate(date);
    setPendingAcceptanceOpen(false);
  };

  const handleCorrectToDelivered = async (
    orderId: string,
    paymentMethod: DriverPaymentMethod,
    split: DriverPaymentSplit,
  ) => {
    await markDelivered.mutateAsync({
      orderId,
      paymentMethod,
      cashAmount: split.cashAmount,
      transferAmount: split.transferAmount,
    });
    setCorrectionOrder(null);
  };

  const resetPendingProofSelection = () => {
    pendingProofPreviews.forEach((preview) => URL.revokeObjectURL(preview));
    setPendingProofFiles([]);
    setPendingProofPreviews([]);
  };

  const handlePendingProofFiles = (files: File[]) => {
    if (files.length === 0) return;
    setPendingProofFiles((current) => [...current, ...files]);
    setPendingProofPreviews((current) => [
      ...current,
      ...files.map((file) => URL.createObjectURL(file)),
    ]);
  };

  const removePendingProofFile = (index: number) => {
    if (pendingProofPreviews[index]) URL.revokeObjectURL(pendingProofPreviews[index]);
    setPendingProofFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
    setPendingProofPreviews((current) => current.filter((_, previewIndex) => previewIndex !== index));
  };

  const handleUploadPendingProofs = async () => {
    if (!pendingProofOrder || pendingProofFiles.length === 0) return;

    setPendingProofUploading(true);
    try {
      const refreshed = await refetchSelectedOrders();
      if (refreshed.error) throw refreshed.error;

      const currentOrder = refreshed.data?.orders.find((order) => order.id === pendingProofOrder.id);
      if (currentOrder?.assignment_state !== 'PENDING_ACCEPTANCE') {
        toast.error('This order is no longer pending acceptance.');
        return;
      }

      for (const [index, file] of pendingProofFiles.entries()) {
        const { blob, extension } = await compressImage(file, { maxWidth: 1600, quality: 0.78 });
        const compressedFile = new File(
          [blob],
          `delivery-proof-${pendingProofOrder.id}-${Date.now()}-${index + 1}.${extension}`,
          { type: blob.type || 'image/webp' },
        );

        await uploadAttachment.mutateAsync({
          file: compressedFile,
          bucket: 'delivery-photos',
          orderId: pendingProofOrder.id,
          type: 'delivery_photo',
        });
      }

      toast.success(`${pendingProofFiles.length} proof photo(s) added`);
      resetPendingProofSelection();
      setPendingProofOrder(null);
    } finally {
      setPendingProofUploading(false);
    }
  };

  const renderOrder = (order: DriverAnalyticsOrder) => {
    const skuItems = getOrderSkuItems(order);
    const isPendingAcceptance = order.assignment_state === 'PENDING_ACCEPTANCE';
    const canCorrectToDelivered =
      isPendingAcceptance
      && order.driver_status === 'DRIVER_FAILED'
      && order.runner_accept_status !== 'ACCEPTED'
      && order.runner_review_status !== 'REVIEWED';

    return (
      <div
        key={order.id}
        role={isPendingAcceptance ? 'button' : undefined}
        tabIndex={isPendingAcceptance ? 0 : undefined}
        onClick={() => {
          if (!isPendingAcceptance) return;
          resetPendingProofSelection();
          setPendingProofOrder(order);
        }}
        onKeyDown={(event) => {
          if (!isPendingAcceptance || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          resetPendingProofSelection();
          setPendingProofOrder(order);
        }}
        className={cn(
          'flex items-start justify-between gap-3 py-3',
          isPendingAcceptance && 'cursor-pointer rounded-md px-2 transition-colors hover:bg-muted/60 active:bg-muted',
        )}
      >
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
          <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
            <p>Driver delivered {formatBruneiTimestamp(order.assignment_timestamp)}</p>
            <p>{formatBND(Number(order.collect_amount || order.total_amount || 0))} - {order.driver_payment_method || order.payment_method || 'Payment not set'}</p>
            <p>
              Driver {order.driver_status || 'UNKNOWN'} - Runner {order.runner_accept_status || 'PENDING'}
              {order.cash_settlement_status && order.cash_settlement_status !== 'NOT_APPLICABLE'
                ? ` - Cash ${order.cash_settlement_status.replaceAll('_', ' ')}`
                : ''}
              {order.reassigned ? ' - Reassigned' : ''}
            </p>
          </div>
          {isPendingAcceptance && (
            <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary">
              <Camera className="h-3.5 w-3.5" />
              Open and add proof photos
            </p>
          )}
          {canCorrectToDelivered && (
            <Button
              type="button"
              size="sm"
              className="mt-2"
              onClick={(event) => {
                event.stopPropagation();
                setCorrectionOrder(order);
              }}
              disabled={markDelivered.isPending}
            >
              Mark Delivered
            </Button>
          )}
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
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full min-w-0 max-w-3xl space-y-4 overflow-x-hidden pb-24">
        <header className="border-b border-border pb-4">
          <p className="text-xs font-bold uppercase text-primary">Performance</p>
          <h1 className="mt-1 text-2xl font-bold">Delivery calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Grouped by effective Driver assignment date.</p>
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

        {isLoading ? (
          <section className="grid grid-cols-2 gap-3 border-b border-border pb-4 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </section>
        ) : isError ? (
          <section className="flex items-start gap-3 border-y border-destructive/30 py-4 text-sm">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Unable to load Driver Analytics</p>
              <p className="mt-1 break-words text-muted-foreground">{error instanceof Error ? error.message : 'Please try again.'}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetchAnalytics()}>Retry</Button>
          </section>
        ) : summary ? (
        <section className="grid grid-cols-2 gap-x-4 gap-y-4 border-b border-border pb-4 sm:grid-cols-3">
          <div>
            {(() => {
              const summaryCell = getDriverAnalyticsCalendarCell(summary.deliveredOrders, summary.assignedOrders);
              return (
                <>
                  <p className="text-xs text-muted-foreground">Runner-accepted delivered / assigned</p>
                  <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{summaryCell.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {Math.round(summaryCell.percentage)}% complete · {summary.pendingAcceptance} awaiting Runner
                  </p>
                </>
              );
            })()}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Accepted delivered sales</p>
            <p className="mt-1 break-words text-lg font-bold tabular-nums">{formatBND(summary.totalSales)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cash</p>
            <p className="mt-1 break-words text-lg font-bold tabular-nums">{formatBND(summary.cashAmount)}</p>
            <p className="text-[11px] text-muted-foreground">{summary.cashOrderCount} orders</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Transfer</p>
            <p className="mt-1 break-words text-lg font-bold tabular-nums">{formatBND(summary.transferAmount)}</p>
            <p className="text-[11px] text-muted-foreground">{summary.transferOrderCount} orders</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pending cash / transfer</p>
            <p className="mt-1 break-words text-lg font-bold tabular-nums">
              {formatBND(summary.pendingCashAmount)} / {formatBND(summary.pendingTransferAmount)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {summary.pendingCashOrderCount} cash · {summary.pendingTransferOrderCount} transfer
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cash on hand</p>
            <p className="mt-1 break-words text-lg font-bold tabular-nums">{formatBND(summary.cashOnHand)}</p>
            <p className="text-[11px] text-muted-foreground">{summary.cashOnHandCount} unsettled</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Stock on hand</p>
            <p className="mt-1 text-xl font-bold sm:text-2xl">{stockOnHandQty}</p>
            <p className="text-[11px] text-muted-foreground">{stockOnHand.length} products</p>
          </div>
        </section>
        ) : null}

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
                    selectAnalyticsDate(dateKey(startOfMonth(selectedMonth)));
                    setPeriod('month');
                  }}
                >
                  <span className="text-sm font-semibold">{format(setMonth(startOfYear(calendarMonth), month.monthIndex), 'MMM')}</span>
                  {(() => {
                    const monthCell = getDriverAnalyticsCalendarCell(month.deliveredOrders, month.assignedOrders);
                    return (
                      <>
                        <span className="mt-3 block text-xl font-bold tabular-nums">{monthCell.label}</span>
                        <span className="text-xs text-muted-foreground">accepted delivered / assigned</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {Math.round(monthCell.percentage)}% complete
                        </span>
                      </>
                    );
                  })()}
                  <span className="mt-2 block text-[10px] text-muted-foreground">
                    Sales {formatBND(month.totalSales ?? 0)}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    Cash {formatBND(month.cashAmount ?? 0)} ({month.cashOrderCount ?? 0})
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    Transfer {formatBND(month.transferAmount ?? 0)} ({month.transferOrderCount ?? 0})
                  </span>
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
                selectAnalyticsDate(dateKey(startOfMonth(month)));
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
                selectAnalyticsDate(dateKey(startOfMonth(month)));
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
                aria-label={`${format(parseISO(day.date), 'd MMMM yyyy')}: ${getDriverAnalyticsCalendarCell(day.deliveredOrders, day.assignedOrders).label}`}
                onClick={() => {
                  selectAnalyticsDate(day.date);
                }}
                className={cn(
                  'h-14 min-w-0 overflow-hidden border-b border-r border-border p-1 text-left transition-colors hover:bg-muted sm:aspect-square sm:h-auto',
                  selectedDate === day.date && 'bg-primary/10 ring-2 ring-inset ring-primary',
                )}
                >
                  <span className="block text-xs font-semibold">{format(parseISO(day.date), 'd')}</span>
                {(() => {
                  const cell = getDriverAnalyticsCalendarCell(day.deliveredOrders, day.assignedOrders);
                  return (
                    <span
                      className={cn(
                        'mt-1 block whitespace-nowrap text-center text-[10px] font-bold tabular-nums sm:text-sm',
                        cell.status === 'complete' && 'text-emerald-700 dark:text-emerald-400',
                        cell.status === 'partial' && 'text-amber-700 dark:text-amber-400',
                        cell.status === 'zero' && 'text-red-700 dark:text-red-400',
                        cell.status === 'empty' && 'text-muted-foreground',
                      )}
                    >
                      {cell.label}
                    </span>
                  );
                })()}
              </button>
            ))}
          </div>
          {isLoading && <Skeleton className="h-72 w-full" />}
        </section>
        )}

        <section className="border-t border-border pt-5">
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">Selected day</p>
            <h2 className="mt-1 font-bold">{format(parseISO(selectedDate), 'dd MMMM yyyy')}</h2>
          </div>

          {isSelectedDayLoading ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : isSelectedDayError ? (
            <div className="mt-4 flex items-center justify-between gap-3 border-y border-destructive/30 py-4 text-sm">
              <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-destructive" />Unable to load this day.</span>
              <Button variant="outline" size="sm" onClick={() => void refetchSelectedOrders()}>Retry</Button>
            </div>
          ) : selectedDay ? (
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-y border-border py-4 sm:grid-cols-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground">Assigned</p>
                <p className="mt-1 text-2xl font-bold">{selectedDayBreakdown.assignedOrders}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground">Runner-accepted delivered</p>
                <p className="mt-1 text-2xl font-bold">{selectedDayBreakdown.deliveredOrders}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground">Remaining</p>
                <p className="mt-1 text-2xl font-bold">{selectedDayBreakdown.remainingOrders}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground">Awaiting Runner acceptance</p>
                <p className="mt-1 text-lg font-bold">{selectedDayBreakdown.pendingAcceptanceOrders}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground">Failed</p>
                <p className="mt-1 text-lg font-bold">{selectedDayBreakdown.acceptedFailedOrders}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground">Rescheduled</p>
                <p className="mt-1 text-lg font-bold">{selectedDayBreakdown.rescheduledOrders}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground">Active / pending</p>
                <p className="mt-1 text-lg font-bold">{selectedDayBreakdown.activePendingOrders}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground">Rejected / reopened</p>
                <p className="mt-1 text-lg font-bold">{selectedDayBreakdown.rejectedReopenedOrders}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground">Accepted delivered sales</p>
                <p className="mt-1 break-words text-lg font-bold tabular-nums">{formatBND(selectedDay.totalSales)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground">Cash</p>
                <p className="mt-1 break-words text-lg font-bold tabular-nums">{formatBND(selectedDay.cashAmount)}</p>
                <p className="text-[11px] text-muted-foreground">{selectedDay.cashOrderCount} orders</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground">Transfer</p>
                <p className="mt-1 break-words text-lg font-bold tabular-nums">{formatBND(selectedDay.transferAmount)}</p>
                <p className="text-[11px] text-muted-foreground">{selectedDay.transferOrderCount} orders</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground">Pending cash / transfer</p>
                <p className="mt-1 break-words text-lg font-bold tabular-nums">
                  {formatBND(selectedDay.pendingCashAmount)} / {formatBND(selectedDay.pendingTransferAmount)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {selectedDay.pendingCashOrderCount} cash · {selectedDay.pendingTransferOrderCount} transfer
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground">Cash on hand</p>
                <p className="mt-1 break-words text-lg font-bold tabular-nums">{formatBND(selectedDay.cashOnHand)}</p>
                <p className="text-[11px] text-muted-foreground">{selectedDay.cashOnHandCount} unsettled</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground">Stock on hand</p>
                <p className="mt-1 text-2xl font-bold">{stockOnHandQty}</p>
                <p className="text-[11px] text-muted-foreground">current custody</p>
              </div>
            </div>
          ) : null}

          {isSelectedDayLoading || isSelectedDayError ? null : selectedOrders.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <CalendarDays className="mx-auto mb-2 h-7 w-7" />
              No assigned orders on this day.
            </div>
          ) : (
            <div className="mt-3">
              {selectedOrderGroups.visible.length === 0 && (
                <p className="border-y border-border py-5 text-center text-sm text-muted-foreground">
                  No Runner-accepted deliveries on this day.
                </p>
              )}
              <div className="divide-y divide-border border-y border-border">
                {selectedOrderGroups.visible.map(renderOrder)}
              </div>

              {selectedOrderGroups.pendingAcceptance.length > 0 && (
                <div className="mt-3 border-y border-border">
                  <button
                    type="button"
                    aria-expanded={pendingAcceptanceOpen}
                    onClick={() => setPendingAcceptanceOpen((open) => !open)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 py-3 text-left"
                  >
                    <span>
                      <span className="block text-sm font-bold">Pending acceptance</span>
                      <span className="block text-xs text-muted-foreground">
                        {selectedOrderGroups.pendingAcceptance.length} hidden
                      </span>
                    </span>
                    <ChevronDown className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform', pendingAcceptanceOpen && 'rotate-180')} />
                  </button>
                  {pendingAcceptanceOpen && (
                    <div className="divide-y divide-border border-t border-border">
                      {selectedOrderGroups.pendingAcceptance.map(renderOrder)}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </section>

        {!analytics && !isLoading && !isError && (
          <div className="py-12 text-center text-muted-foreground">
            <Target className="mx-auto mb-2 h-8 w-8" />
            No performance data yet.
          </div>
        )}

        <DeliveryPaymentDialog
          open={Boolean(correctionOrder)}
          onOpenChange={(open) => {
            if (!open) setCorrectionOrder(null);
          }}
          order={correctionOrder ? {
            id: correctionOrder.id,
            order_code: correctionOrder.order_code,
            customer_name: correctionOrder.customer_name,
            total_amount: correctionOrder.total_amount,
          } : null}
          onConfirm={handleCorrectToDelivered}
          isPending={markDelivered.isPending}
        />

        <MobileActionSheet
          open={Boolean(pendingProofOrder)}
          onOpenChange={(open) => {
            if (open) return;
            resetPendingProofSelection();
            setPendingProofOrder(null);
          }}
          title={pendingProofOrder ? `${pendingProofOrder.order_code} Proof Photos` : 'Proof Photos'}
          description="Add more delivery proof while this order is waiting for Runner acceptance."
          confirmLabel={pendingProofUploading ? 'Uploading...' : 'Upload Photos'}
          onConfirm={handleUploadPendingProofs}
          isLoading={pendingProofUploading}
          confirmDisabled={pendingProofFiles.length === 0}
        >
          {pendingProofOrder && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-sm font-bold">{pendingProofOrder.customer_name}</p>
                <div className="mt-2 space-y-1">
                  {getOrderSkuItems(pendingProofOrder).map((item) => (
                    <p key={item.id} className="text-xs font-medium">
                      {item.sku} <span className="text-muted-foreground">x {item.qty}</span>
                    </p>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {pendingOrderProofCount} existing proof photo(s). New photos will be added, not replaced.
                </p>
              </div>

              <ProofPhotoPicker
                label="Additional Proof Photos"
                previews={pendingProofPreviews}
                onFilesChange={handlePendingProofFiles}
                onRemoveFile={removePendingProofFile}
                multiple
                disabled={pendingProofUploading}
                helperText="You can take photos or choose multiple images from your library."
              />
            </div>
          )}
        </MobileActionSheet>
      </div>
    </AppLayout>
  );
}
