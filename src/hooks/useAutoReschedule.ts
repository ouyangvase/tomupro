import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { invalidateOrderQueries } from '@/lib/invalidateOrderQueries';
import { useAuth } from '@/contexts/AuthContext';
import { callSupabaseRpc } from '@/lib/supabaseRpc';

interface SetAutoRescheduleParams {
  orderId: string;
  nextDate: string;
  runnerId: string;
  comment?: string;
  expectedState?: string;
}

export function useSetAutoReschedule() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: SetAutoRescheduleParams) => {
      if (!user) throw new Error('Not authenticated');

      await callSupabaseRpc('set_order_auto_reschedule', {
        p_order_id: params.orderId,
        p_next_delivery_date: params.nextDate,
        p_runner_id: params.runnerId,
        p_comment: params.comment || 'No comment',
        p_expected_state: params.expectedState || null,
      });

      return { success: true, nextDate: params.nextDate };
    },
    onSuccess: (data) => {
      invalidateOrderQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['reschedule-history'] });
      toast.success(`Auto reschedule set. Order will move to Ready on ${data.nextDate}`);
    },
    onError: (error) => {
      toast.error(`Failed to set auto reschedule: ${error.message}`);
    },
  });
}

// Hook to manually trigger the reopen scheduled orders function (for testing)
export function useTriggerReopenScheduledOrders() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('reopen_rescheduled_orders');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Processed scheduled orders: ${JSON.stringify(data)}`);
    },
    onError: (error) => {
      toast.error(`Failed to process: ${error.message}`);
    },
  });
}
