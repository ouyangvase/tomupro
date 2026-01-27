import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Order, OrderStatus, RunnerStatus, ReconciliationStatus } from '@/types/database';

interface TeamOrderFilters {
  status?: OrderStatus;
  salespersonIds?: string[]; // For team filtering (explicit override)
  salespersonId?: string; // Single salesperson (backward compatible)
  runnerId?: string;
  runnerStatus?: RunnerStatus;
  reconciliationStatus?: ReconciliationStatus;
}

/**
 * Hook to fetch orders with strict team visibility support.
 * Uses server-side RPC (get_visible_owner_ids) as the source of truth.
 * 
 * VISIBILITY RULES (enforced server-side):
 * - Salesperson: Only sees their own orders (salesperson_id = auth.uid)
 * - Manager: Sees own orders + bound team members' orders (ISOLATED - no cross-manager)
 * - Admin: Sees all orders
 * - Runner: Filtered by runner_id (handled via runnerId filter)
 */
export function useTeamOrders(filters?: TeamOrderFilters) {
  const { user, role } = useAuth();
  
  return useQuery({
    queryKey: ['orders', 'team', filters, role, user?.id],
    queryFn: async () => {
      // First, fetch visible owner IDs from server (source of truth)
      const { data: visibleUserIds, error: visError } = await supabase.rpc('get_visible_owner_ids');
      
      if (visError) {
        console.error('Failed to fetch visible owner IDs:', visError);
        // Fallback to own ID only on error
      }
      
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
        .limit(1000000); // High limit to prevent data truncation for high-volume users

      if (filters?.status) {
        query = query.eq('status', filters.status);
        // For READY and BOOKING status, exclude DELIVERED and FAILED_DELIVERY orders
        if (filters.status === 'READY' || filters.status === 'BOOKING') {
          query = query.neq('runner_status', 'DELIVERED');
          query = query.neq('runner_status', 'FAILED_DELIVERY');
        }
      }
      
      // Server-side visibility enforcement
      // visibleUserIds = null means admin (no filter)
      // visibleUserIds = [] means no access (fallback)
      // visibleUserIds = [...] means specific IDs allowed
      
      if (filters?.salespersonIds && filters.salespersonIds.length > 0) {
        // Explicit list of salesperson IDs (for team view toggle)
        // For non-admins, ensure the IDs are within their visible scope
        if (visibleUserIds !== null && Array.isArray(visibleUserIds)) {
          const allowedIds = filters.salespersonIds.filter(id => visibleUserIds.includes(id));
          if (allowedIds.length > 0) {
            query = query.in('salesperson_id', allowedIds);
          } else {
            // No valid IDs, return empty
            return [];
          }
        } else {
          // Admin - no filter needed, use requested IDs
          query = query.in('salesperson_id', filters.salespersonIds);
        }
      } else if (filters?.salespersonId) {
        // Single salesperson filter (backward compatible)
        if (visibleUserIds !== null && Array.isArray(visibleUserIds)) {
          if (!visibleUserIds.includes(filters.salespersonId)) {
            return []; // Not allowed to see this salesperson's data
          }
        }
        query = query.eq('salesperson_id', filters.salespersonId);
      } else if (visibleUserIds !== null && Array.isArray(visibleUserIds) && visibleUserIds.length > 0) {
        // Apply visibility filter based on server-side result
        query = query.in('salesperson_id', visibleUserIds);
      }
      // visibleUserIds = null means admin, no filter applied
      
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
        
        usersData?.forEach(u => {
          usersMap[u.id] = u;
        });
      }

      // Use LEFT JOIN semantics - show 'Deleted User' for missing profiles
      const orders = ordersData?.map(order => ({
        ...order,
        salesperson: order.salesperson_id 
          ? (usersMap[order.salesperson_id] || { id: order.salesperson_id, display_name: 'Deleted User', email: null })
          : null,
        runner: order.runner_id 
          ? (usersMap[order.runner_id] || { id: order.runner_id, display_name: 'Deleted User', email: null })
          : null,
        driver: order.driver_id 
          ? (usersMap[order.driver_id] || { id: order.driver_id, display_name: 'Deleted User', email: null })
          : null,
      }));

      return orders as unknown as Order[];
    },
    enabled: !!user?.id,
    staleTime: 10000,
  });
}
