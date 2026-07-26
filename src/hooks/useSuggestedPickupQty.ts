import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  buildPickupNeedItems,
  type ActiveDriverDeliveryOrder,
} from '@/hooks/useDriverPickups';
import { fetchDriverAssignments } from '@/hooks/useDriverAssignments';

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

      const orders = await fetchDriverAssignments({
        runnerId: runnerScopeId,
        driverId,
        dateTo: pickupDate,
        activeOnly: true,
        includeItems: true,
      });
      if (!orders || orders.length === 0) {
        return { items: [], orderIds: [], orderCodes: [] } satisfies SuggestedPickup;
      }

      return {
        items: buildPickupNeedItems(orders as ActiveDriverDeliveryOrder[]) as SuggestedQuantity[],
        orderIds: orders.map((order) => order.id).filter(Boolean),
        orderCodes: orders.map((order) => order.order_code || '-').filter(Boolean),
      } satisfies SuggestedPickup;
    },
    enabled: !!driverId && !!pickupDate && !!runnerScopeId,
  });
}
