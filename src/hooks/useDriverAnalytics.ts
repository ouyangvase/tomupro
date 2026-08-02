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
  | 'transferCount'
  | 'deliveredOrders'
  | 'totalSales'
  | 'cashAmount'
  | 'cashOrderCount'
  | 'cashOnHand'
  | 'cashOnHandCount'
  | 'transferAmount'
  | 'transferOrderCount'
  | 'runnerAcceptedOrders'
  | 'runnerAcceptedAmount',
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
  | 'transfer_count'
  | 'delivered_orders'
  | 'total_sales'
  | 'cash_amount'
  | 'cash_order_count'
  | 'cash_on_hand'
  | 'cash_on_hand_count'
  | 'transfer_amount'
  | 'transfer_order_count'
  | 'runner_accepted_orders'
  | 'runner_accepted_amount',
  number | string | null
>>;

export interface DriverAnalyticsSummary {
  deliveredOrders: number;
  totalSales: number;
  cashAmount: number;
  cashOrderCount: number;
  cashOnHand: number;
  cashOnHandCount: number;
  transferAmount: number;
  transferOrderCount: number;
  runnerAcceptedOrders: number;
  runnerAcceptedAmount: number;
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

export function groupDriverAnalyticsOrders(orders: DriverAnalyticsOrder[]) {
  return orders.reduce<{
    visible: DriverAnalyticsOrder[];
    pendingAcceptance: DriverAnalyticsOrder[];
    failed: DriverAnalyticsOrder[];
  }>((groups, order) => {
    if (order.assignment_state === 'PENDING_ACCEPTANCE') {
      groups.pendingAcceptance.push(order);
    } else if (order.assignment_state === 'FAILED') {
      groups.failed.push(order);
    } else {
      groups.visible.push(order);
    }
    return groups;
  }, { visible: [], pendingAcceptance: [], failed: [] });
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
  const deliveredOrders = metric(source.deliveredOrders ?? source.delivered_orders ?? source.delivered ?? source.assigned);
  const totalSales = metric(source.totalSales ?? source.total_sales ?? source.totalAssignedSales ?? source.total_assigned_sales);
  const cashAmount = metric(source.cashAmount ?? source.cash_amount ?? source.cashCollected ?? source.cash_collected);
  const cashOrderCount = metric(source.cashOrderCount ?? source.cash_order_count ?? source.cashCollectedCount ?? source.cash_collected_count);
  const cashOnHand = metric(source.cashOnHand ?? source.cash_on_hand ?? source.cashPendingSettlement ?? source.cash_pending);
  const cashOnHandCount = metric(source.cashOnHandCount ?? source.cash_on_hand_count ?? source.cashPendingSettlementCount ?? source.cash_pending_count);
  const transferAmount = metric(source.transferAmount ?? source.transfer_amount ?? source.transfer);
  const transferOrderCount = metric(source.transferOrderCount ?? source.transfer_order_count ?? source.transferCount ?? source.transfer_count);
  const runnerAcceptedOrders = metric(source.runnerAcceptedOrders ?? source.runner_accepted_orders ?? source.delivered);
  const runnerAcceptedAmount = metric(source.runnerAcceptedAmount ?? source.runner_accepted_amount ?? source.acceptedSales ?? source.accepted_sales);
  const pendingAcceptance = metric(source.pendingAcceptance ?? source.pending_acceptance);
  const pendingAcceptanceAmount = metric(source.pendingAcceptanceAmount ?? source.pending_acceptance_amount);

  return {
    deliveredOrders,
    totalSales,
    cashAmount,
    cashOrderCount,
    cashOnHand,
    cashOnHandCount,
    transferAmount,
    transferOrderCount,
    runnerAcceptedOrders,
    runnerAcceptedAmount,
    assigned: deliveredOrders,
    delivered: deliveredOrders,
    deliveryRate: deliveredOrders > 0 ? 100 : 0,
    failed: 0,
    inactive: 0,
    pending: pendingAcceptance,
    pendingAcceptance,
    pendingAcceptanceAmount,
    totalAssignedSales: totalSales,
    acceptedSales: runnerAcceptedAmount,
    acceptedAmount: runnerAcceptedAmount,
    pendingSales: pendingAcceptanceAmount,
    cashCollected: cashAmount,
    cashCollectedCount: cashOrderCount,
    cashPendingSettlement: cashOnHand,
    cashPendingSettlementCount: cashOnHandCount,
    transfer: transferAmount,
    transferCount: transferOrderCount,
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
