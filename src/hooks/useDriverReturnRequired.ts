import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, addDays } from 'date-fns';

export interface ReturnRequiredItem {
  product_id: string;
  sku_code: string | null;
  sku_name: string;
  allocated_qty: number;
  needed_tomorrow_qty: number;
  suggested_return_qty: number;
}

export interface ReturnRequiredResult {
  isReturnRequired: boolean;
  items: ReturnRequiredItem[];
  totalSuggestedReturn: number;
}

/**
 * Hook to check if a driver has outstanding return required
 * Returns items that should be returned (allocated but not needed for tomorrow)
 */
export function useDriverReturnRequired(driverId?: string) {
  return useQuery({
    queryKey: ['driver-return-required', driverId],
    queryFn: async (): Promise<ReturnRequiredResult> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const targetDriverId = driverId || user.id;
      const tomorrow = startOfDay(addDays(new Date(), 1));
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      // Get allocated stock for this driver (pending qty = undelivered)
      const { data: allocatedStock, error: stockError } = await supabase
        .from('driver_allocated_stock')
        .select('*')
        .eq('driver_id', targetDriverId);

      if (stockError) throw stockError;

      // Get orders needed for tomorrow (not delivered, not cancelled)
      const { data: tomorrowOrders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          next_delivery_date,
          expected_pickup_date,
          order_date,
          driver_status,
          runner_status,
          order_items(product_id, qty)
        `)
        .eq('driver_id', targetDriverId)
        .neq('status', 'CANCELLED')
        .not('runner_status', 'in', '("DELIVERED")');

      if (ordersError) throw ordersError;

      // Calculate needed for tomorrow per product
      const neededTomorrow = new Map<string, number>();
      
      for (const order of tomorrowOrders || []) {
        // Determine delivery date
        const deliveryDate = order.next_delivery_date || order.expected_pickup_date || order.order_date;
        if (!deliveryDate) continue;
        
        // Check if this order is for tomorrow
        const orderDeliveryDate = deliveryDate.split('T')[0];
        if (orderDeliveryDate !== tomorrowStr) continue;

        // Don't count DRIVER_DELIVERED that's already accepted
        if (order.driver_status === 'DRIVER_DELIVERED' && order.runner_status === 'DELIVERED') {
          continue;
        }

        // Sum up items needed for tomorrow
        for (const item of order.order_items || []) {
          if (!item.product_id) continue;
          const current = neededTomorrow.get(item.product_id) || 0;
          neededTomorrow.set(item.product_id, current + item.qty);
        }
      }

      // Build return required items
      const items: ReturnRequiredItem[] = [];
      
      for (const stock of allocatedStock || []) {
        if (!stock.product_id) continue;
        
        const allocatedQty = stock.pending_qty || 0;
        if (allocatedQty <= 0) continue;

        const neededQty = neededTomorrow.get(stock.product_id) || 0;
        const suggestedReturn = Math.max(allocatedQty - neededQty, 0);

        if (suggestedReturn > 0) {
          items.push({
            product_id: stock.product_id,
            sku_code: stock.sku_code,
            sku_name: stock.sku_name || 'Unknown',
            allocated_qty: allocatedQty,
            needed_tomorrow_qty: neededQty,
            suggested_return_qty: suggestedReturn,
          });
        }
      }

      const totalSuggestedReturn = items.reduce((sum, i) => sum + i.suggested_return_qty, 0);

      return {
        isReturnRequired: totalSuggestedReturn > 0,
        items,
        totalSuggestedReturn,
      };
    },
    enabled: !!driverId || true, // Always run for current user if no driverId
  });
}

/**
 * Hook to check if a driver can receive new pickups
 * (blocked if they have outstanding returns)
 */
export function useCanDriverReceivePickup(driverId: string | undefined) {
  const { data: returnRequired, isLoading } = useDriverReturnRequired(driverId);
  
  return {
    canReceivePickup: !returnRequired?.isReturnRequired,
    returnRequired: returnRequired?.isReturnRequired || false,
    returnItems: returnRequired?.items || [],
    totalToReturn: returnRequired?.totalSuggestedReturn || 0,
    isLoading,
  };
}
