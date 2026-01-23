import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MovementType, ReferenceType } from '@/types/database';

interface RevertDeliveryParams {
  orderId: string;
  reason?: string;
}

/**
 * Hook for admin to revert a delivered order back to ASSIGNED status
 * and reverse any stock deductions made for that order
 */
export function useRevertDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, reason }: RevertDeliveryParams) => {
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

      const itemsRestored: string[] = [];

      // If stock was deducted, use idempotent RETURN_TO_OWNER movements
      // Stock returns to salesperson's warehouse (the ONLY stock owner)
      if (order.stock_deducted && order.fulfillment_warehouse_id) {
        // Verify the warehouse belongs to salesperson or manager
        const { data: warehouse } = await supabase
          .from('warehouses')
          .select('owner_user_id, warehouse_type')
          .eq('id', order.fulfillment_warehouse_id)
          .single();

        // Process returns to salesperson or manager warehouses
        if (warehouse?.warehouse_type === 'SALESPERSON' || warehouse?.warehouse_type === 'MANAGER') {
          // Create RETURN_TO_OWNER movements for each item (idempotent)
          for (const item of order.order_items) {
            if (!item.product_id) continue;
            
            // Check if return already exists (idempotency check)
            const { data: existing } = await supabase
              .from('stock_movements')
              .select('id')
              .eq('order_id', orderId)
              .eq('product_id', item.product_id)
              .eq('movement_type', 'RETURN_TO_OWNER')
              .maybeSingle();
            
            if (existing) {
              console.log('[REVERT] Stock already returned for product:', item.product_id);
              continue;
            }
            
            console.log('[REVERT] Creating RETURN_TO_OWNER movement:', {
              orderId,
              productId: item.product_id,
              qty: item.qty,
              warehouseId: order.fulfillment_warehouse_id,
            });

            const { error: insertError } = await supabase
              .from('stock_movements')
              .insert({
                warehouse_id: order.fulfillment_warehouse_id,
                product_id: item.product_id,
                movement_type: 'RETURN_TO_OWNER' as MovementType,
                qty_change: item.qty, // Positive to add back
                reference_type: 'ORDER_ITEM' as ReferenceType,
                order_id: orderId,
                created_by: user.id,
              });
            
            if (insertError) {
              console.error('[REVERT] Stock return failed:', insertError);
              throw new Error(`Failed to restore stock for product ${item.product_id}: ${insertError.message}`);
            }
            
            console.log('[REVERT] Stock return successful for product:', item.product_id);
            itemsRestored.push(item.product_id);
          }
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

      // Log audit with reason
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
          revert_reason: reason || 'No reason provided',
          items_restored: itemsRestored,
        } as unknown as undefined,
        actor_id: user.id,
      });

      // Notify runner about reverted delivery if there's a runner assigned
      if (order.runner_id) {
        await supabase.from('notifications').insert({
          user_id: order.runner_id,
          type: 'ORDER_UPDATE',
          title: 'Delivery Reverted',
          message: `Order ${order.order_code} has been reverted by admin. Reason: ${reason || 'Not specified'}`,
          reference_type: 'order',
          reference_id: orderId,
        });
      }

      return { success: true, stockReversed: order.stock_deducted, reason };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['runner-driver-orders'] });
      queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      queryClient.invalidateQueries({ queryKey: ['delivered-orders-fast'] });
      
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
