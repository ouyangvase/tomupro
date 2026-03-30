import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { invalidateOrderQueries } from '@/lib/invalidateOrderQueries';
import type { ClaimBatch, ClaimBatchStatus, Profile } from '@/types/database';

interface ClaimBatchFilters {
  runnerId?: string;
  status?: ClaimBatchStatus;
}

export function useClaimBatches(filters?: ClaimBatchFilters) {
  return useQuery({
    queryKey: ['claim-batches', filters],
    queryFn: async () => {
      // Lightweight query: fetch batches + item IDs only (NO orders join)
      // The deep nested join (orders → order_items → products) causes RLS-induced timeouts
      let query = supabase
        .from('claim_batches')
        .select(`
          *,
          items:claim_batch_items(id, order_id)
        `)
        .order('submitted_at', { ascending: false });

      if (filters?.runnerId) {
        query = query.eq('runner_id', filters.runnerId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch runner profiles separately
      const runnerIds = [...new Set(data?.map(b => b.runner_id) || [])];
      let runnerMap: Record<string, Profile> = {};

      if (runnerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_directory')
          .select('*')
          .in('id', runnerIds);

        profiles?.forEach(p => {
          runnerMap[p.id] = p as unknown as Profile;
        });
      }

      return (data || []).map(batch => ({
        ...batch,
        runner: runnerMap[batch.runner_id],
      })) as unknown as ClaimBatch[];
    },
  });
}

/**
 * Fetch full order details for a specific claim batch (on demand, for details dialog/export)
 * Separated from the list query to avoid RLS-induced timeouts on the orders table
 */
export function useClaimBatchDetails(batchId: string | undefined) {
  return useQuery({
    queryKey: ['claim-batch-details', batchId],
    queryFn: async () => {
      if (!batchId) return null;

      // Fetch the batch items with order IDs
      const { data: items, error: itemsError } = await supabase
        .from('claim_batch_items')
        .select('id, order_id')
        .eq('batch_id', batchId);

      if (itemsError) throw itemsError;
      if (!items || items.length === 0) return [];

      const orderIds = items.map(i => i.order_id);

      // Fetch orders via RPC to bypass RLS timeout
      // Use get_delivered_orders_fast if available, else direct query with limited fields
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_code, order_date, customer_name, area, total_amount, payment_method, reconciliation_status, delivered_at, salesperson_id')
        .in('id', orderIds);

      if (ordersError) {
        console.warn('Failed to fetch orders for batch details:', ordersError);
        // Return items with minimal data on error
        return items.map(item => ({
          id: item.id,
          order_id: item.order_id,
          order: null,
        }));
      }

      const orderMap = new Map(orders?.map(o => [o.id, o]) || []);
      return items.map(item => ({
        id: item.id,
        order_id: item.order_id,
        order: orderMap.get(item.order_id) || null,
      }));
    },
    enabled: !!batchId,
    staleTime: 30000,
  });
}

export function useSubmitBulkClaim() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ orderIds, note, exchangeRate }: { orderIds: string[]; note?: string; exchangeRate: number }) => {
      const { data, error } = await supabase.functions.invoke('submit-bulk-claim', {
        body: { orderIds, note, exchangeRate },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      invalidateOrderQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['claim-batches'] });
      toast({
        title: 'Claim Submitted',
        description: `Claim batch submitted for ${data.orderCount} orders (BND ${data.netAmountBND?.toFixed(2)} → RM ${data.netAmountRM?.toFixed(2)})`
      });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

export function useApproveClaimBatch() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (batchId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get batch items first
      const { data: batch, error: fetchError } = await supabase
        .from('claim_batches')
        .select(`
          *,
          items:claim_batch_items(order_id)
        `)
        .eq('id', batchId)
        .single();

      if (fetchError) throw fetchError;

      // Update claim batch
      const { error: batchError } = await supabase
        .from('claim_batches')
        .update({
          status: 'CLAIMED',
          admin_ack_at: new Date().toISOString(),
          admin_ack_by: user.id,
        })
        .eq('id', batchId);

      if (batchError) throw batchError;

      // Update all orders in the batch to CLAIMED (approved)
      const orderIds = batch.items?.map((item: any) => item.order_id) || [];
      if (orderIds.length > 0) {
        const { error: ordersError } = await supabase
          .from('orders')
          .update({ reconciliation_status: 'CLAIMED' })
          .in('id', orderIds);

        if (ordersError) throw ordersError;
      }

      // Notify runner
      await supabase.from('notifications').insert({
        user_id: batch.runner_id,
        title: 'Claim Batch Approved',
        message: `Your claim batch of ${orderIds.length} orders has been approved.`,
        type: 'claim_batch',
        reference_type: 'claim_batch',
        reference_id: batchId,
      });

      // Log audit
      await supabase.from('audit_logs').insert({
        actor_id: user.id,
        action: 'CLAIM_BATCH_APPROVED',
        entity_type: 'claim_batch',
        entity_id: batchId,
        before_json: { status: 'ADMIN_ACK_PENDING' },
        after_json: { status: 'CLAIMED' },
      });

      return { batchId, orderCount: orderIds.length };
    },
    onSuccess: (data) => {
      invalidateOrderQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['claim-batches'] });
      toast({
        title: 'Batch Approved',
        description: `Claim batch with ${data.orderCount} orders has been approved.`
      });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

export function useRejectClaimBatch() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ batchId, rejectionReason }: { batchId: string; rejectionReason?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get batch items first
      const { data: batch, error: fetchError } = await supabase
        .from('claim_batches')
        .select(`
          *,
          items:claim_batch_items(order_id)
        `)
        .eq('id', batchId)
        .single();

      if (fetchError) throw fetchError;

      // Delete the claim batch (this will cascade to claim_batch_items)
      const { error: deleteError } = await supabase
        .from('claim_batches')
        .delete()
        .eq('id', batchId);

      if (deleteError) throw deleteError;

      // Revert all orders in the batch back to NOT_CLAIMED
      const orderIds = batch.items?.map((item: any) => item.order_id) || [];
      if (orderIds.length > 0) {
        const { error: ordersError } = await supabase
          .from('orders')
          .update({ reconciliation_status: 'NOT_CLAIMED' })
          .in('id', orderIds);

        if (ordersError) throw ordersError;

        // Delete the claims created for these orders
        await supabase
          .from('claims')
          .delete()
          .in('order_id', orderIds);
      }

      // Notify runner
      await supabase.from('notifications').insert({
        user_id: batch.runner_id,
        title: 'Claim Batch Rejected',
        message: `Your claim batch of ${orderIds.length} orders has been rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
        type: 'claim_batch',
        reference_type: 'claim_batch',
        reference_id: batchId,
      });

      // Log audit
      await supabase.from('audit_logs').insert({
        actor_id: user.id,
        action: 'CLAIM_BATCH_REJECTED',
        entity_type: 'claim_batch',
        entity_id: batchId,
        before_json: { status: 'ADMIN_ACK_PENDING' },
        after_json: { status: 'REJECTED', reason: rejectionReason },
      });

      return { batchId, orderCount: orderIds.length };
    },
    onSuccess: (data) => {
      invalidateOrderQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['claim-batches'] });
      toast({
        title: 'Batch Rejected',
        description: `Claim batch with ${data.orderCount} orders has been rejected. Orders reverted to NOT CLAIMED.`
      });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

// Keep backward compatibility
export function useAcknowledgeClaimBatch() {
  return useApproveClaimBatch();
}

/**
 * Remove a single order from a claim batch.
 * Deletes the batch item, deletes the claim, reverts the order to NOT_CLAIMED,
 * and recalculates batch totals.
 */
export function useRemoveOrderFromBatch() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ batchId, orderId }: { batchId: string; orderId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // 1. Delete the batch item
      const { error: deleteItemError } = await supabase
        .from('claim_batch_items')
        .delete()
        .eq('batch_id', batchId)
        .eq('order_id', orderId);

      if (deleteItemError) throw deleteItemError;

      // 2. Delete the claim for this order
      await supabase
        .from('claims')
        .delete()
        .eq('order_id', orderId);

      // 3. Revert order to NOT_CLAIMED
      const { error: orderError } = await supabase
        .from('orders')
        .update({ reconciliation_status: 'NOT_CLAIMED' })
        .eq('id', orderId);

      if (orderError) throw orderError;

      // 4. Recalculate batch totals from remaining items
      const { data: remainingItems } = await supabase
        .from('claim_batch_items')
        .select('order_id')
        .eq('batch_id', batchId);

      const remainingOrderIds = (remainingItems || []).map(i => i.order_id);

      if (remainingOrderIds.length === 0) {
        // Batch is now empty — delete it
        await supabase.from('claim_batches').delete().eq('id', batchId);
      } else {
        // Fetch remaining order amounts to recalculate
        const { data: remainingOrders } = await supabase
          .from('orders')
          .select('id, total_amount, area')
          .in('id', remainingOrderIds);

        // Fetch batch for exchange rate
        const { data: batch } = await supabase
          .from('claim_batches')
          .select('exchange_rate_to_rm, runner_id')
          .eq('id', batchId)
          .single();

        // Fetch delivery charges for the runner
        const { data: charges } = await supabase
          .from('delivery_charges')
          .select('area, charge_amount')
          .eq('runner_id', batch?.runner_id || '')
          .eq('status', 'APPROVED')
          .is('superseded_at', null);

        const chargeMap = new Map(
          (charges || []).map(c => [c.area?.toLowerCase(), Number(c.charge_amount)])
        );

        let grossBND = 0;
        let deliveryChargesBND = 0;
        for (const o of remainingOrders || []) {
          const amt = Number(o.total_amount);
          grossBND += amt;
          if (o.area) {
            deliveryChargesBND += chargeMap.get(o.area.toLowerCase()) || 0;
          }
        }
        const netBND = grossBND - deliveryChargesBND;
        const rate = Number(batch?.exchange_rate_to_rm || 0);

        await supabase
          .from('claim_batches')
          .update({
            total_amount: netBND,
            total_bnd: netBND,
            gross_bnd: grossBND,
            delivery_charges_bnd: deliveryChargesBND,
            net_bnd: netBND,
            total_rm: rate > 0 ? Number((netBND * rate).toFixed(2)) : null,
            gross_rm: rate > 0 ? Number((grossBND * rate).toFixed(2)) : null,
            delivery_charges_rm: rate > 0 ? Number((deliveryChargesBND * rate).toFixed(2)) : null,
            net_rm: rate > 0 ? Number((netBND * rate).toFixed(2)) : null,
          })
          .eq('id', batchId);
      }

      // 5. Audit log
      await supabase.from('audit_logs').insert({
        actor_id: user.id,
        action: 'ORDER_REMOVED_FROM_BATCH',
        entity_type: 'claim_batch',
        entity_id: batchId,
        after_json: {
          removed_order_id: orderId,
          remaining_count: remainingOrderIds.length,
        },
      });

      return { batchId, orderId, remainingCount: remainingOrderIds.length };
    },
    onSuccess: (data) => {
      invalidateOrderQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['claim-batches'] });
      queryClient.invalidateQueries({ queryKey: ['claim-batch-details'] });
      toast({
        title: 'Order Removed',
        description: data.remainingCount === 0
          ? 'Order removed. Batch was empty and has been deleted.'
          : `Order removed from batch. ${data.remainingCount} order(s) remaining.`,
      });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

/**
 * Look up which claim batch an order belongs to (by order code).
 */
export function useOrderBatchLookup(orderCode: string) {
  return useQuery({
    queryKey: ['order-batch-lookup', orderCode],
    queryFn: async () => {
      if (!orderCode || orderCode.trim().length < 2) return null;

      // Find the order by code
      const { data: orders } = await supabase
        .from('orders')
        .select('id, order_code, customer_name, area, total_amount, reconciliation_status')
        .ilike('order_code', orderCode.trim())
        .limit(1);

      if (!orders || orders.length === 0) return null;
      const order = orders[0];

      // Find the batch item
      const { data: item } = await supabase
        .from('claim_batch_items')
        .select('batch_id')
        .eq('order_id', order.id)
        .limit(1);

      if (!item || item.length === 0) {
        return { order, batch: null };
      }

      // Fetch the batch
      const { data: batch } = await supabase
        .from('claim_batches')
        .select('*, runner:profiles!claim_batches_runner_id_fkey(display_name)')
        .eq('id', item[0].batch_id)
        .single();

      return { order, batch };
    },
    enabled: !!orderCode && orderCode.trim().length >= 2,
    staleTime: 10000,
  });
}
