import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { ClaimBatch, ClaimBatchStatus, Profile } from '@/types/database';

interface ClaimBatchFilters {
  runnerId?: string;
  status?: ClaimBatchStatus;
}

export function useClaimBatches(filters?: ClaimBatchFilters) {
  return useQuery({
    queryKey: ['claim-batches', filters],
    queryFn: async () => {
      let query = supabase
        .from('claim_batches')
        .select(`
          *,
          items:claim_batch_items(
            *,
            order:orders(
              *,
              order_items(*, product:products(sku_code, sku_name))
            )
          )
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
      queryClient.invalidateQueries({ queryKey: ['orders'] });
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
      queryClient.invalidateQueries({ queryKey: ['orders'] });
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
      queryClient.invalidateQueries({ queryKey: ['orders'] });
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
