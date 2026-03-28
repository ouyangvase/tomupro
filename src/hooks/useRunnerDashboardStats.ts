import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfDay, endOfDay } from 'date-fns';

export interface RunnerDashboardData {
  // Today's workload
  todayStats: {
    pendingAssignment: number;
    inProgress: number;
    deliveredToday: number;
    failedToday: number;
    totalTodayValue: number;
  };
  // All time totals
  allTimeStats: {
    totalDelivered: number;
    totalFailed: number;
  };
  // Earnings & Claims
  earningsStats: {
    deliveredTodayValue: number;
    pendingClaimCount: number;
    pendingClaimValue: number;
    submittedClaimCount: number;
    submittedClaimValue: number;
    approvedClaimValue: number;
  };
  // Blockers
  blockerStats: {
    failedOrdersCount: number;
    missingDeliveryChargesCount: number;
    driverIssuesCount: number;
  };
  // Orders lists for quick access
  urgentOrders: {
    id: string;
    order_code: string;
    customer_name: string;
    area: string | null;
    total_amount: number;
    runner_status: string;
    driver_id: string | null;
  }[];
}

export function useRunnerDashboardStats() {
  const { user } = useAuth();
  const today = new Date();
  const todayStart = startOfDay(today).toISOString();
  const todayEnd = endOfDay(today).toISOString();

  return useQuery({
    queryKey: ['runner-dashboard-stats', user?.id, todayStart],
    queryFn: async (): Promise<RunnerDashboardData> => {
      if (!user) throw new Error('Not authenticated');

      // Fetch all runner's active orders in one query for efficiency
      const { data: allOrders, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_code, customer_name, area, total_amount, runner_status, reconciliation_status, driver_id, delivered_at, updated_at, status')
        .eq('runner_id', user.id)
        .neq('status', 'CANCELLED');

      if (ordersError) throw ordersError;

      const orders = allOrders || [];

      // Calculate today's stats
      const pendingAssignment = orders.filter(o => o.runner_status === 'UNASSIGNED').length;
      const inProgress = orders.filter(o => ['ASSIGNED', 'TAKEN'].includes(o.runner_status)).length;
      
      const deliveredTodayOrders = orders.filter(o => 
        o.runner_status === 'DELIVERED' && 
        o.delivered_at && 
        o.delivered_at >= todayStart && 
        o.delivered_at <= todayEnd
      );
      const deliveredToday = deliveredTodayOrders.length;
      const deliveredTodayValue = deliveredTodayOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);

      const failedTodayOrders = orders.filter(o => 
        o.runner_status === 'FAILED_DELIVERY' && 
        o.updated_at >= todayStart && 
        o.updated_at <= todayEnd
      );
      const failedToday = failedTodayOrders.length;

      // Total today's value (in progress + delivered today)
      const inProgressOrders = orders.filter(o => ['ASSIGNED', 'TAKEN'].includes(o.runner_status));
      const totalTodayValue = inProgressOrders.reduce((sum, o) => sum + Number(o.total_amount), 0) + deliveredTodayValue;

      // All time stats
      const totalDelivered = orders.filter(o => o.runner_status === 'DELIVERED').length;
      const totalFailed = orders.filter(o => o.runner_status === 'FAILED_DELIVERY').length;

      // Earnings & claims stats
      const pendingClaimOrders = orders.filter(o => 
        o.runner_status === 'DELIVERED' && 
        o.reconciliation_status === 'NOT_CLAIMED'
      );
      const pendingClaimCount = pendingClaimOrders.length;
      const pendingClaimValue = pendingClaimOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);

      const submittedClaimOrders = orders.filter(o => 
        o.runner_status === 'DELIVERED' && 
        o.reconciliation_status === 'ADMIN_ACK_PENDING'
      );
      const submittedClaimCount = submittedClaimOrders.length;
      const submittedClaimValue = submittedClaimOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);

      const approvedClaimOrders = orders.filter(o => 
        o.runner_status === 'DELIVERED' && 
        ['CLAIMED', 'SETTLED'].includes(o.reconciliation_status)
      );
      const approvedClaimValue = approvedClaimOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);

      // Blockers
      const failedOrdersCount = orders.filter(o => o.runner_status === 'FAILED_DELIVERY').length;

      // Check for areas without delivery charges
      const uniqueAreas = [...new Set(pendingClaimOrders.map(o => o.area).filter(Boolean))];
      const { data: deliveryCharges } = await supabase
        .from('delivery_charges')
        .select('area')
        .eq('runner_id', user.id)
        .eq('status', 'APPROVED')
        .is('superseded_at', null);

      const approvedAreas = new Set(deliveryCharges?.map(c => c.area.toLowerCase()) || []);
      const missingAreas = uniqueAreas.filter(area => !approvedAreas.has((area as string).toLowerCase()));
      const missingDeliveryChargesCount = missingAreas.length;

      // Driver issues (orders assigned to drivers but stuck)
      const driverIssuesCount = orders.filter(o => 
        o.driver_id && 
        ['ASSIGNED', 'TAKEN'].includes(o.runner_status) &&
        o.updated_at < new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // More than 24 hours
      ).length;

      // Urgent orders (failed + in progress with no driver)
      const urgentOrders = orders
        .filter(o => 
          o.runner_status === 'FAILED_DELIVERY' || 
          (o.runner_status === 'UNASSIGNED') ||
          (['ASSIGNED', 'TAKEN'].includes(o.runner_status) && !o.driver_id)
        )
        .slice(0, 5)
        .map(o => ({
          id: o.id,
          order_code: o.order_code,
          customer_name: o.customer_name,
          area: o.area,
          total_amount: o.total_amount,
          runner_status: o.runner_status,
          driver_id: o.driver_id,
        }));

      return {
        todayStats: {
          pendingAssignment,
          inProgress,
          deliveredToday,
          failedToday,
          totalTodayValue,
        },
        allTimeStats: {
          totalDelivered,
          totalFailed,
        },
        earningsStats: {
          deliveredTodayValue,
          pendingClaimCount,
          pendingClaimValue,
          submittedClaimCount,
          submittedClaimValue,
          approvedClaimValue,
        },
        blockerStats: {
          failedOrdersCount,
          missingDeliveryChargesCount,
          driverIssuesCount,
        },
        urgentOrders,
      };
    },
    enabled: !!user,
    refetchInterval: 30000, // 30 seconds (realtime handles urgent updates)
    staleTime: 15000,
  });
}
