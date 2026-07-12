import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { StockStatus, StockCalculationResult } from '@/types/stock-allocation';
import type { Order, StockBalance } from '@/types/database';

export interface ClientStockAllocation {
  order_id: string;
  order_item_id: string;
  product_id: string;
  sku_code: string | null;
  sku_name: string;
  qty_required: number;
  qty_allocated: number;
  qty_shortage: number;
}

export interface OrderStockResult {
  order_id: string;
  stock_status: StockStatus;
  allocations: ClientStockAllocation[];
}

/**
 * Client-side FIFO stock calculation.
 * Fetches stock balance from stock_balance_view (same source as inventory page),
 * then allocates stock to orders oldest-first.
 *
 * Returns a map of order_id → OrderStockResult stored in the mutation result.
 * No database writes — purely client-side computation.
 */
export function useCalculateStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orders: Order[]): Promise<Map<string, OrderStockResult>> => {
      if (orders.length === 0) throw new Error('No orders to calculate');

      // 1. Fetch current stock balance from the same view the inventory page uses
      const { data: stockData, error: stockError } = await supabase
        .from('stock_balance_view')
        .select('*');
      if (stockError) throw new Error(`Failed to fetch stock balance: ${stockError.message}`);
      const stockBalance = (stockData || []) as StockBalance[];

      // 2. Build a running balance map: "owner:product" → available qty
      //    Stock balance view has: warehouse_id, owner_user_id, product_id, balance_qty
      //    We match by owner_user_id (= salesperson_id) + product_id
      //    If order has fulfillment_warehouse_id, also match warehouse
      const balanceMap = new Map<string, number>();
      for (const sb of stockBalance) {
        // Key with warehouse for warehouse-specific matching
        const warehouseKey = `${sb.owner_user_id}:${sb.product_id}:${sb.warehouse_id}`;
        balanceMap.set(warehouseKey, (balanceMap.get(warehouseKey) || 0) + sb.balance_qty);

        // Also aggregate by owner+product (without warehouse) for orders without fulfillment_warehouse_id
        const ownerKey = `${sb.owner_user_id}:${sb.product_id}:ANY`;
        balanceMap.set(ownerKey, (balanceMap.get(ownerKey) || 0) + sb.balance_qty);
      }

      // 3. Create a working copy for FIFO consumption
      const runningBalance = new Map(balanceMap);

      // 4. Sort orders by created_at ASC (FIFO — oldest first)
      const sortedOrders = [...orders].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      // 5. Allocate stock per order
      const results = new Map<string, OrderStockResult>();

      for (const order of sortedOrders) {
        const allocations: ClientStockAllocation[] = [];
        let allFulfilled = true;
        let anyAllocated = false;

        const items = order.order_items || [];

        // Skip orders with no items — mark as STOCK_READY
        if (items.length === 0 || items.every(item => !item.product_id)) {
          results.set(order.id, {
            order_id: order.id,
            stock_status: 'STOCK_READY',
            allocations: [],
          });
          continue;
        }

        for (const item of items) {
          if (!item.product_id) continue;

          // Determine the balance key
          // Try warehouse-specific first, then fall back to owner-level
          let balanceKey: string;
          let available: number;

          if (order.fulfillment_warehouse_id) {
            balanceKey = `${order.salesperson_id}:${item.product_id}:${order.fulfillment_warehouse_id}`;
            available = runningBalance.get(balanceKey) ?? 0;
          } else {
            balanceKey = `${order.salesperson_id}:${item.product_id}:ANY`;
            available = runningBalance.get(balanceKey) ?? 0;
          }

          const required = item.qty;
          const allocated = Math.min(required, Math.max(available, 0));
          const shortage = required - allocated;

          allocations.push({
            order_id: order.id,
            order_item_id: item.id,
            product_id: item.product_id,
            sku_code: item.product?.sku_code ?? item.sku_label ?? null,
            sku_name: item.product?.sku_name ?? item.sku_label ?? 'Unknown Product',
            qty_required: required,
            qty_allocated: allocated,
            qty_shortage: shortage,
          });

          // Consume from running balance
          runningBalance.set(balanceKey, available - allocated);

          if (allocated < required) allFulfilled = false;
          if (allocated > 0) anyAllocated = true;
        }

        // Determine stock status
        let stockStatus: StockStatus;
        if (allFulfilled) {
          stockStatus = 'STOCK_READY';
        } else if (anyAllocated) {
          stockStatus = 'PARTIAL_STOCK';
        } else {
          stockStatus = 'OUT_OF_STOCK';
        }

        results.set(order.id, {
          order_id: order.id,
          stock_status: stockStatus,
          allocations,
        });
      }

      return results;
    },
    onSuccess: (results) => {
      const resultArray = Array.from(results.values());
      const ready = resultArray.filter(r => r.stock_status === 'STOCK_READY').length;
      const partial = resultArray.filter(r => r.stock_status === 'PARTIAL_STOCK').length;
      const out = resultArray.filter(r => r.stock_status === 'OUT_OF_STOCK').length;

      const parts: string[] = [];
      if (ready > 0) parts.push(`${ready} ready`);
      if (partial > 0) parts.push(`${partial} partial`);
      if (out > 0) parts.push(`${out} out of stock`);

      toast.success(`Stock calculated for ${resultArray.length} order(s): ${parts.join(', ')}`);
    },
    onError: (error: Error) => {
      toast.error(`Stock calculation failed: ${error.message}`);
    },
  });
}
