import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { invalidateOrderQueries } from '@/lib/invalidateOrderQueries';
import { useAuth } from '@/contexts/AuthContext';
import { getVisibleOwnerIdsCached } from '@/lib/visibleOwnerIdsCache';

/**
 * Fetches the visible owner IDs for the current user via shared cache.
 * Admin returns null (sees everything), other roles return their allowed salesperson IDs.
 */
export function useVisibleOwnerIds() {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ['visible-owner-ids', user?.id, role],
    queryFn: async () => {
      if (role === 'admin') return null; // admin sees everything
      return getVisibleOwnerIdsCached();
    },
    enabled: !!user?.id,
    staleTime: 60000,
    gcTime: 5 * 60 * 1000,
  });
}

export interface DeliveredOrder {
  id: string;
  order_code: string;
  order_date: string;
  customer_name: string;
  phone: string;
  area: string | null;
  address: string;
  total_amount: number;
  total_qty: number;
  payment_method: string;
  status: string;
  runner_status: string;
  reconciliation_status: string;
  delivered_at: string | null;
  salesperson_id: string;
  salesperson_name: string | null;
  runner_id: string | null;
  runner_name: string | null;
  driver_id: string | null;
  driver_name: string | null;
  items_summary: string;
  items_json: Array<{
    id: string;
    product_id: string | null;
    sku_code: string | null;
    sku_name: string | null;
    sku_label: string | null;
    qty: number;
    price: number;
    line_total: number;
  }>;
}

export interface DeliveredSummary {
  total_delivered: number;
  pending_claim: number;
  total_amount: number;
}

interface UseDeliveredOrdersParams {
  runnerId?: string;
  runnerIds?: string[];
  salespersonId?: string;
  salespersonIds?: string[];
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

type DeliveredOrdersRpcClient = {
  rpc: (
    name: 'get_delivered_orders_fast' | 'get_runner_assistant_delivered_orders',
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown[] | null; error: Error | null }>;
};

const deliveredOrdersRpcClient = supabase as unknown as DeliveredOrdersRpcClient;

/**
 * Optimized hook for fetching delivered orders using a single RPC call
 * Eliminates N+1 queries by returning denormalized data
 */
export function useDeliveredOrdersFast(params: UseDeliveredOrdersParams = {}) {
  const { runnerId, salespersonId, salespersonIds, limit = 100, offset = 0, enabled = true } = params;

  return useQuery({
    queryKey: ['delivered-orders-fast', runnerId, salespersonId, salespersonIds, limit, offset],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_delivered_orders_fast', {
        p_runner_id: runnerId || null,
        p_salesperson_id: salespersonId || null,
        p_salesperson_ids: salespersonIds || null,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) throw error;
      return (data || []) as DeliveredOrder[];
    },
    enabled,
    staleTime: 3 * 60 * 1000, // 3 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Batch-loading hook that fetches ALL delivered orders by paginating through
 * the RPC in 1000-row chunks. Works around Supabase PostgREST max_rows=1000 limit.
 * Use this when you need the complete dataset for client-side filtering.
 */
export function useDeliveredOrdersFastAll(params: Omit<UseDeliveredOrdersParams, 'limit' | 'offset'> & { totalHint?: number } = {}) {
  const { runnerId, runnerIds, salespersonId, salespersonIds, enabled = true, totalHint } = params;
  const BATCH_SIZE = 1000;
  const isAssistantScope = runnerIds !== undefined;
  const effectiveRunnerIds = runnerIds?.length ? runnerIds : runnerId ? [runnerId] : [];

  return useQuery({
    queryKey: ['delivered-orders-fast-all', effectiveRunnerIds, salespersonId, salespersonIds],
    queryFn: async () => {
      const scopes = effectiveRunnerIds.length > 0 ? effectiveRunnerIds : [null];
      const scopedRows = await Promise.all(scopes.map(async (scopeRunnerId) => {
        let allRows: DeliveredOrder[] = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await deliveredOrdersRpcClient.rpc(
            isAssistantScope ? 'get_runner_assistant_delivered_orders' : 'get_delivered_orders_fast',
            {
            p_runner_id: scopeRunnerId,
            p_salesperson_id: salespersonId || null,
            p_salesperson_ids: salespersonIds || null,
            p_limit: BATCH_SIZE,
            p_offset: offset,
            },
          );

          if (error) throw error;
          const batch = (data || []) as DeliveredOrder[];
          allRows = allRows.concat(batch);
          offset += batch.length;
          hasMore = batch.length >= BATCH_SIZE;
        }
        return allRows;
      }));

      const distinctRows = new Map(scopedRows.flat().map((order) => [order.id, order]));
      return Array.from(distinctRows.values()).sort((a, b) => {
        const left = a.delivered_at || a.order_date || '';
        const right = b.delivered_at || b.order_date || '';
        return right.localeCompare(left);
      });
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes (large dataset, avoid frequent refetches)
    gcTime: 15 * 60 * 1000, // 15 minutes (keep in cache longer to avoid re-fetching)
  });
}

/**
 * Optimized hook for fetching delivered orders summary stats
 * Single query for all counters instead of multiple queries
 */
export function useDeliveredSummary(params: Omit<UseDeliveredOrdersParams, 'limit' | 'offset'> = {}) {
  const { runnerId, salespersonId, salespersonIds, enabled = true } = params;

  return useQuery({
    queryKey: ['delivered-summary', runnerId, salespersonId, salespersonIds],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_delivered_summary', {
        p_runner_id: runnerId || null,
        p_salesperson_id: salespersonId || null,
        p_salesperson_ids: salespersonIds || null,
      });

      if (error) throw error;
      
      // RPC returns an array, we need the first row
      const summary = data?.[0] || { total_delivered: 0, pending_claim: 0, total_amount: 0 };
      return summary as DeliveredSummary;
    },
    enabled,
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Server-side summary with ALL filter params (search, area, claim, driver, SKU)
 * Eliminates mismatch between KPI cards and table data
 */
interface DeliveredSummaryFilteredParams {
  runnerId?: string;
  salespersonId?: string;
  salespersonIds?: string[];
  search?: string;
  area?: string;
  claimStatus?: string;
  driverId?: string;
  skuCode?: string;
  enabled?: boolean;
}

export function useDeliveredSummaryFiltered(params: DeliveredSummaryFilteredParams = {}) {
  const { runnerId, salespersonId, salespersonIds, search, area, claimStatus, driverId, skuCode, enabled = true } = params;

  return useQuery({
    queryKey: ['delivered-summary-filtered', runnerId, salespersonId, salespersonIds, search, area, claimStatus, driverId, skuCode],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_delivered_summary_filtered', {
        p_runner_id: runnerId || null,
        p_salesperson_id: salespersonId || null,
        p_salesperson_ids: salespersonIds || null,
        p_search: search || null,
        p_area: area || null,
        p_claim_status: claimStatus || null,
        p_driver_id: driverId || null,
        p_sku_code: skuCode || null,
      });

      if (error) throw error;
      
      const summary = data?.[0] || { total_delivered: 0, pending_claim: 0, total_amount: 0 };
      return summary as DeliveredSummary;
    },
    enabled,
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Optimistic mutation for marking an order as delivered
 * Updates UI immediately, queues background processing
 */
export function useMarkDeliveredFast() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (orderId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('mark_order_delivered_fast', {
        p_order_id: orderId,
        p_actor_id: user.id,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; already_delivered?: boolean };
      if (!result.success) {
        // Don't throw for "already delivered" - treat as success
        if (result.error?.toLowerCase().includes('already delivered')) {
          return { orderId, success: true, already_delivered: true };
        }
        throw new Error(result.error || 'Failed to mark as delivered');
      }
      
      return { orderId, ...result };
    },
    // Optimistic update - immediately update UI before server confirms
    onMutate: async (orderId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['orders'] });
      await queryClient.cancelQueries({ queryKey: ['delivered-orders-fast'] });
      
      // Snapshot current data
      const previousOrders = queryClient.getQueryData(['orders']);
      
      // Optimistically update orders cache
      queryClient.setQueriesData({ queryKey: ['orders'] }, (old: any) => {
        if (!old) return old;
        return old.map((order: any) =>
          order.id === orderId
            ? { ...order, runner_status: 'DELIVERED', delivered_at: new Date().toISOString() }
            : order
        );
      });

      return { previousOrders };
    },
    onError: (err, orderId, context) => {
      // Rollback on error
      if (context?.previousOrders) {
        queryClient.setQueryData(['orders'], context.previousOrders);
      }
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.message || 'Failed to mark as delivered',
      });
    },
    onSuccess: (result) => {
      if (result.already_delivered) {
        toast({ title: 'Already delivered' });
      } else {
        toast({ title: 'Marked as delivered' });
      }

      supabase.functions.invoke('send-snipers-delivered', {
        body: { orderId: result.orderId, eventType: 'tomupro.order.delivered' },
      }).catch((err) => {
        console.error('[SNIPERS] delivered event trigger failed:', err);
      });
    },
    onSettled: () => {
      // Debounced refetch after 1.5s to pick up background processing results
      setTimeout(() => {
        invalidateOrderQueries(queryClient);
      }, 1500);
    },
  });
}

/**
 * Fallback hook that uses the edge function (process-delivery) for delivery
 * Used when fast RPC isn't available or for backward compatibility
 */
export function useMarkDeliveredEdge() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.functions.invoke('process-delivery', {
        body: { orderId },
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to process delivery');
      }
      
      return { orderId, ...data };
    },
    onMutate: async (orderId) => {
      await queryClient.cancelQueries({ queryKey: ['orders'] });
      
      const previousOrders = queryClient.getQueryData(['orders']);
      
      queryClient.setQueriesData({ queryKey: ['orders'] }, (old: any) => {
        if (!old) return old;
        return old.map((order: any) =>
          order.id === orderId
            ? { ...order, runner_status: 'DELIVERED', delivered_at: new Date().toISOString() }
            : order
        );
      });

      return { previousOrders };
    },
    onError: (err, orderId, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(['orders'], context.previousOrders);
      }
      toast({
        variant: 'destructive',
        title: 'Delivery failed',
        description: err.message,
      });
    },
    onSuccess: () => {
      toast({ title: 'Delivered successfully' });
    },
    onSettled: () => {
      invalidateOrderQueries(queryClient);
    },
  });
}
