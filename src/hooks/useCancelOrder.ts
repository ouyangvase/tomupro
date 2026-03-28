import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/hooks/useAuditLogs';
import { invalidateOrderQueries } from '@/lib/invalidateOrderQueries';

interface CancelOrderParams {
  orderIds: string[];
  cancelReason: string;
  cancelNotes?: string;
}

export function useCancelOrders() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ orderIds, cancelReason, cancelNotes }: CancelOrderParams) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Fetch orders before update for audit log
      const { data: ordersBefore, error: fetchError } = await supabase
        .from('orders')
        .select('id, order_code, status, cancel_reason, cancel_notes')
        .in('id', orderIds);
      
      if (fetchError) throw fetchError;

      // Update orders with cancel info
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'CANCELLED',
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
