import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchRunnerDriverPickupSourceOrders,
  fetchRunnerDriverPickupShortages,
} from '@/hooks/useDriverPickups';

export interface SuggestedQuantity {
  product_id: string;
  sku_name: string;
  sku_code: string | null;
  required_qty: number;
}

export interface SuggestedPickup {
  items: SuggestedQuantity[];
  orderIds: string[];
  orderCodes: string[];
}

/**
 * Calculate suggested pickup quantities for a driver based on active orders visible in the driver app.
 * 
 * Scope:
 * - orders.driver_id = selected driver
 * - orders.runner_id = current runner
 * - orders.driver_status IN (ASSIGNED, OUT_FOR_DELIVERY)
 * - includes every active assignment visible in the driver inbox, regardless of delivery date
 * - excludes delivered, cancelled, missing, returned, accepted and completed orders
 */
export function useSuggestedPickupQty(driverId: string | undefined, pickupDate: string, runnerIdOverride?: string) {
  const { user } = useAuth();
  const runnerScopeId = runnerIdOverride || user?.id;

  return useQuery({
    queryKey: ['suggested-pickup-qty', driverId, pickupDate, runnerScopeId],
    queryFn: async () => {
      if (!driverId) return { items: [], orderIds: [], orderCodes: [] } satisfies SuggestedPickup;
      if (!runnerScopeId) throw new Error('Not authenticated');

      const [shortageRows, sourceOrders] = await Promise.all([
        fetchRunnerDriverPickupShortages(runnerScopeId, driverId),
        fetchRunnerDriverPickupSourceOrders(runnerScopeId, driverId),
      ]);
      if (shortageRows.length === 0 && sourceOrders.length === 0) {
        return { items: [], orderIds: [], orderCodes: [] } satisfies SuggestedPickup;
      }

      return {
        items: (shortageRows || []).map((item) => ({
          product_id: item.product_id,
          sku_name: item.sku_name,
          sku_code: item.sku_code,
          required_qty: Number(item.required_qty || 0),
        })),
        orderIds: (sourceOrders || []).map((order) => order.order_id),
        orderCodes: (sourceOrders || []).map((order) => order.order_code || '-'),
      } satisfies SuggestedPickup;
    },
    enabled: !!driverId && !!pickupDate && !!runnerScopeId,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
}
