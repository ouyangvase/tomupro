import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/hooks/useAuditLogs';
import { invalidateOrderQueries } from '@/lib/invalidateOrderQueries';
import { useAuth } from '@/contexts/AuthContext';
import { transitionOrderLifecycle } from '@/lib/orderLifecycleTransition';
import type { CurrentOrderStatus } from '@/lib/orderLifecycle';

interface CancelOrderParams {
  orderIds: string[];
  cancelReason: string;
  cancelNotes?: string;
}

export function useCancelOrders() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ orderIds, cancelReason, cancelNotes }: CancelOrderParams) => {
      if (!user) throw new Error('Not authenticated');

      // Fetch orders before update for audit log
      const { data: ordersBefore, error: fetchError } = await supabase
        .from('orders')
        .select('id, order_code, status, cancel_reason, cancel_notes, current_operational_state')
        .in('id', orderIds);
      
      if (fetchError) throw fetchError;

      if ((ordersBefore || []).length !== orderIds.length) {
        throw new Error('Some selected orders are no longer available for cancellation. Refresh and try again.');
      }

      // Move each order through the guarded lifecycle service first. The
      // metadata update below cannot create a second active lifecycle state.
      await Promise.all((ordersBefore || []).map((order) => transitionOrderLifecycle({
        orderId: order.id,
        toState: 'CANCELLED',
        expectedState: order.current_operational_state as CurrentOrderStatus,
        reason: cancelReason,
      })));

      // Update cancellation metadata after the canonical state transition.
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          cancel_reason: cancelReason,
          cancel_notes: cancelNotes || null,
          cancelled_by: user.id,
          cancelled_at: new Date().toISOString(),
        })
        .in('id', orderIds);

      if (updateError) throw updateError;

      // Create audit logs for each cancelled order
      for (const order of ordersBefore || []) {
        await logAudit({
          entity_type: 'order',
          entity_id: order.id,
          action: 'CANCELLED',
          before_json: {
            status: order.status,
            cancel_reason: order.cancel_reason,
            cancel_notes: order.cancel_notes,
          },
          after_json: {
            status: 'CANCELLED',
            cancel_reason: cancelReason,
            cancel_notes: cancelNotes || null,
            cancelled_by: user.id,
            cancelled_at: new Date().toISOString(),
          },
        });
      }

      return { cancelledCount: orderIds.length };
    },
    onSuccess: ({ cancelledCount }) => {
      invalidateOrderQueries(queryClient);
      toast({ 
        title: `${cancelledCount} order${cancelledCount !== 1 ? 's' : ''} cancelled`,
        description: 'Orders moved to Cancelled Sales'
      });
    },
    onError: (error: Error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Failed to cancel orders', 
        description: error.message 
      });
    },
  });
}
