import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, format, differenceInMinutes, parseISO } from 'date-fns';
import { getTodayDateKey, isDriverWorkloadOrder } from '@/lib/driverOrderScope';

export interface DailyStats {
  date: string;
  delivered: number;
  failed: number;
  totalAmount: number;
}

export interface AreaStats {
  area: string;
  deliveredCount: number;
  failedCount: number;
  totalAmount: number;
  avgDeliveryTime: number | null;
}

export interface DriverStatusMetric {
  count: number;
  amount: number;
}

export interface DriverAnalytics {
  // Weekly stats
  thisWeek: {
    delivered: number;
    failed: number;
    totalAmount: number;
    avgDeliveryTimeMinutes: number | null;
  };
  lastWeek: {
    delivered: number;
    failed: number;
    totalAmount: number;
  };
  weeklyTrend: DailyStats[];
  
  // Monthly stats
  thisMonth: {
    delivered: number;
    failed: number;
    totalAmount: number;
    avgDeliveryTimeMinutes: number | null;
  };
  lastMonth: {
    delivered: number;
    failed: number;
    totalAmount: number;
  };
  monthlyTrend: DailyStats[];
  
  // Area coverage
  areaStats: AreaStats[];
  topAreas: AreaStats[];
  
  // Performance metrics
  successRate: number;
  avgOrderValue: number;
  statusSummary: {
    delivered: DriverStatusMetric;
    failed: DriverStatusMetric;
    waitingAccept: DriverStatusMetric;
    failedWaitingAccept: DriverStatusMetric;
  };
}

export function useDriverAnalytics(driverId?: string) {
  const todayDateKey = getTodayDateKey();

  return useQuery({
    queryKey: ['driver-analytics', driverId, todayDateKey],
    queryFn: async (): Promise<DriverAnalytics | null> => {
      if (!driverId) return null;

      const now = new Date();
      
      // Date ranges
      const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
      const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
      const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      const thisMonthStart = startOfMonth(now);
      const thisMonthEnd = endOfMonth(now);
      const lastMonthStart = startOfMonth(subMonths(now, 1));
      const lastMonthEnd = endOfMonth(subMonths(now, 1));
      
      // Fetch all relevant orders for this driver
      const { data: orders, error } = await supabase
        .from('orders')
        .select('id, order_date, expected_pickup_date, next_delivery_date, runner_assigned_at, created_at, total_amount, area, status, runner_status, driver_status, runner_accept_status, driver_delivered_at')
        .eq('driver_id', driverId)
        .gte('order_date', format(lastMonthStart, 'yyyy-MM-dd'));
      
      if (error) throw error;
      if (!orders) return null;
      const amountOf = (items: typeof orders) => items.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
      const metricOf = (items: typeof orders): DriverStatusMetric => ({
        count: items.length,
        amount: amountOf(items),
      });
      const isAcceptedDelivered = (order: typeof orders[number]) =>
        order.driver_status === 'DRIVER_DELIVERED' && order.runner_accept_status === 'ACCEPTED';
      const isDriverFailed = (order: typeof orders[number]) => order.driver_status === 'DRIVER_FAILED';
      const isWaitingAccept = (order: typeof orders[number]) =>
        order.driver_status === 'DRIVER_DELIVERED' && order.runner_accept_status === 'PENDING';
      const isFailedWaitingAccept = (order: typeof orders[number]) =>
        order.driver_status === 'DRIVER_FAILED' && order.runner_accept_status === 'PENDING';
      const currentActiveOrders = orders.filter((order) => isDriverWorkloadOrder(order, todayDateKey));

      // Helper to calculate stats for a date range
      const calcStats = (start: Date, end: Date) => {
        const rangeOrders = orders.filter(o => {
          const orderDate = parseISO(o.order_date);
          return orderDate >= start && orderDate <= end;
        });
        
        const delivered = rangeOrders.filter(isAcceptedDelivered).length;
        const failed = rangeOrders.filter(isDriverFailed).length;
        const totalAmount = rangeOrders
          .filter(isAcceptedDelivered)
          .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
        
        // Calculate avg delivery time
        const deliveredWithTime = rangeOrders.filter(o => 
          isAcceptedDelivered(o) &&
          o.driver_delivered_at && 
          o.created_at
        );
        
        let avgDeliveryTimeMinutes: number | null = null;
        if (deliveredWithTime.length > 0) {
          const totalMinutes = deliveredWithTime.reduce((sum, o) => {
            const created = parseISO(o.created_at);
            const delivered = parseISO(o.driver_delivered_at!);
            return sum + differenceInMinutes(delivered, created);
          }, 0);
          avgDeliveryTimeMinutes = Math.round(totalMinutes / deliveredWithTime.length);
        }
        
        return { delivered, failed, totalAmount, avgDeliveryTimeMinutes };
      };

      // Calculate daily trend for this week
      const weeklyTrend: DailyStats[] = [];
      for (let d = new Date(thisWeekStart); d <= thisWeekEnd; d.setDate(d.getDate() + 1)) {
        const dayStr = format(d, 'yyyy-MM-dd');
        const dayOrders = orders.filter(o => o.order_date === dayStr);
        weeklyTrend.push({
          date: dayStr,
          delivered: dayOrders.filter(isAcceptedDelivered).length,
          failed: dayOrders.filter(isDriverFailed).length,
          totalAmount: dayOrders
            .filter(isAcceptedDelivered)
            .reduce((sum, o) => sum + Number(o.total_amount || 0), 0),
        });
      }

      // Calculate daily trend for this month
      const monthlyTrend: DailyStats[] = [];
      for (let d = new Date(thisMonthStart); d <= thisMonthEnd; d.setDate(d.getDate() + 1)) {
        const dayStr = format(d, 'yyyy-MM-dd');
        const dayOrders = orders.filter(o => o.order_date === dayStr);
        monthlyTrend.push({
          date: dayStr,
          delivered: dayOrders.filter(isAcceptedDelivered).length,
          failed: dayOrders.filter(isDriverFailed).length,
          totalAmount: dayOrders
            .filter(isAcceptedDelivered)
            .reduce((sum, o) => sum + Number(o.total_amount || 0), 0),
        });
      }

      // Current route area coverage uses the same active-order scope as My Deliveries, Route, Pickups and Returns.
      const areaMap = new Map<string, { active: number; amount: number }>();
      currentActiveOrders.forEach(order => {
        const area = order.area || 'Unknown';
        if (!areaMap.has(area)) {
          areaMap.set(area, { active: 0, amount: 0 });
        }
        const stats = areaMap.get(area)!;
        stats.active++;
        stats.amount += Number(order.total_amount || 0);
      });

      const areaStats: AreaStats[] = Array.from(areaMap.entries()).map(([area, stats]) => ({
        area,
        deliveredCount: stats.active,
        failedCount: 0,
        totalAmount: stats.amount,
        avgDeliveryTime: null,
      }));

      const topAreas = [...areaStats]
        .sort((a, b) => b.deliveredCount - a.deliveredCount)
        .slice(0, 5);

      // Calculate overall metrics
      const allDelivered = orders.filter(isAcceptedDelivered).length;
      const allFailed = orders.filter(isDriverFailed).length;
      const total = allDelivered + allFailed;
      const successRate = total > 0 ? Math.round((allDelivered / total) * 100) : 0;
      const avgOrderValue = allDelivered > 0 
        ? Math.round(orders.filter(isAcceptedDelivered)
            .reduce((sum, o) => sum + Number(o.total_amount || 0), 0) / allDelivered)
        : 0;

      return {
        thisWeek: calcStats(thisWeekStart, thisWeekEnd),
        lastWeek: calcStats(lastWeekStart, lastWeekEnd),
        weeklyTrend,
        thisMonth: calcStats(thisMonthStart, thisMonthEnd),
        lastMonth: calcStats(lastMonthStart, lastMonthEnd),
        monthlyTrend,
        areaStats,
        topAreas,
        successRate,
        avgOrderValue,
        statusSummary: {
          delivered: metricOf(orders.filter(isAcceptedDelivered)),
          failed: metricOf(orders.filter(isDriverFailed)),
          waitingAccept: metricOf(orders.filter(isWaitingAccept)),
          failedWaitingAccept: metricOf(orders.filter(isFailedWaitingAccept)),
        },
      };
    },
    enabled: !!driverId,
  });
}

// Get analytics for all drivers under a runner
export function useRunnerDriversAnalytics(runnerId?: string) {
  return useQuery({
    queryKey: ['runner-drivers-analytics', runnerId],
    queryFn: async () => {
      if (!runnerId) return [];

      const now = new Date();
      const thisMonthStart = startOfMonth(now);
      
      // Get all drivers for this runner
      const { data: drivers, error: driversError } = await supabase
        .from('runner_drivers')
        .select('driver_id, driver:profiles!runner_drivers_driver_id_fkey(display_name)')
        .eq('runner_id', runnerId)
        .eq('is_active', true);
      
      if (driversError) throw driversError;
      if (!drivers) return [];

      // Get orders for all drivers this month
      const driverIds = drivers.map(d => d.driver_id);
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('driver_id,total_amount,driver_status,runner_accept_status,order_date')
        .in('driver_id', driverIds)
        .gte('order_date', format(thisMonthStart, 'yyyy-MM-dd'));
      
      if (ordersError) throw ordersError;

      return drivers.map(driver => {
        const driverOrders = orders?.filter(o => o.driver_id === driver.driver_id) || [];
        const delivered = driverOrders.filter(o => o.driver_status === 'DRIVER_DELIVERED' && o.runner_accept_status === 'ACCEPTED').length;
        const failed = driverOrders.filter(o => o.driver_status === 'DRIVER_FAILED').length;
        const total = delivered + failed;
        
        return {
          driverId: driver.driver_id,
          driverName: (driver.driver as any)?.display_name || 'Unknown',
          delivered,
          failed,
          successRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
          totalAmount: driverOrders
            .filter(o => o.driver_status === 'DRIVER_DELIVERED' && o.runner_accept_status === 'ACCEPTED')
            .reduce((sum, o) => sum + Number(o.total_amount || 0), 0),
        };
      });
    },
    enabled: !!runnerId,
  });
}
