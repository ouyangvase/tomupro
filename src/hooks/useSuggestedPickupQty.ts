import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  ACTIVE_DRIVER_PICKUP_STATUSES,
  buildPickupNeedItems,
  isActiveDriverPickupOrder,
  type ActiveDriverDeliveryOrder,
} from '@/hooks/useDriverPickups';

export interface SuggestedQuantity {
  product_id: string;
  sku_name: string;
  sku_code: string | null;
  required_qty: number;
}

/**
 * Calculate suggested pickup quantities for a driver based on active orders visible in the driver app.
 * 
 * Scope:
 * - orders.driver_id = selected driver
 * - orders.runner_id = current runner
 * - orders.driver_status IN (ASSIGNED, OUT_FOR_DELIVERY)
 * - excludes delivered, cancelled, missing, returned, accepted and completed orders
 */
export function useSuggestedPickupQty(driverId: string | undefined, pickupDate: string, runnerIdOverride?: string) {
  const { user } = useAuth();
  const runnerScopeId = runnerIdOverride || user?.id;

  return useQuery({
    queryKey: ['suggested-pickup-qty', driverId, pickupDate, runnerScopeId],
    queryFn: async () => {
      if (!driverId) return [];
      if (!runnerScopeId) throw new Error('Not authenticated');

      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          order_code,
          customer_name,
          driver_id,
          runner_id,
          status,
          driver_status,
          runner_status,
          runner_accept_status,
          order_date,
          expected_pickup_date,
          next_delivery_date,
          runner_assigned_at,
          created_at,
          order_items(
            product_id,
            qty,
            sku_label,
            product:products(sku_name, sku_code)
          )
        `)
        .eq('driver_id', driverId)
        .eq('runner_id', runnerScopeId)
        .in('driver_status', [...ACTIVE_DRIVER_PICKUP_STATUSES]);

      if (ordersError) throw ordersError;
      if (!orders || orders.length === 0) return [];

      const activeOrders = ((orders || []) as ActiveDriverDeliveryOrder[]).filter(isActiveDriverPickupOrder);
      return buildPickupNeedItems(activeOrders) as SuggestedQuantity[];
    },
    enabled: !!driverId && !!pickupDate && !!runnerScopeId,
  });
}
