import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';

export interface SalespersonPerformanceStats {
  // Today's performance
  todaySalesAmount: number;
  todayDeliveredCount: number;
  
  // Month-to-date performance
  mtdSalesAmount: number;
  mtdDeliveredCount: number;
  mtdOrdersCount: number;
  
  // Monthly target (can be made configurable later)
  monthlyTarget: number;
  targetProgress: number;
  remainingToTarget: number;
  
  // Estimated commission (based on delivered orders)
  estimatedCommission: number;
  commissionRate: number;
  
  // Action items
  failedOrdersCount: number;
  pendingDeliveryCount: number;
  pendingClaimCount: number;
  
  // Stock snapshot
  stockItems: Array<{
    productId: string;
    skuCode: string | null;
    productName: string;
    balance: number;
    isLowStock: boolean;
  }>;
  
  // Ranking (if applicable)
  ranking: {
    currentRank: number;
    totalSalespersons: number;
    mtdSalesRank: number;
    mtdDeliveredRank: number;
  } | null;
}

export function useSalespersonDashboard() {
  const { user } = useAuth();
  const today = new Date();
  const todayStart = startOfDay(today).toISOString();
  const todayEnd = endOfDay(today).toISOString();
  const monthStart = startOfMonth(today).toISOString();
  const monthEnd = endOfMonth(today).toISOString();

  // Default commission rate (5%) - can be made configurable
  const COMMISSION_RATE = 0.05;
  // Default monthly target - can be made configurable per user
  const DEFAULT_MONTHLY_TARGET = 10000;

  return useQuery({
    queryKey: ['salesperson-dashboard', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const [
        todaySalesRes,
        mtdSalesRes,
        failedOrdersRes,
        pendingDeliveryRes,
        pendingClaimRes,
        stockBalanceRes,
        rankingRes,
      ] = await Promise.all([
        // Today's delivered orders with total amount
        supabase
          .from('orders')
          .select('id, total_amount')
          .eq('salesperson_id', user.id)
          .eq('runner_status', 'DELIVERED')
          .gte('delivered_at', todayStart)
          .lte('delivered_at', todayEnd),
        
        // MTD delivered orders with total amount
        supabase
          .from('orders')
          .select('id, total_amount')
          .eq('salesperson_id', user.id)
          .eq('runner_status', 'DELIVERED')
          .gte('delivered_at', monthStart)
          .lte('delivered_at', monthEnd),
        
        // Failed orders requiring action
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('salesperson_id', user.id)
          .eq('runner_status', 'FAILED_DELIVERY')
          .eq('salesperson_action_required', true),
        
        // Pending delivery (READY status with ASSIGNED or TAKEN runner_status)
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('salesperson_id', user.id)
          .eq('status', 'READY')
          .in('runner_status', ['ASSIGNED', 'TAKEN']),
        
        // Pending claim (delivered but not claimed by runner)
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('salesperson_id', user.id)
          .eq('runner_status', 'DELIVERED')
          .eq('reconciliation_status', 'NOT_CLAIMED'),
        
        // Stock balance for this salesperson
        supabase
          .from('stock_balance_view')
          .select('product_id, sku_code, sku_name, balance_qty, owner_user_id')
          .eq('owner_user_id', user.id),
        
        // Get all salespersons' MTD sales for ranking
        supabase
          .from('orders')
          .select('salesperson_id, total_amount')
          .eq('runner_status', 'DELIVERED')
          .gte('delivered_at', monthStart)
          .lte('delivered_at', monthEnd),
      ]);

      // Calculate today's sales
      const todaySalesAmount = (todaySalesRes.data || []).reduce(
        (sum, order) => sum + (order.total_amount || 0), 
        0
      );
      const todayDeliveredCount = todaySalesRes.data?.length || 0;

      // Calculate MTD sales
      const mtdSalesAmount = (mtdSalesRes.data || []).reduce(
        (sum, order) => sum + (order.total_amount || 0), 
        0
      );
      const mtdDeliveredCount = mtdSalesRes.data?.length || 0;

      // Calculate target progress
      const monthlyTarget = DEFAULT_MONTHLY_TARGET;
      const targetProgress = Math.min((mtdSalesAmount / monthlyTarget) * 100, 100);
      const remainingToTarget = Math.max(monthlyTarget - mtdSalesAmount, 0);

      // Calculate estimated commission
      const estimatedCommission = mtdSalesAmount * COMMISSION_RATE;

      // Process stock items
      const stockItems = (stockBalanceRes.data || []).map(item => ({
        productId: item.product_id || '',
        skuCode: item.sku_code,
        productName: item.sku_name || 'Unknown',
        balance: item.balance_qty || 0,
        isLowStock: (item.balance_qty || 0) <= 3,
      })).filter(item => item.balance > 0);

      // Calculate ranking
      let ranking = null;
      if (rankingRes.data && rankingRes.data.length > 0) {
        // Group by salesperson and sum their sales
        const salesBySP: Record<string, { amount: number; count: number }> = {};
        rankingRes.data.forEach(order => {
          const spId = order.salesperson_id;
          if (spId) {
            if (!salesBySP[spId]) {
              salesBySP[spId] = { amount: 0, count: 0 };
            }
            salesBySP[spId].amount += order.total_amount || 0;
            salesBySP[spId].count += 1;
          }
        });

        // Convert to array and sort by amount
        const sortedByAmount = Object.entries(salesBySP)
          .map(([spId, data]) => ({ spId, ...data }))
          .sort((a, b) => b.amount - a.amount);

        // Sort by count for delivered rank
        const sortedByCount = [...sortedByAmount].sort((a, b) => b.count - a.count);

        // Find current user's ranks
        const amountRank = sortedByAmount.findIndex(s => s.spId === user.id) + 1;
        const countRank = sortedByCount.findIndex(s => s.spId === user.id) + 1;

        if (sortedByAmount.length > 1) {
          ranking = {
            currentRank: amountRank || sortedByAmount.length,
            totalSalespersons: sortedByAmount.length,
            mtdSalesRank: amountRank || sortedByAmount.length,
            mtdDeliveredRank: countRank || sortedByCount.length,
          };
        }
      }

      return {
        todaySalesAmount,
        todayDeliveredCount,
        mtdSalesAmount,
        mtdDeliveredCount,
        mtdOrdersCount: mtdDeliveredCount,
        monthlyTarget,
        targetProgress,
        remainingToTarget,
        estimatedCommission,
        commissionRate: COMMISSION_RATE,
        failedOrdersCount: failedOrdersRes.count || 0,
        pendingDeliveryCount: pendingDeliveryRes.count || 0,
        pendingClaimCount: pendingClaimRes.count || 0,
        stockItems,
        ranking,
      } as SalespersonPerformanceStats;
    },
    enabled: !!user,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}
