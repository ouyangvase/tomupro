import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { invalidateOrderQueries } from '@/lib/invalidateOrderQueries';
import { useAuth } from '@/contexts/AuthContext';

interface ReviewParams {
  orderId: string;
  outcome: 'CONFIRM_DELIVERED' | 'CONFIRM_FAILED' | 'RESCHEDULE' | 'NEED_SALESPERSON_FOLLOWUP';
  comment?: string;
  reasonId?: string;
  nextDeliveryDate?: string;
  actionType?: string;
  actionDueDate?: string;
  salespersonActionRequired?: boolean;
  currentRescheduleCycleNo?: number;
  currentOperationalStatus?: string;
  deliveredAt?: string;
}

export function useRunnerReviewOrder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: ReviewParams) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('review_driver_delivery', {
        p_order_id: params.orderId,
        p_actor_id: user.id,
        p_accept: true,
        p_reason: params.comment || null,
      });

      if (error) throw error;
      if (!(data as { success?: boolean; error?: string })?.success) {
        throw new Error(
          (data as { error?: string })?.error || 'Unable to accept Driver report',
        );
      }

      return data;
    },
    onSuccess: () => {
      invalidateOrderQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['reschedule-history'] });
      toast.success('Order reviewed and updated');
    },
    onError: (error) => {
      toast.error(`Failed to review order: ${error.message}`);
    },
  });
}
