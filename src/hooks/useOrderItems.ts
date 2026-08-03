import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { orderItemsQueryKey } from '@/lib/orderItemsQuery';
import type { OrderItem } from '@/types/database';

export function useOrderItems(orderId?: string, enabled = true) {
  const { user } = useAuth();

  return useQuery({
    queryKey: orderItemsQueryKey(user?.id, orderId),
    queryFn: async () => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as OrderItem[];
    },
    enabled: enabled && !!user?.id && !!orderId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });
}

export function useCreateOrderItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (item: Partial<OrderItem>) => {
      const { data, error } = await supabase
        .from('order_items')
        .insert(item as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['order-items'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

export function useUpdateOrderItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<OrderItem> & { id: string }) => {
      const { data, error } = await supabase
        .from('order_items')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-items'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

export function useDeleteOrderItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('order_items')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-items'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

// Calculate totals from order items
// price = final sales amount per SKU (NOT unit price × qty). line_total = price. total_amount = SUM(price).
// qty is only used for stock/inventory purposes.
export function calculateOrderTotals(items: OrderItem[]) {
  const total_qty = items.reduce((sum, item) => sum + (item.qty || 0), 0);
  const total_amount = items.reduce((sum, item) => sum + Number(item.line_total || item.price || 0), 0);
  return { total_qty, total_amount };
}
