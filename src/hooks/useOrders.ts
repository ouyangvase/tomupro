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
      // First, get all orders
      let query = supabase
        .from('orders')
        .select(`
          *,
          order_items(*)
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

      const { data: ordersData, error: ordersError } = await query;
      if (ordersError) throw ordersError;

      // Get unique user IDs (salesperson + runner + driver)
      const userIds = new Set<string>();
      ordersData?.forEach(order => {
        if (order.salesperson_id) userIds.add(order.salesperson_id);
        if (order.runner_id) userIds.add(order.runner_id);
        if (order.driver_id) userIds.add(order.driver_id);
      });

      // Fetch user directory for these IDs (accessible to all authenticated users)
      let usersMap: Record<string, { id: string; display_name: string; email: string | null }> = {};
      if (userIds.size > 0) {
        const { data: usersData } = await supabase
          .from('user_directory')
          .select('id, display_name, email')
          .in('id', Array.from(userIds));
        
        usersData?.forEach(user => {
          usersMap[user.id] = user;
        });
      }

      // Combine orders with user data
      const orders = ordersData?.map(order => ({
        ...order,
        salesperson: order.salesperson_id ? usersMap[order.salesperson_id] : null,
        runner: order.runner_id ? usersMap[order.runner_id] : null,
        driver: order.driver_id ? usersMap[order.driver_id] : null,
      }));

      return orders as unknown as Order[];
    },
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (order: Partial<Order>) => {
      // order_code is REQUIRED - user must provide it
      const orderCode = (order as any).order_code;
      if (!orderCode || !orderCode.trim()) {
        throw new Error('Order Reference is required');
      }
      const { data, error } = await supabase
        .from('orders')
        .insert({ ...order, order_code: orderCode.trim() } as any)
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
