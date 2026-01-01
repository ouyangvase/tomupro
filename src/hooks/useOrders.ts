import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Order, OrderStatus, RunnerStatus, ReconciliationStatus } from '@/types/database';

interface OrderFilters {
  status?: OrderStatus;
  salespersonId?: string;
  runnerId?: string;
  runnerStatus?: RunnerStatus;
  reconciliationStatus?: ReconciliationStatus;
}

export function useOrders(filters?: OrderFilters) {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select(`
          *,
          salesperson:profiles!orders_salesperson_id_fkey(id, display_name, email),
          runner:profiles!orders_runner_id_fkey(id, display_name, email),
          order_items(*, product:products(id, sku_name, sku_code))
        `)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.salespersonId) {
        query = query.eq('salesperson_id', filters.salespersonId);
      }
      if (filters?.runnerId) {
        query = query.eq('runner_id', filters.runnerId);
      }
      if (filters?.runnerStatus) {
        query = query.eq('runner_status', filters.runnerStatus);
      }
      if (filters?.reconciliationStatus) {
        query = query.eq('reconciliation_status', filters.reconciliationStatus);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Order[];
    },
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (order: Partial<Order>) => {
      const { data, error } = await supabase
        .from('orders')
        .insert(order as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Order created successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Order> & { id: string }) => {
      const { data, error } = await supabase
        .from('orders')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Order updated successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

export function useBulkUpdateOrders() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ ids, updates }: { ids: string[]; updates: Partial<Order> }) => {
      const { error } = await supabase
        .from('orders')
        .update(updates as any)
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Orders updated successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}
