import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MovementType, ReferenceType } from '@/types/database';

/**
 * Hook for admin to revert a delivered order back to ASSIGNED status
 * and reverse any stock deductions made for that order
 */
export function useRevertDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check if user is admin
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        throw new Error('Only admins can revert deliveries');
      }

      // Fetch order with items
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          order_items(*)
        `)
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;

      // Check if order is in a delivered state
      if (order.driver_status !== 'DRIVER_DELIVERED' && order.runner_status !== 'DELIVERED') {
        throw new Error('Order is not in delivered status');
      }

      // If stock was deducted, reverse it
      if (order.stock_deducted && order.fulfillment_warehouse_id) {
        // Create reverse stock movements (add stock back)
        const reverseMovements = order.order_items
          .filter((item: { product_id: string | null }) => item.product_id)
          .map((item: { product_id: string; qty: number; id: string }) => ({
            warehouse_id: order.fulfillment_warehouse_id,
            product_id: item.product_id,
            movement_type: 'ADJUSTMENT' as MovementType,
            qty_change: item.qty, // Positive to add back
            reference_type: 'ORDER_ITEM' as ReferenceType,
            reference_id: item.id,
            created_by: user.id,
          }));

        if (reverseMovements.length > 0) {
          const { error: movementError } = await supabase
            .from('stock_movements')
            .insert(reverseMovements);

          if (movementError) throw movementError;
        }
      }

      // Revert order status
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          driver_status: 'ASSIGNED',
          runner_status: 'TAKEN',
          runner_accept_status: null,
          delivered_at: null,
          driver_delivered_at: null,
          stock_deducted: false,
          runner_review_status: null,
          runner_final_outcome: null,
          runner_comment: null,
          runner_reviewed_at: null,
          runner_reviewed_by: null,
        })
        .eq('id', orderId);

      if (updateError) throw updateError;

      // Log audit
      await supabase.from('audit_logs').insert({
        entity_type: 'order',
        entity_id: orderId,
        action: 'DELIVERY_REVERTED',
        before_json: {
          driver_status: order.driver_status,
          runner_status: order.runner_status,
          stock_deducted: order.stock_deducted,
        } as unknown as undefined,
        after_json: {
          driver_status: 'ASSIGNED',
          runner_status: 'TAKEN',
          stock_deducted: false,
          stock_reversed: order.stock_deducted,
        } as unknown as undefined,
        actor_id: user.id,
      });

      return { success: true, stockReversed: order.stock_deducted };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['runner-driver-orders'] });
      queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      
      const message = result.stockReversed
        ? 'Delivery reverted and stock added back'
        : 'Delivery reverted to assigned status';
      toast.success(message);
    },
    onError: (error: Error) => {
      toast.error(`Failed to revert: ${error.message}`);
    },
  });
}
