import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, format } from 'date-fns';

export interface SalespersonPerformanceStats {
  // Today's performance
  todaySalesAmount: number;
  todayDeliveredCount: number;
  
  // Month-to-date performance
  mtdSalesAmount: number;
  mtdDeliveredCount: number;
  mtdOrdersCount: number;
  
  // Monthly target (from database)
  monthlyTarget: number;
  targetType: 'ORDER_COUNT' | 'SALES_VALUE' | null;
  targetProgress: number;
  remainingToTarget: number;
  
  // Commission stats
  estimatedCommission: number; // Delivered but not reconciled
  finalCommission: number; // Reconciled & approved
  totalCommission: number;
  commissionMode: 'PER_ORDER' | 'PERCENTAGE' | null;
  commissionRate: number;
  
  // Tier progress
  currentTier: number | null;
  nextTierAt: number | null;
  ordersToNextTier: number | null;
  currentTierValue: number | null;
  nextTierValue: number | null;
  isTiered: boolean;
  
  // Action items
  failedOrdersCount: number;
  pendingDeliveryCount: number;
  pendingClaimCount: number;
  // Count matching OCC's needsSalespersonAction logic:
  // salesperson_action_required=true OR (runner_status=FAILED_DELIVERY AND status!=CANCELLED)
  actionRequiredCount: number;
  
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
  const currentYearMonth = format(today, 'yyyy-MM');

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
        actionRequiredRes,
        stockBalanceRes,
        rankingRes,
        targetRes,
        commissionSettingsRes,
        commissionSnapshotsRes,
        pendingReconOrdersRes,
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

        // Action-required count: matches OCC's needsSalespersonAction logic
        // salesperson_action_required=true OR runner_status=FAILED_DELIVERY (non-cancelled)
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('salesperson_id', user.id)
          .or('salesperson_action_required.eq.true,runner_status.eq.FAILED_DELIVERY')
          .neq('status', 'CANCELLED'),
        
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
        
        // Get monthly target from database
        supabase
          .from('salesperson_targets')
          .select('*')
          .eq('salesperson_id', user.id)
          .eq('year_month', currentYearMonth)
          .maybeSingle(),
        
        // Get commission settings
        supabase
          .from('commission_settings')
          .select('*, commission_tiers(*)')
          .eq('salesperson_id', user.id)
          .maybeSingle(),
        
        // Get commission snapshots for this month (reconciled)
        supabase
          .from('commission_snapshots')
          .select('*')
          .eq('salesperson_id', user.id)
          .eq('year_month', currentYearMonth),
        
        // Get delivered but not reconciled orders (for estimated commission)
        supabase
          .from('orders')
          .select('id, total_amount, discount_amount')
          .eq('salesperson_id', user.id)
          .eq('runner_status', 'DELIVERED')
          .neq('reconciliation_status', 'SETTLED')
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

      // Get target from database or use default
      const targetData = targetRes.data;
      const targetType = targetData?.target_type as 'ORDER_COUNT' | 'SALES_VALUE' | null;
      const monthlyTarget = targetData?.target_value ?? 10000; // Default fallback
      
      // Calculate target progress based on target type
      let achievedValue: number;
      if (targetType === 'ORDER_COUNT') {
        achievedValue = mtdDeliveredCount;
      } else {
        achievedValue = mtdSalesAmount;
      }
      const targetProgress = Math.min((achievedValue / monthlyTarget) * 100, 100);
      const remainingToTarget = Math.max(monthlyTarget - achievedValue, 0);

      // Calculate commission
      const commissionSettings = commissionSettingsRes.data;
      const commissionSnapshots = commissionSnapshotsRes.data || [];
      const pendingReconOrders = pendingReconOrdersRes.data || [];
      
      // Final commission from snapshots (reconciled & approved)
      const finalCommission = commissionSnapshots.reduce(
        (sum, s) => sum + (Number(s.commission_amount) || 0), 
        0
      );
      const monthlyReconciledCount = commissionSnapshots.length;

      // Estimated commission from delivered but not reconciled orders
      let estimatedCommission = 0;
      const tiers = (commissionSettings?.commission_tiers || []).sort(
        (a: any, b: any) => a.tier_order - b.tier_order
      );

      if (commissionSettings) {
        pendingReconOrders.forEach((order, index) => {
          const orderSequence = monthlyReconciledCount + index + 1;
          const commissionBase = (order.total_amount || 0) - (order.discount_amount || 0);
          
          let commissionValue = Number(commissionSettings.base_value) || 0;
          
          // Apply tiered commission if applicable
          if (commissionSettings.is_tiered && tiers.length > 0) {
            const applicableTier = tiers.find((t: any) => 
              orderSequence >= t.min_orders && 
              (t.max_orders === null || orderSequence <= t.max_orders)
            ) || tiers[tiers.length - 1];
            
            if (applicableTier) {
              commissionValue = Number(applicableTier.tier_value) || 0;
            }
          }
          
          if (commissionSettings.commission_mode === 'PER_ORDER') {
            estimatedCommission += commissionValue;
          } else {
            estimatedCommission += commissionBase * (commissionValue / 100);
          }
        });
      }

      const totalCommission = estimatedCommission + finalCommission;
      const commissionRate = commissionSettings ? Number(commissionSettings.base_value) || 0 : 5;

      // Calculate tier progress
      let currentTier: number | null = null;
      let nextTierAt: number | null = null;
      let ordersToNextTier: number | null = null;
      let currentTierValue: number | null = null;
      let nextTierValue: number | null = null;

      if (commissionSettings?.is_tiered && tiers.length > 0) {
        const currentOrderCount = mtdDeliveredCount;
        
        // Find current tier
        const currentTierData = tiers.find((t: any) => 
          currentOrderCount >= t.min_orders && 
          (t.max_orders === null || currentOrderCount <= t.max_orders)
        );
        
        if (currentTierData) {
          currentTier = currentTierData.tier_order;
          currentTierValue = Number(currentTierData.tier_value);
          
          // Find next tier
          const nextTierData = tiers.find((t: any) => t.tier_order === currentTierData.tier_order + 1);
          if (nextTierData) {
            nextTierAt = nextTierData.min_orders;
            nextTierValue = Number(nextTierData.tier_value);
            ordersToNextTier = Math.max(nextTierData.min_orders - currentOrderCount, 0);
          }
        } else if (tiers.length > 0 && currentOrderCount < tiers[0].min_orders) {
          // Before first tier
          nextTierAt = tiers[0].min_orders;
          nextTierValue = Number(tiers[0].tier_value);
          ordersToNextTier = tiers[0].min_orders - currentOrderCount;
        }
      }

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
        targetType,
        targetProgress,
        remainingToTarget,
        estimatedCommission,
        finalCommission,
        totalCommission,
        commissionMode: commissionSettings?.commission_mode as 'PER_ORDER' | 'PERCENTAGE' | null,
        commissionRate,
        currentTier,
        nextTierAt,
        ordersToNextTier,
        currentTierValue,
        nextTierValue,
        isTiered: commissionSettings?.is_tiered ?? false,
        failedOrdersCount: failedOrdersRes.count || 0,
        pendingDeliveryCount: pendingDeliveryRes.count || 0,
        pendingClaimCount: pendingClaimRes.count || 0,
        actionRequiredCount: actionRequiredRes.count || 0,
        stockItems,
        ranking,
      } as SalespersonPerformanceStats;
    },
    enabled: !!user,
    refetchInterval: 120000, // Refresh every 2 minutes (120s)
  });
}
