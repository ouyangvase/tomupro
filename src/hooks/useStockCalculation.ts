import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { StockAllocation, StockCalculationResult } from '@/types/stock-allocation';

/**
 * Mutation: calculate stock for a list of order IDs using FIFO allocation.
 * Calls the `calculate_stock_for_orders` RPC function.
 */
export function useCalculateStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderIds: string[]) => {
      if (orderIds.length === 0) throw new Error('No orders to calculate');

      const { data, error } = await supabase.rpc('calculate_stock_for_orders', {
        p_order_ids: orderIds,
      });

      if (error) throw new Error(error.message);

      const result = data as unknown as StockCalculationResult;
      if (!result?.success) {
        throw new Error('Stock calculation failed');
      }

      return result;
    },
    onSuccess: (result) => {
      // Invalidate order queries so badges update
      queryClient.invalidateQueries({ queryKey: ['orders-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['orders-all-ids'] });
      queryClient.invalidateQueries({ queryKey: ['stock-allocations'] });

      const ready = result.results.filter(r => r.stock_status === 'STOCK_READY').length;
      const partial = result.results.filter(r => r.stock_status === 'PARTIAL_STOCK').length;
      const out = result.results.filter(r => r.stock_status === 'OUT_OF_STOCK').length;

      const parts: string[] = [];
      if (ready > 0) parts.push(`${ready} ready`);
      if (partial > 0) parts.push(`${partial} partial`);
      if (out > 0) parts.push(`${out} out of stock`);

      toast.success(`Stock calculated for ${result.count} order(s): ${parts.join(', ')}`);
    },
    onError: (error: Error) => {
      toast.error(`Stock calculation failed: ${error.message}`);
    },
  });
}

/**
 * Query: fetch stock allocations for a single order (for drilldown dialog).
 */
export function useOrderStockAllocations(orderId?: string) {
  return useQuery({
    queryKey: ['stock-allocations', orderId],
    queryFn: async () => {
      if (!orderId) return [];

      const { data, error } = await supabase
        .from('stock_allocations')
        .select(`
          *,
          product:products(id, sku_code, sku_name)
        `)
        .eq('order_id', orderId)
        .order('created_at');

      if (error) throw error;
      return data as unknown as StockAllocation[];
    },
    enabled: !!orderId,
  });
}
