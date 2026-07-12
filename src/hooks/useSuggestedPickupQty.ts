import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

export interface SuggestedQuantity {
  product_id: string;
  sku_name: string;
  sku_code: string | null;
  required_qty: number;
}

/**
 * Calculate suggested pickup quantities for a driver based on today's assigned orders
 * 
 * Scope:
 * - orders.driver_id = selected driver
 * - orders.runner_id = current runner
 * - orders.runner_status NOT IN (DELIVERED, CANCELLED - mapped to status = READY)
 * - orders.driver_status IN (ASSIGNED, OUT_FOR_DELIVERY)
 * - delivery date = today (or overdue from previous days)
 */
export function useSuggestedPickupQty(driverId: string | undefined, pickupDate: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['suggested-pickup-qty', driverId, pickupDate],
    queryFn: async () => {
      if (!driverId) return [];
      if (!user) throw new Error('Not authenticated');

      // Fetch orders assigned to this driver for today or overdue
      // Only include orders that are READY (not cancelled/booking) with pending delivery
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          order_items(
            product_id,
            qty,
            product:products(sku_name, sku_code)
          )
        `)
        .eq('driver_id', driverId)
        .eq('runner_id', user.id)
        .eq('status', 'READY')
        .in('driver_status', ['ASSIGNED', 'OUT_FOR_DELIVERY'])
        .not('runner_status', 'in', '("DELIVERED")') // Exclude delivered orders
        .lte('order_date', pickupDate); // Include today and overdue orders

      if (ordersError) throw ordersError;
      if (!orders || orders.length === 0) return [];

      // Aggregate quantities by product
      const productQtyMap = new Map<string, SuggestedQuantity>();

      for (const order of orders) {
        if (!order.order_items) continue;
        
        for (const item of order.order_items) {
          if (!item.product_id) continue;
          
          const existing = productQtyMap.get(item.product_id);
          if (existing) {
            existing.required_qty += item.qty;
          } else {
            productQtyMap.set(item.product_id, {
              product_id: item.product_id,
              sku_name: item.product?.sku_name || 'Unknown',
              sku_code: item.product?.sku_code || null,
              required_qty: item.qty,
            });
          }
        }
      }

      return Array.from(productQtyMap.values());
    },
    enabled: !!driverId,
  });
}
