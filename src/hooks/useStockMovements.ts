import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { MovementType, ReferenceType } from '@/types/database';

interface CreateMovementParams {
  warehouse_id: string;
  product_id: string;
  movement_type: MovementType;
  qty_change: number;
  reference_type: ReferenceType;
  reference_id?: string;
}

export function useCreateStockMovement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (movement: CreateMovementParams) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('stock_movements')
        .insert({
          ...movement,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

export function useCreateBulkStockMovements() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (movements: CreateMovementParams[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const movementsWithUser = movements.map(m => ({
        ...m,
        created_by: user.id,
      }));

      const { error } = await supabase
        .from('stock_movements')
        .insert(movementsWithUser);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      toast({ title: 'Stock movements created' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

// Auto stock deduction function
export async function processStockDeduction(orderId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

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

  // Check if eligible for deduction
  if (
    order.runner_status !== 'DELIVERED' ||
    order.reconciliation_status !== 'SETTLED' ||
    order.stock_deducted
  ) {
    return { success: false, reason: 'Order not eligible for stock deduction' };
  }

  // Check all items have product_id
  const missingProductItems = order.order_items.filter((item: { product_id: string | null }) => !item.product_id);
  if (missingProductItems.length > 0) {
    // Set to dispute
    await supabase
      .from('orders')
      .update({
        reconciliation_status: 'DISPUTE',
        dispute_reason: 'Missing SKU mapping for stock deduction',
      })
      .eq('id', orderId);

    return { success: false, reason: 'Missing SKU mapping' };
  }

  // Get warehouse
  const warehouseId = order.fulfillment_warehouse_id;
  if (!warehouseId) {
    return { success: false, reason: 'No fulfillment warehouse set' };
  }

  // Create stock movements for each item
  const movements = order.order_items.map((item: { product_id: string; qty: number; id: string }) => ({
    warehouse_id: warehouseId,
    product_id: item.product_id,
    movement_type: 'SALE_DEDUCT' as MovementType,
    qty_change: -item.qty,
    reference_type: 'ORDER_ITEM' as ReferenceType,
    reference_id: item.id,
    created_by: user.id,
  }));

  const { error: movementError } = await supabase
    .from('stock_movements')
    .insert(movements);

  if (movementError) throw movementError;

  // Mark order as stock deducted
  const { error: updateError } = await supabase
    .from('orders')
    .update({ stock_deducted: true })
    .eq('id', orderId);

  if (updateError) throw updateError;

  // Log audit
  await supabase.from('audit_logs').insert({
    entity_type: 'order',
    entity_id: orderId,
    action: 'STOCK_DEDUCTED',
    after_json: { stock_deducted: true, items_count: order.order_items.length } as unknown as undefined,
    actor_id: user.id,
  });

  return { success: true };
}

// Hook to process multiple orders for stock deduction
export function useProcessStockDeductions() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (orderIds: string[]) => {
      const results = [];
      for (const orderId of orderIds) {
        try {
          const result = await processStockDeduction(orderId);
          results.push({ orderId, ...result });
        } catch (error) {
          results.push({ orderId, success: false, reason: (error as Error).message });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
      
      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;
      
      if (successful > 0) {
        toast({ title: `Stock deducted for ${successful} order(s)` });
      }
      if (failed > 0) {
        toast({ 
          variant: 'destructive', 
          title: `${failed} order(s) failed deduction`,
          description: 'Check dispute status for details'
        });
      }
    },
  });
}
