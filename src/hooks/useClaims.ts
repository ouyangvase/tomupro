import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
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

  return useMutation({
    mutationFn: async (claim: {
      order_id: string;
      amount: number;
      method: ClaimMethod;
      note?: string;
      proof_url?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
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
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Claim created successfully' });
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
