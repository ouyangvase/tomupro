import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type ReasonType = 'CANCEL' | 'FAILED_DELIVERY' | 'DISPUTE';

export interface Reason {
  id: string;
  reason_type: ReasonType;
  label: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  created_by: string;
}

export function useReasons(type?: ReasonType, activeOnly = true) {
  return useQuery({
    queryKey: ['reasons', type, activeOnly],
    queryFn: async () => {
      let query = supabase
        .from('reasons')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true });

      if (type) {
        query = query.eq('reason_type', type);
      }

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Reason[];
    },
  });
}

export function useCreateReason() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (reason: {
      reason_type: ReasonType;
      label: string;
      sort_order?: number;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('reasons')
        .insert({
          reason_type: reason.reason_type,
          label: reason.label,
          sort_order: reason.sort_order ?? 0,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reasons'] });
      toast.success('Reason created');
    },
    onError: (error) => {
      toast.error(`Failed to create reason: ${error.message}`);
    },
  });
}

export function useUpdateReason() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (update: {
      id: string;
      label?: string;
      is_active?: boolean;
      sort_order?: number;
    }) => {
      const { id, ...changes } = update;
      const { data, error } = await supabase
        .from('reasons')
        .update(changes)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reasons'] });
      toast.success('Reason updated');
    },
    onError: (error) => {
      toast.error(`Failed to update reason: ${error.message}`);
    },
  });
}

export function useDeleteReason() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const clearOrderReferences = await supabase
        .from('orders')
        .update({ runner_failed_reason_id: null })
        .eq('runner_failed_reason_id', id);

      if (clearOrderReferences.error) throw clearOrderReferences.error;

      const clearRescheduleReferences = await supabase
        .from('reschedule_history')
        .update({ reason_id: null })
        .eq('reason_id', id);

      if (clearRescheduleReferences.error) throw clearRescheduleReferences.error;

      const { data, error } = await supabase
        .from('reasons')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Reason was not deleted. Please check admin delete permission.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reasons'] });
      toast.success('Reason permanently deleted');
    },
    onError: (error) => {
      toast.error(`Failed to delete reason: ${error.message}`);
    },
  });
}
