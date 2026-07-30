import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { invalidateOrderQueries } from '@/lib/invalidateOrderQueries';
import { useAuth } from '@/contexts/AuthContext';

interface ReviewParams {
  orderId: string;
  outcome: 'CONFIRM_DELIVERED' | 'CONFIRM_FAILED' | 'RESCHEDULE' | 'NEED_SALESPERSON_FOLLOWUP';
  reasonId?: string;
  comment?: string;
  nextDeliveryDate?: string;
  actionType?: string;
  actionDueDate?: string;
  salespersonActionRequired?: boolean;
  currentRescheduleCycleNo?: number;
  currentOperationalStatus?: string;
  deliveredAt?: string;  // ISO timestamp for when the delivery actually happened
}

export function useRunnerReviewOrder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: ReviewParams) => {
      if (!user) throw new Error('Not authenticated');

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
      let operationalStatus: string | undefined;
      if (params.outcome === 'CONFIRM_DELIVERED') {
        runnerStatus = 'DELIVERED';
        operationalStatus = 'DELIVERED_FINAL';
      } else if (params.outcome === 'CONFIRM_FAILED') {
        runnerStatus = 'FAILED_DELIVERY';
        operationalStatus = 'DRIVER_FAILED';
      } else if (params.outcome === 'RESCHEDULE') {
        operationalStatus = 'RESCHEDULED';
      }

      const newCycleNo = params.outcome === 'RESCHEDULE' 
        ? (params.currentRescheduleCycleNo || 0) + 1 
        : params.currentRescheduleCycleNo || 0;

      const updateData: Record<string, unknown> = {
        runner_review_status: 'REVIEWED',
        runner_final_outcome: params.outcome,
        runner_comment: params.comment || null,
        runner_reviewed_at: new Date().toISOString(),
        runner_reviewed_by: user.id,
        last_status_note: statusNote.substring(0, 200),
        salesperson_action_required: params.salespersonActionRequired || false,
      };

      if (params.reasonId) {
        updateData.runner_failed_reason_id = params.reasonId;
      }

      if (params.nextDeliveryDate) {
        updateData.next_delivery_date = params.nextDeliveryDate;
        updateData.reschedule_flag = true;
        updateData.reschedule_cycle_no = newCycleNo;
      }

      if (operationalStatus) {
        updateData.operational_status = operationalStatus;
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

      // If confirming delivered, also set delivered_at
      if (params.outcome === 'CONFIRM_DELIVERED') {
        updateData.delivered_at = params.deliveredAt || new Date().toISOString();
      }

      if (params.outcome === 'CONFIRM_DELIVERED' || params.outcome === 'CONFIRM_FAILED') {
        const { data: reviewResult, error: reviewError } = await supabase.rpc('review_driver_delivery', {
          p_order_id: params.orderId,
          p_actor_id: user.id,
          p_accept: true,
          p_reason: params.comment || null,
        });

        if (reviewError) throw reviewError;
        if (!(reviewResult as { success?: boolean; error?: string })?.success) {
          throw new Error(
            (reviewResult as { error?: string })?.error || 'Unable to accept Driver report',
          );
        }

        const reviewAction = (reviewResult as { action?: string })?.action;
        if (
          reviewAction === 'DRIVER_DELIVERY_DEFERRED'
          || reviewAction === 'DRIVER_RESCHEDULE_ACCEPTED'
        ) {
          return reviewResult;
        }
      }

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', params.orderId);

      if (error) throw error;

      // Record reschedule history if this is a reschedule
      if (params.outcome === 'RESCHEDULE') {
        await supabase.from('reschedule_history').insert({
          order_id: params.orderId,
          cycle_no: newCycleNo,
          from_status: params.currentOperationalStatus || 'UNKNOWN',
          to_status: 'RESCHEDULED',
          next_delivery_date: params.nextDeliveryDate,
          reason_id: params.reasonId || null,
          comment: params.comment || null,
          rescheduled_by: user.id,
        });
      }
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
