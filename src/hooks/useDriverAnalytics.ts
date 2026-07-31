import { useQuery } from '@tanstack/react-query';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import {
  fetchDriverAssignments,
  summarizeDriverAssignments,
  type DriverAssignment,
} from '@/hooks/useDriverAssignments';
import { callSupabaseRpc } from '@/lib/supabaseRpc';

type RpcMetrics = Partial<Record<
  | 'assigned'
  | 'delivered'
  | 'deliveryRate'
  | 'failed'
  | 'pending'
  | 'pendingAcceptance'
  | 'pendingAcceptanceAmount'
  | 'totalAssignedSales'
  | 'acceptedSales'
  | 'pendingSales'
  | 'cashCollected'
  | 'cashCollectedCount'
  | 'cashPendingSettlement'
  | 'cashPendingSettlementCount'
  | 'transfer'
  | 'transferCount',
  number | string | null
>> & Partial<Record<
  | 'delivery_rate'
  | 'pending_acceptance'
  | 'pending_acceptance_amount'
  | 'total_assigned_sales'
  | 'accepted_sales'
  | 'pending_sales'
  | 'cash_collected'
  | 'cash_collected_count'
  | 'cash_pending'
  | 'cash_pending_count'
  | 'transfer_count',
  number | string | null
>>;

export interface DriverAnalyticsSummary {
  assigned: number;
  delivered: number;
  deliveryRate: number;
  failed: number;
  inactive: number;
  pending: number;
  pendingAcceptance: number;
  pendingAcceptanceAmount: number;
  totalAssignedSales: number;
  acceptedSales: number;
  acceptedAmount: number;
  pendingSales: number;
  cashCollected: number;
  cashCollectedCount: number;
  cashPendingSettlement: number;
  cashPendingSettlementCount: number;
  transfer: number;
  transferCount: number;
}

export interface DriverDailyAnalytics extends DriverAnalyticsSummary {
  date: string;
}

export interface DriverMonthlyAnalytics extends DriverAnalyticsSummary {
  month: string;
}

export interface DriverAnalytics {
  timezone: 'Asia/Brunei';
  summary: DriverAnalyticsSummary;
  daily: DriverDailyAnalytics[];
  monthly: DriverMonthlyAnalytics[];
}

export type DriverAnalyticsOrder = DriverAssignment & {
  effective_assignment_date?: string | null;
  assignment_timestamp?: string | null;
  assignment_source?: string | null;
  cash_settlement_status?: string | null;
  reassigned?: boolean;
};

export interface DriverAnalyticsDay {
  date: string;
  summary: DriverAnalyticsSummary;
  orders: DriverAnalyticsOrder[];
}

type DriverAnalyticsRpc = {
  timezone?: string;
  summary?: RpcMetrics;
  daily?: Array<RpcMetrics & { date: string }>;
  monthly?: Array<RpcMetrics & { month: string }>;
};

type DriverAnalyticsDayRpc = {
  date?: string;
  summary?: RpcMetrics;
  orders?: Array<Record<string, unknown>>;
};

export type DriverAnalyticsRange = {
  dateFrom?: string;
  dateTo?: string;
  calendarFrom?: string;
  calendarTo?: string;
};

function metric(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeDriverAnalyticsMetrics(source: RpcMetrics = {}): DriverAnalyticsSummary {
  const assigned = metric(source.assigned);
  const delivered = metric(source.delivered);
  const acceptedSales = metric(source.acceptedSales ?? source.accepted_sales);

  return {
    assigned,
    delivered,
    deliveryRate: source.deliveryRate == null && source.delivery_rate == null
      ? (assigned > 0 ? (delivered / assigned) * 100 : 0)
      : metric(source.deliveryRate ?? source.delivery_rate),
    failed: metric(source.failed),
    inactive: 0,
    pending: metric(source.pending),
    pendingAcceptance: metric(source.pendingAcceptance ?? source.pending_acceptance),
    pendingAcceptanceAmount: metric(source.pendingAcceptanceAmount ?? source.pending_acceptance_amount),
    totalAssignedSales: metric(source.totalAssignedSales ?? source.total_assigned_sales),
    acceptedSales,
    acceptedAmount: acceptedSales,
    pendingSales: metric(source.pendingSales ?? source.pending_sales),
    cashCollected: metric(source.cashCollected ?? source.cash_collected),
    cashCollectedCount: metric(source.cashCollectedCount ?? source.cash_collected_count),
    cashPendingSettlement: metric(source.cashPendingSettlement ?? source.cash_pending),
    cashPendingSettlementCount: metric(source.cashPendingSettlementCount ?? source.cash_pending_count),
    transfer: metric(source.transfer),
    transferCount: metric(source.transferCount ?? source.transfer_count),
  };
}

function rangeBounds(range: DriverAnalyticsRange) {
  const now = new Date();
  const defaultFrom = format(startOfMonth(now), 'yyyy-MM-dd');
  const defaultTo = format(endOfMonth(now), 'yyyy-MM-dd');
  const dateFrom = range.dateFrom || defaultFrom;
  const dateTo = range.dateTo || defaultTo;
  const calendarFrom = range.calendarFrom || dateFrom;
  const calendarTo = range.calendarTo || dateTo;

  return { dateFrom, dateTo, calendarFrom, calendarTo };
}

export function useDriverAnalytics(driverId?: string, range: DriverAnalyticsRange = {}) {
  const bounds = rangeBounds(range);

  return useQuery({
    queryKey: [
      'driver-analytics',
      driverId,
      'summary',
      bounds.dateFrom,
      bounds.dateTo,
      bounds.calendarFrom,
      bounds.calendarTo,
    ],
    queryFn: async (): Promise<DriverAnalytics | null> => {
      if (!driverId) return null;

      const data = await callSupabaseRpc<DriverAnalyticsRpc>('get_driver_analytics', {
        p_driver_id: driverId,
        p_range_from: bounds.dateFrom,
        p_range_to: bounds.dateTo,
        p_calendar_from: bounds.calendarFrom,
        p_calendar_to: bounds.calendarTo,
      });

      return {
        timezone: 'Asia/Brunei',
        summary: normalizeDriverAnalyticsMetrics(data?.summary),
        daily: (data?.daily || []).map((day) => ({
          date: day.date,
          ...normalizeDriverAnalyticsMetrics(day),
        })),
        monthly: (data?.monthly || []).map((month) => ({
          month: month.month,
          ...normalizeDriverAnalyticsMetrics(month),
        })),
      };
    },
    enabled: Boolean(driverId),
    staleTime: 30_000,
  });
}

export function useDriverAnalyticsDay(driverId?: string, date?: string) {
  return useQuery({
    queryKey: ['driver-analytics', driverId, 'day', date],
    queryFn: async (): Promise<DriverAnalyticsDay | null> => {
      if (!driverId || !date) return null;

      const data = await callSupabaseRpc<DriverAnalyticsDayRpc>('get_driver_analytics_day', {
        p_driver_id: driverId,
        p_date: date,
      });

      return {
        date: data?.date || date,
        summary: normalizeDriverAnalyticsMetrics(data?.summary),
        orders: (data?.orders || []).map((order) => ({
          ...order,
          is_active_assignment: order.assignment_state === 'ACTIVE',
          collect_amount: metric(order.collect_amount as number | string | null | undefined),
        })) as DriverAnalyticsOrder[],
      };
    },
    enabled: Boolean(driverId && date),
    staleTime: 15_000,
  });
}

export function useRunnerDriversAnalytics(runnerId?: string) {
  const now = new Date();
  const dateFrom = format(startOfMonth(now), 'yyyy-MM-dd');
  const dateTo = format(endOfMonth(now), 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['runner-drivers-analytics', runnerId, dateFrom, dateTo],
    queryFn: async () => {
      if (!runnerId) return [];

      const assignments = await fetchDriverAssignments({
        runnerId,
        dateFrom,
        dateTo,
        includeItems: false,
      });
      const byDriver = new Map<string, DriverAssignment[]>();
      assignments.forEach((order) => {
        if (!order.driver_id) return;
        byDriver.set(order.driver_id, [...(byDriver.get(order.driver_id) || []), order]);
      });

      return Array.from(byDriver.entries()).map(([driverId, orders]) => {
        const summary = summarizeDriverAssignments(orders);
        return {
          driverId,
          driverName: orders[0]?.driver_name || 'Unknown',
          delivered: summary.delivered,
          failed: summary.failed,
          successRate: Math.round(summary.deliveryRate),
          totalAmount: summary.cashCollected,
        };
      });
    },
    enabled: Boolean(runnerId),
  });
}
