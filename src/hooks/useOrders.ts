import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Order, OrderStatus, RunnerStatus, ReconciliationStatus } from '@/types/database';

interface OrderFilters {
  status?: OrderStatus;
  salespersonId?: string;
  salespersonIds?: string[];
  runnerId?: string;
  runnerStatus?: RunnerStatus;
  reconciliationStatus?: ReconciliationStatus;
  excludeDeliveredAndFailed?: boolean;
  searchQuery?: string; // Server-side search on order_code, customer_name, or area
  areaFilter?: string; // Server-side exact match on area
  deliveredDateFrom?: string; // ISO date string for delivered_at >= filter
  deliveredDateTo?: string; // ISO date string for delivered_at <= filter
}

export function useOrders(filters?: OrderFilters) {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: async () => {
      // Reduced limit for better performance - use pagination for large datasets
      const queryLimit = 2000;
      
      let query = supabase
        .from('orders')
        .select(`
          *,
          order_items(
            *,
            product:products(id, sku_code, sku_name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(queryLimit);

      if (filters?.status) {
        query = query.eq('status', filters.status);
        // For READY and BOOKING status, exclude DELIVERED and FAILED_DELIVERY orders
        // Delivered orders should only appear in Delivered Orders page
        // Failed Delivery orders should only appear in Action Required / Failed Orders page
        if (filters.status === 'READY' || filters.status === 'BOOKING') {
          query = query.neq('runner_status', 'DELIVERED');
          query = query.neq('runner_status', 'FAILED_DELIVERY');
        }
      }
      if (filters?.salespersonId) {
        query = query.eq('salesperson_id', filters.salespersonId);
      }
      if (filters?.salespersonIds && filters.salespersonIds.length > 0) {
        query = query.in('salesperson_id', filters.salespersonIds);
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
      if (filters?.excludeDeliveredAndFailed) {
        query = query.neq('runner_status', 'DELIVERED');
        query = query.neq('runner_status', 'FAILED_DELIVERY');
      }
      
      // Server-side search filter for better performance on large datasets
      // Searches order_code, customer_name, and area
      if (filters?.searchQuery && filters.searchQuery.trim()) {
        const searchTerm = `%${filters.searchQuery.trim()}%`;
        query = query.or(`order_code.ilike.${searchTerm},customer_name.ilike.${searchTerm},area.ilike.${searchTerm}`);
      }
      
      // Server-side exact area filter
      if (filters?.areaFilter && filters.areaFilter !== 'all') {
        query = query.eq('area', filters.areaFilter);
      }

      // Server-side date range filter on delivered_at
      if (filters?.deliveredDateFrom) {
        query = query.gte('delivered_at', filters.deliveredDateFrom);
      }
      if (filters?.deliveredDateTo) {
        query = query.lte('delivered_at', filters.deliveredDateTo);
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
      type DirectoryUser = { id: string; display_name: string | null; email: string | null };
      let usersMap: Record<string, DirectoryUser> = {};

      const normalizeName = (u: DirectoryUser): string => {
        const name = u.display_name?.trim();
        if (name) return name;
        if (u.email) return u.email.split('@')[0];
        return 'Unknown User';
      };

      const resolveUser = (id: string | null, fallbackName?: string | null): DirectoryUser | null => {
        if (!id) return null;
        const u = usersMap[id];
        if (u) return { ...u, display_name: normalizeName(u) };

        const fb = fallbackName?.trim();
        return {
          id,
          display_name: fb && fb.length > 0 ? fb : 'Unknown User',
          email: null,
        };
      };

      if (userIds.size > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('user_directory')
          .select('id, display_name, email')
          .in('id', Array.from(userIds));

        if (usersError) {
          // Don't fail the whole page; we'll fall back to snapshot fields where possible.
          console.warn('Failed to fetch user directory:', usersError);
        } else {
          usersData?.forEach((u) => {
            usersMap[u.id] = u as DirectoryUser;
          });
        }
      }

      // Combine orders with user data
      const orders = ordersData?.map((order) => ({
        ...order,
        // Prefer live directory name, else fall back to snapshot names on the order.
        salesperson: resolveUser(
          order.salesperson_id,
          (order as any).owner_manager_display_name_snapshot ||
            (order as any).owner_salesperson_display_name_snapshot ||
            (order as any).created_by_name_snapshot
        ),
        runner: resolveUser(order.runner_id),
        driver: resolveUser(order.driver_id),
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
      if (error) {
        // Handle duplicate order code error with user-friendly message
        if (error.code === '23505' && error.message.includes('idx_orders_order_code')) {
          throw new Error(`Order Reference "${orderCode.trim()}" already exists. Please use a different order reference.`);
        }
        throw error;
      }
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
