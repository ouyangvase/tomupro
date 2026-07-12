import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { invalidateOrderQueries } from '@/lib/invalidateOrderQueries';
import { useAuth } from '@/contexts/AuthContext';

interface SetAutoRescheduleParams {
  orderId: string;
  nextDate: string;
  runnerId: string;
  comment?: string;
  currentCycleNo?: number;
  currentStatus?: string;
}

export function useSetAutoReschedule() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: SetAutoRescheduleParams) => {
      if (!user) throw new Error('Not authenticated');

      const newCycleNo = (params.currentCycleNo || 0) + 1;

      // Update order to set auto-reschedule
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          next_delivery_date: params.nextDate,
          runner_id: params.runnerId,
          reschedule_flag: true,
          reschedule_cycle_no: newCycleNo,
          operational_status: 'BOOKING_AUTO_RESCHEDULE',
          runner_status: 'ASSIGNED',
          last_status_note: `Auto-reschedule set for ${params.nextDate}`,
          salesperson_action_required: false,
          salesperson_action_type: null,
        })
        .eq('id', params.orderId);

      if (updateError) throw updateError;

      // Record in reschedule history
      const { error: historyError } = await supabase
        .from('reschedule_history')
        .insert({
          order_id: params.orderId,
          cycle_no: newCycleNo,
          from_status: params.currentStatus || 'NEW',
          to_status: 'BOOKING_AUTO_RESCHEDULE',
          next_delivery_date: params.nextDate,
          comment: params.comment || 'No comment',
          rescheduled_by: user.id,
        });

      if (historyError) {
        console.error('Failed to record reschedule history:', historyError);
        // Don't throw, the main operation succeeded
      }

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
