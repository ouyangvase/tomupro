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

// NOTE: Stock deduction is now handled by the process-delivery edge function
// This function is deprecated and should not be called directly.
// Use the edge function instead for proper idempotency and validation.
export async function processStockDeduction(orderId: string) {
  console.warn('processStockDeduction is deprecated. Use process-delivery edge function instead.');
  
  // Call the edge function instead
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  
  const response = await supabase.functions.invoke('process-delivery', {
    body: { orderId },
  });
  
  if (response.error) {
    throw new Error(response.error.message || 'Failed to process delivery');
  }
  
  return response.data;
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
