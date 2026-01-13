import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import type { Order, OrderStatus, RunnerStatus, ReconciliationStatus } from '@/types/database';

interface TeamOrderFilters {
  status?: OrderStatus;
  salespersonIds?: string[]; // For team filtering
  salespersonId?: string; // Single salesperson (backward compatible)
  runnerId?: string;
  runnerStatus?: RunnerStatus;
  reconciliationStatus?: ReconciliationStatus;
}

/**
 * Hook to fetch orders with team support for managers.
 * - Salesperson: Only sees their own orders
 * - Manager: Sees own orders + team members' orders based on filters
 * - Admin: Sees all orders
 */
export function useTeamOrders(filters?: TeamOrderFilters) {
  const { user, role } = useAuth();
  const { data: teamMembers = [] } = useTeamMembers();
  
  return useQuery({
    queryKey: ['orders', 'team', filters, role, user?.id, teamMembers.map(t => t.id)],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select(`
          *,
          order_items(
            *,
            product:products(id, sku_code, sku_name)
          )
        `)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
        // For READY and BOOKING status, exclude DELIVERED and FAILED_DELIVERY orders
        if (filters.status === 'READY' || filters.status === 'BOOKING') {
          query = query.neq('runner_status', 'DELIVERED');
          query = query.neq('runner_status', 'FAILED_DELIVERY');
        }
      }
      
      // Handle salesperson filtering based on role
      if (filters?.salespersonIds && filters.salespersonIds.length > 0) {
        // Explicit list of salesperson IDs (for team view)
        query = query.in('salesperson_id', filters.salespersonIds);
      } else if (filters?.salespersonId) {
        // Single salesperson filter (backward compatible)
        query = query.eq('salesperson_id', filters.salespersonId);
      } else if (role === 'salesperson' && user?.id) {
        // Salesperson: only their own orders
        query = query.eq('salesperson_id', user.id);
      } else if (role === 'manager' && user?.id) {
        // Manager without explicit filter: show own + team orders
        const teamIds = [user.id, ...teamMembers.map(t => t.id)];
        if (teamIds.length > 0) {
          query = query.in('salesperson_id', teamIds);
        }
      }
      // Admin: no filter, sees all orders
      
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

      // Get unique user IDs for enrichment
      const userIds = new Set<string>();
      ordersData?.forEach(order => {
        if (order.salesperson_id) userIds.add(order.salesperson_id);
        if (order.runner_id) userIds.add(order.runner_id);
        if (order.driver_id) userIds.add(order.driver_id);
      });

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

      const orders = ordersData?.map(order => ({
        ...order,
        salesperson: order.salesperson_id ? usersMap[order.salesperson_id] : null,
        runner: order.runner_id ? usersMap[order.runner_id] : null,
        driver: order.driver_id ? usersMap[order.driver_id] : null,
      }));

      return orders as unknown as Order[];
    },
    enabled: !!user?.id || role === 'admin',
  });
}
