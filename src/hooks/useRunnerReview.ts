import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ReviewParams {
  orderId: string;
  outcome: 'CONFIRM_DELIVERED' | 'CONFIRM_FAILED' | 'RESCHEDULE' | 'NEED_SALESPERSON_FOLLOWUP';
  reasonId?: string;
  comment?: string;
  nextDeliveryDate?: string;
  actionType?: string;
  actionDueDate?: string;
  salespersonActionRequired?: boolean;
}

export function useRunnerReviewOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ReviewParams) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      // Build last_status_note summary
      let statusNote = '';
      switch (params.outcome) {
        case 'CONFIRM_DELIVERED':
          statusNote = 'Delivery confirmed by runner';
          break;
        case 'CONFIRM_FAILED':
          statusNote = `Failed: ${params.comment || 'No comment'}`;
          break;
        case 'RESCHEDULE':
          statusNote = `Rescheduled to ${params.nextDeliveryDate}: ${params.comment || ''}`;
          break;
        case 'NEED_SALESPERSON_FOLLOWUP':
          statusNote = `Needs follow up: ${params.actionType} - ${params.comment || ''}`;
          break;
      }

      // Determine runner_status based on outcome
      let runnerStatus: string | undefined;
      if (params.outcome === 'CONFIRM_DELIVERED') {
        runnerStatus = 'DELIVERED';
      } else if (params.outcome === 'CONFIRM_FAILED') {
        runnerStatus = 'FAILED_DELIVERY';
      }

      const updateData: Record<string, unknown> = {
        runner_review_status: 'REVIEWED',
        runner_final_outcome: params.outcome,
        runner_comment: params.comment || null,
        runner_reviewed_at: new Date().toISOString(),
        runner_reviewed_by: user.user.id,
        last_status_note: statusNote.substring(0, 200),
        salesperson_action_required: params.salespersonActionRequired || false,
      };

      if (params.reasonId) {
        updateData.runner_failed_reason_id = params.reasonId;
      }

      if (params.nextDeliveryDate) {
        updateData.next_delivery_date = params.nextDeliveryDate;
        updateData.reschedule_flag = true;
      }

      if (params.actionType) {
        updateData.salesperson_action_type = params.actionType;
      }

      if (params.actionDueDate) {
        updateData.salesperson_action_due_date = params.actionDueDate;
      }

      if (runnerStatus) {
        updateData.runner_status = runnerStatus;
      }

      // If confirming delivered, also set delivered_at if not set
      if (params.outcome === 'CONFIRM_DELIVERED') {
        updateData.delivered_at = new Date().toISOString();
        updateData.runner_accept_status = 'ACCEPTED';
      }

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', params.orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-driver-orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order reviewed and updated');
    },
    onError: (error) => {
      toast.error(`Failed to review order: ${error.message}`);
    },
  });
}
