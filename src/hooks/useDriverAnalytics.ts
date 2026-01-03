import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, format, differenceInMinutes, parseISO } from 'date-fns';

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
}

export function useDriverAnalytics(driverId?: string) {
  return useQuery({
    queryKey: ['driver-analytics', driverId],
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
        .select('*')
        .eq('driver_id', driverId)
        .gte('order_date', format(lastMonthStart, 'yyyy-MM-dd'));
      
      if (error) throw error;
      if (!orders) return null;

      // Helper to calculate stats for a date range
      const calcStats = (start: Date, end: Date) => {
        const rangeOrders = orders.filter(o => {
          const orderDate = parseISO(o.order_date);
          return orderDate >= start && orderDate <= end;
        });
        
        const delivered = rangeOrders.filter(o => o.runner_accept_status === 'ACCEPTED').length;
        const failed = rangeOrders.filter(o => o.driver_status === 'DRIVER_FAILED').length;
        const totalAmount = rangeOrders
          .filter(o => o.runner_accept_status === 'ACCEPTED')
          .reduce((sum, o) => sum + o.total_amount, 0);
        
        // Calculate avg delivery time
        const deliveredWithTime = rangeOrders.filter(o => 
          o.runner_accept_status === 'ACCEPTED' && 
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
          delivered: dayOrders.filter(o => o.runner_accept_status === 'ACCEPTED').length,
          failed: dayOrders.filter(o => o.driver_status === 'DRIVER_FAILED').length,
          totalAmount: dayOrders
            .filter(o => o.runner_accept_status === 'ACCEPTED')
            .reduce((sum, o) => sum + o.total_amount, 0),
        });
      }

      // Calculate daily trend for this month
      const monthlyTrend: DailyStats[] = [];
      for (let d = new Date(thisMonthStart); d <= thisMonthEnd; d.setDate(d.getDate() + 1)) {
        const dayStr = format(d, 'yyyy-MM-dd');
        const dayOrders = orders.filter(o => o.order_date === dayStr);
        monthlyTrend.push({
          date: dayStr,
          delivered: dayOrders.filter(o => o.runner_accept_status === 'ACCEPTED').length,
          failed: dayOrders.filter(o => o.driver_status === 'DRIVER_FAILED').length,
          totalAmount: dayOrders
            .filter(o => o.runner_accept_status === 'ACCEPTED')
            .reduce((sum, o) => sum + o.total_amount, 0),
        });
      }

      // Calculate area stats
      const areaMap = new Map<string, { delivered: number; failed: number; amount: number; times: number[] }>();
      orders.forEach(order => {
        const area = order.area || 'Unknown';
        if (!areaMap.has(area)) {
          areaMap.set(area, { delivered: 0, failed: 0, amount: 0, times: [] });
        }
        const stats = areaMap.get(area)!;
        
        if (order.runner_accept_status === 'ACCEPTED') {
          stats.delivered++;
          stats.amount += order.total_amount;
          if (order.driver_delivered_at && order.created_at) {
            const minutes = differenceInMinutes(
              parseISO(order.driver_delivered_at),
              parseISO(order.created_at)
            );
            stats.times.push(minutes);
          }
        } else if (order.driver_status === 'DRIVER_FAILED') {
          stats.failed++;
        }
      });

      const areaStats: AreaStats[] = Array.from(areaMap.entries()).map(([area, stats]) => ({
        area,
        deliveredCount: stats.delivered,
        failedCount: stats.failed,
        totalAmount: stats.amount,
        avgDeliveryTime: stats.times.length > 0 
          ? Math.round(stats.times.reduce((a, b) => a + b, 0) / stats.times.length)
          : null,
      }));

      const topAreas = [...areaStats]
        .sort((a, b) => b.deliveredCount - a.deliveredCount)
        .slice(0, 5);

      // Calculate overall metrics
      const allDelivered = orders.filter(o => o.runner_accept_status === 'ACCEPTED').length;
      const allFailed = orders.filter(o => o.driver_status === 'DRIVER_FAILED').length;
      const total = allDelivered + allFailed;
      const successRate = total > 0 ? Math.round((allDelivered / total) * 100) : 0;
      const avgOrderValue = allDelivered > 0 
        ? Math.round(orders.filter(o => o.runner_accept_status === 'ACCEPTED')
            .reduce((sum, o) => sum + o.total_amount, 0) / allDelivered)
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
        .select('*')
        .in('driver_id', driverIds)
        .gte('order_date', format(thisMonthStart, 'yyyy-MM-dd'));
      
      if (ordersError) throw ordersError;

      return drivers.map(driver => {
        const driverOrders = orders?.filter(o => o.driver_id === driver.driver_id) || [];
        const delivered = driverOrders.filter(o => o.runner_accept_status === 'ACCEPTED').length;
        const failed = driverOrders.filter(o => o.driver_status === 'DRIVER_FAILED').length;
        const total = delivered + failed;
        
        return {
          driverId: driver.driver_id,
          driverName: (driver.driver as any)?.display_name || 'Unknown',
          delivered,
          failed,
          successRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
          totalAmount: driverOrders
            .filter(o => o.runner_accept_status === 'ACCEPTED')
            .reduce((sum, o) => sum + o.total_amount, 0),
        };
      });
    },
    enabled: !!runnerId,
  });
}
