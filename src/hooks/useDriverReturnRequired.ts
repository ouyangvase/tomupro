import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfDay, addDays } from 'date-fns';

export interface ReturnableItem {
  product_id: string;
  sku_code: string | null;
  sku_name: string;
  pickup_qty: number;
  delivered_qty: number;
  returned_qty: number;
  available_qty: number;
  needed_tomorrow_qty: number;
  suggested_return_qty: number;
  must_return: boolean; // true if not needed tomorrow
}

export interface ReturnRequiredResult {
  isReturnRequired: boolean;
  items: ReturnableItem[];
  mustReturnItems: ReturnableItem[];
  keepForTomorrowItems: ReturnableItem[];
  totalMustReturn: number;
  totalAvailable: number;
}

/**
 * Hook to get returnable items for a driver
 * Uses the database function get_driver_returnable_items() for accurate calculation
 * Formula: Available = Pickup - Delivered (runner accepted) - Already Returned
 * Failed deliveries do NOT reduce available qty - driver still has those items!
 */
export function useDriverReturnRequired(driverId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['driver-return-required', driverId],
    queryFn: async (): Promise<ReturnRequiredResult> => {
      if (!user) throw new Error('Not authenticated');

      const targetDriverId = driverId || user.id;
      const tomorrow = startOfDay(addDays(new Date(), 1));
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      // Get returnable items from database function (now includes breakdown)
      const { data: returnableData, error: returnableError } = await supabase
        .rpc('get_driver_returnable_items');

      if (returnableError) throw returnableError;

      // Get orders needed for tomorrow to categorize items
      const { data: tomorrowOrders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          next_delivery_date,
          expected_pickup_date,
          order_date,
          driver_status,
          runner_status,
          runner_accept_status,
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

        // Skip already delivered orders
        if (order.runner_status === 'DELIVERED' || order.runner_accept_status === 'ACCEPTED') {
          continue;
        }

        // Sum up items needed for tomorrow
        for (const item of order.order_items || []) {
          if (!item.product_id) continue;
          const current = neededTomorrow.get(item.product_id) || 0;
          neededTomorrow.set(item.product_id, current + item.qty);
        }
      }

      // Build categorized items with full breakdown
      const items: ReturnableItem[] = [];
      
      for (const item of returnableData || []) {
        if (!item.product_id || item.available_qty <= 0) continue;

        const neededQty = neededTomorrow.get(item.product_id) || 0;
        const mustReturnQty = Math.max(Number(item.available_qty) - neededQty, 0);
        
        items.push({
          product_id: item.product_id,
          sku_code: item.sku_code,
          sku_name: item.sku_name || 'Unknown',
          pickup_qty: Number(item.pickup_qty),
          delivered_qty: Number(item.delivered_qty),
          returned_qty: Number(item.returned_qty),
          available_qty: Number(item.available_qty),
          needed_tomorrow_qty: neededQty,
          suggested_return_qty: mustReturnQty,
          must_return: mustReturnQty > 0,
        });
      }

      // Categorize items
      const mustReturnItems = items.filter(i => i.must_return);
      const keepForTomorrowItems = items.filter(i => !i.must_return && i.needed_tomorrow_qty > 0);

      const totalMustReturn = mustReturnItems.reduce((sum, i) => sum + i.suggested_return_qty, 0);
      const totalAvailable = items.reduce((sum, i) => sum + i.available_qty, 0);

      return {
        isReturnRequired: totalMustReturn > 0,
        items,
        mustReturnItems,
        keepForTomorrowItems,
        totalMustReturn,
        totalAvailable,
      };
    },
    enabled: true,
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
    mustReturnItems: returnRequired?.mustReturnItems || [],
    keepForTomorrowItems: returnRequired?.keepForTomorrowItems || [],
    totalMustReturn: returnRequired?.totalMustReturn || 0,
    totalAvailable: returnRequired?.totalAvailable || 0,
    isLoading,
  };
}
