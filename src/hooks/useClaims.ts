import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { invalidateOrderQueries } from '@/lib/invalidateOrderQueries';
import { useAuth } from '@/contexts/AuthContext';
import type { Claim, ClaimMethod } from '@/types/database';

interface ClaimFilters {
  orderId?: string;
  createdBy?: string;
}

export function useClaims(filters?: ClaimFilters) {
  return useQuery({
    queryKey: ['claims', filters],
    queryFn: async () => {
      let query = supabase
        .from('claims')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.orderId) {
        query = query.eq('order_id', filters.orderId);
      }
      if (filters?.createdBy) {
        query = query.eq('created_by', filters.createdBy);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Claim[];
    },
  });
}

export function useCreateClaim() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (claim: {
      order_id: string;
      amount: number;
      method: ClaimMethod;
      note?: string;
      proof_url?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('claims')
        .insert({
          ...claim,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;

      // Update order reconciliation status
      await supabase
        .from('orders')
        .update({ reconciliation_status: 'SP_ACK_PENDING' })
        .eq('id', claim.order_id);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      invalidateOrderQueries(queryClient);
      toast({ title: 'Claim created successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

// New hook with delivery fee support
export function useCreateClaimWithDeliveryFee() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (claim: {
      order_id: string;
      gross_amount: number;
      delivery_fee: number;
      net_claim_amount: number;
      method: ClaimMethod;
      note?: string;
      proof_url?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('claims')
        .insert({
          order_id: claim.order_id,
          amount: claim.net_claim_amount, // For backward compatibility
          gross_amount: claim.gross_amount,
          delivery_fee: claim.delivery_fee,
          net_claim_amount: claim.net_claim_amount,
          method: claim.method,
          note: claim.note,
          proof_url: claim.proof_url,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;

      // Update order reconciliation status
      await supabase
        .from('orders')
        .update({ reconciliation_status: 'SP_ACK_PENDING' })
        .eq('id', claim.order_id);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      invalidateOrderQueries(queryClient);
      toast({ title: 'Claim submitted successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

export function useClaimsByOrders(orderIds: string[]) {
  return useQuery({
    queryKey: ['claims', 'byOrders', orderIds],
    queryFn: async () => {
      if (orderIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('claims')
        .select('*')
        .in('order_id', orderIds)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Claim[];
    },
    enabled: orderIds.length > 0,
  });
}
