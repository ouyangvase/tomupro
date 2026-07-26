import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getTodayDateKey } from '@/lib/driverOrderScope';

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

type ReturnProduct = {
  sku_name?: string | null;
  sku_code?: string | null;
};

type CompletedPickupRow = {
  pickup_date?: string | null;
  items?: Array<{
    product_id?: string | null;
    qty?: number | null;
    product?: ReturnProduct | ReturnProduct[] | null;
  }> | null;
};

type SubmittedReturnRow = {
  items?: Array<{ product_id?: string | null; qty?: number | null }> | null;
};

type AcceptedDeliveryRow = {
  order_items?: Array<{ product_id?: string | null; qty?: number | null }> | null;
};

/**
 * Hook to get returnable items for a driver.
 * Formula: Available = completed pickup - driver delivered accepted by runner - already returned.
 * No pickup means no return requirement.
 */
export function useDriverReturnRequired(driverId?: string) {
  const { user } = useAuth();
  const targetDriverId = driverId || user?.id;

  return useQuery({
    queryKey: ['driver-return-required', targetDriverId],
    queryFn: async (): Promise<ReturnRequiredResult> => {
      if (!targetDriverId) throw new Error('Not authenticated');
      const today = getTodayDateKey();

      const { data: pickupRows, error: pickupError } = await supabase
        .from('driver_pickups')
        .select(`
          id,
          pickup_date,
          status,
          items:driver_pickup_items(
            product_id,
            qty,
            product:products(sku_name, sku_code)
          )
        `)
        .eq('driver_id', targetDriverId)
        .eq('status', 'COMPLETED')
        .lt('pickup_date', today);

      if (pickupError) throw pickupError;

      const pickedByProduct = new Map<string, ReturnableItem>();
      let earliestPickupDate: string | null = null;

      for (const pickup of (pickupRows || []) as CompletedPickupRow[]) {
        const pickupDate = String(pickup.pickup_date || '');
        if (pickupDate && (!earliestPickupDate || pickupDate < earliestPickupDate)) {
          earliestPickupDate = pickupDate;
        }

        for (const item of pickup.items || []) {
          if (!item.product_id) continue;
          const qty = Number(item.qty || 0);
          if (qty <= 0) continue;
          const product = Array.isArray(item.product) ? item.product[0] : item.product;
          const existing = pickedByProduct.get(item.product_id);
          if (existing) {
            existing.pickup_qty += qty;
            existing.available_qty += qty;
            existing.suggested_return_qty += qty;
          } else {
            pickedByProduct.set(item.product_id, {
              product_id: item.product_id,
              sku_code: product?.sku_code || null,
              sku_name: product?.sku_name || 'Unknown',
              pickup_qty: qty,
              delivered_qty: 0,
              returned_qty: 0,
              available_qty: qty,
              needed_tomorrow_qty: 0,
              suggested_return_qty: qty,
              must_return: true,
            });
          }
        }
      }

      if (pickedByProduct.size === 0) {
        return {
          isReturnRequired: false,
          items: [],
          mustReturnItems: [],
          keepForTomorrowItems: [],
          totalMustReturn: 0,
          totalAvailable: 0,
        };
      }

      const { data: returnRows, error: returnsError } = await supabase
        .from('driver_returns')
        .select(`
          id,
          status,
          items:driver_return_items(product_id, qty)
        `)
        .eq('driver_id', targetDriverId)
        .neq('status', 'CANCELLED');

      if (returnsError) throw returnsError;

      for (const row of (returnRows || []) as SubmittedReturnRow[]) {
        for (const item of row.items || []) {
          const current = pickedByProduct.get(item.product_id);
          if (!current) continue;
          const qty = Number(item.qty || 0);
          current.returned_qty += qty;
          current.available_qty = Math.max(current.available_qty - qty, 0);
          current.suggested_return_qty = current.available_qty;
        }
      }

      const deliveredQuery = supabase
        .from('orders')
        .select(`
          id,
          driver_status,
          runner_accept_status,
          driver_delivered_at,
          delivered_at,
          order_items(product_id, qty)
        `)
        .eq('driver_id', targetDriverId)
        .eq('driver_status', 'DRIVER_DELIVERED')
        .eq('runner_accept_status', 'ACCEPTED');

      const { data: deliveredRows, error: deliveredError } = earliestPickupDate
        ? await deliveredQuery.or(`driver_delivered_at.gte.${earliestPickupDate},delivered_at.gte.${earliestPickupDate}`)
        : await deliveredQuery;

      if (deliveredError) throw deliveredError;

      for (const order of (deliveredRows || []) as AcceptedDeliveryRow[]) {
        for (const item of order.order_items || []) {
          const current = pickedByProduct.get(item.product_id);
          if (!current) continue;
          const qty = Number(item.qty || 0);
          current.delivered_qty += qty;
          current.available_qty = Math.max(current.available_qty - qty, 0);
          current.suggested_return_qty = current.available_qty;
        }
      }

      const items = Array.from(pickedByProduct.values())
        .map(item => ({
          ...item,
          available_qty: Math.max(item.available_qty, 0),
          suggested_return_qty: Math.max(item.available_qty, 0),
          must_return: item.available_qty > 0,
        }))
        .filter(item => item.available_qty > 0)
        .sort((a, b) => a.sku_name.localeCompare(b.sku_name));

      const mustReturnItems = items.filter(i => i.must_return);
      const keepForTomorrowItems: ReturnableItem[] = [];

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
    enabled: !!targetDriverId,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
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
