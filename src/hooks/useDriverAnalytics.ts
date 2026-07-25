import { useQuery } from '@tanstack/react-query';
import { eachDayOfInterval, endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import {
  fetchDriverAssignments,
  summarizeDriverAssignments,
  type DriverAssignment,
} from '@/hooks/useDriverAssignments';

export type DriverAnalyticsSummary = ReturnType<typeof summarizeDriverAssignments>;

export interface DriverDailyAnalytics extends DriverAnalyticsSummary {
  date: string;
  orders: DriverAssignment[];
}

export interface DriverAnalytics {
  summary: DriverAnalyticsSummary;
  daily: DriverDailyAnalytics[];
  rangeOrders: DriverAssignment[];
}

export type DriverAnalyticsRange = {
  dateFrom?: string;
  dateTo?: string;
  calendarFrom?: string;
  calendarTo?: string;
};

function rangeBounds(range: DriverAnalyticsRange) {
  const now = new Date();
  const defaultFrom = format(startOfMonth(now), 'yyyy-MM-dd');
  const defaultTo = format(endOfMonth(now), 'yyyy-MM-dd');
  const dateFrom = range.dateFrom || defaultFrom;
  const dateTo = range.dateTo || defaultTo;
  const calendarFrom = range.calendarFrom || dateFrom;
  const calendarTo = range.calendarTo || dateTo;

  return {
    dateFrom,
    dateTo,
    calendarFrom,
    calendarTo,
    queryFrom: [dateFrom, calendarFrom].sort()[0],
    queryTo: [dateTo, calendarTo].sort().at(-1)!,
  };
}

export function useDriverAnalytics(driverId?: string, range: DriverAnalyticsRange = {}) {
  const bounds = rangeBounds(range);

  return useQuery({
    queryKey: [
      'driver-analytics',
      driverId,
      bounds.dateFrom,
      bounds.dateTo,
      bounds.calendarFrom,
      bounds.calendarTo,
    ],
    queryFn: async (): Promise<DriverAnalytics | null> => {
      if (!driverId) return null;

      const assignments = await fetchDriverAssignments({
        driverId,
        dateFrom: bounds.queryFrom,
        dateTo: bounds.queryTo,
        includeItems: false,
      });
      const rangeOrders = assignments.filter(
        (order) => order.operational_date >= bounds.dateFrom && order.operational_date <= bounds.dateTo,
      );
      const calendarOrders = assignments.filter(
        (order) => order.operational_date >= bounds.calendarFrom && order.operational_date <= bounds.calendarTo,
      );
      const ordersByDate = new Map<string, DriverAssignment[]>();
      calendarOrders.forEach((order) => {
        ordersByDate.set(order.operational_date, [...(ordersByDate.get(order.operational_date) || []), order]);
      });

      const daily = eachDayOfInterval({
        start: parseISO(bounds.calendarFrom),
        end: parseISO(bounds.calendarTo),
      }).map((day) => {
        const date = format(day, 'yyyy-MM-dd');
        const orders = ordersByDate.get(date) || [];
        return { date, orders, ...summarizeDriverAssignments(orders) };
      });

      return {
        summary: summarizeDriverAssignments(rangeOrders),
        daily,
        rangeOrders,
      };
    },
    enabled: Boolean(driverId),
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
