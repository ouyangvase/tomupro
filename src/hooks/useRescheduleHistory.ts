import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RescheduleHistoryItem {
  id: string;
  order_id: string;
  cycle_no: number;
  rescheduled_at: string;
  rescheduled_by: string | null;
  from_status: string | null;
  to_status: string | null;
  next_delivery_date: string | null;
  reason_id: string | null;
  comment: string | null;
  created_at: string;
  rescheduled_by_profile?: {
    display_name: string;
  };
  reason?: {
    label: string;
  };
}

export function useRescheduleHistory(orderId: string | undefined) {
  return useQuery({
    queryKey: ['reschedule-history', orderId],
    queryFn: async () => {
      if (!orderId) return [];
      
      const { data, error } = await supabase
        .from('reschedule_history')
        .select(`
          *,
          rescheduled_by_profile:profiles!reschedule_history_rescheduled_by_fkey(display_name),
          reason:reasons(label)
        `)
        .eq('order_id', orderId)
        .order('cycle_no', { ascending: false });

      if (error) throw error;
      return data as RescheduleHistoryItem[];
    },
    enabled: !!orderId,
  });
}

export function useAddRescheduleHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      order_id: string;
      cycle_no: number;
      from_status: string | null;
      to_status: string;
      next_delivery_date: string | null;
      reason_id: string | null;
      comment: string | null;
    }) => {
      const { data: user } = await supabase.auth.getUser();
      
      const { data: result, error } = await supabase
        .from('reschedule_history')
        .insert({
          order_id: data.order_id,
          cycle_no: data.cycle_no,
          from_status: data.from_status,
          to_status: data.to_status,
          next_delivery_date: data.next_delivery_date,
          reason_id: data.reason_id,
          comment: data.comment,
          rescheduled_by: user?.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reschedule-history', variables.order_id] });
    },
  });
}

export function useManualReopenOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data: user } = await supabase.auth.getUser();
      
      // Fetch current order state
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('reschedule_cycle_no, operational_status, next_delivery_date, runner_comment')
        .eq('id', orderId)
        .single();

      if (fetchError) throw fetchError;

      // Update order to reopen it
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          operational_status: 'NEW',
          driver_id: null,
          driver_status: 'UNASSIGNED',
          reopened_at: new Date().toISOString(),
          last_status_note: order.runner_comment || 'Manually reopened by runner',
        })
        .eq('id', orderId);

      if (updateError) throw updateError;

      // Add to reschedule history
      await supabase.from('reschedule_history').insert({
        order_id: orderId,
        cycle_no: (order.reschedule_cycle_no || 0) + 1,
        from_status: order.operational_status,
        to_status: 'NEW',
        next_delivery_date: order.next_delivery_date,
        comment: 'Manually reopened',
        rescheduled_by: user?.user?.id,
      });

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-driver-orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
