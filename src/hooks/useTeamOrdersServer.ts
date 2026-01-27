import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TeamOrder {
  id: string;
  order_code: string;
  order_date: string;
  customer_name: string;
  phone: string;
  address: string;
  area: string | null;
  channel: string | null;
  notes: string | null;
  payment_method: string;
  status: string;
  runner_status: string;
  reconciliation_status: string;
  total_qty: number;
  total_amount: number;
  discount_amount: number | null;
  salesperson_id: string;
  runner_id: string | null;
  driver_id: string | null;
  salesperson_name: string;
  runner_name: string | null;
  driver_name: string | null;
  delivered_at: string | null;
  next_delivery_date: string | null;
  salesperson_action_required: boolean | null;
  salesperson_action_type: string | null;
  runner_final_outcome: string | null;
  runner_comment: string | null;
  failed_reason: string | null;
  failed_next_step: string | null;
  cancel_reason: string | null;
  cancel_notes: string | null;
  operational_status: string;
  reschedule_flag: boolean | null;
  created_at: string;
  updated_at: string;
  items_summary: string | null;
}

interface UseTeamOrdersServerParams {
  status?: string;
  runnerStatus?: string;
  reconciliationStatus?: string;
  limit?: number;
  offset?: number;
}

/**
 * Server-side team orders hook using RPC with built-in visibility.
 * This is the preferred hook for fetching orders with proper team visibility enforcement.
 */
export function useTeamOrdersServer(params: UseTeamOrdersServerParams = {}) {
  const { user } = useAuth();
  const { status, runnerStatus, reconciliationStatus, limit = 10000, offset = 0 } = params;

  return useQuery({
    queryKey: ['team-orders-server', user?.id, status, runnerStatus, reconciliationStatus, limit, offset],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team_orders', {
        p_status: status || null,
        p_runner_status: runnerStatus || null,
        p_reconciliation_status: reconciliationStatus || null,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) {
        console.error('Failed to fetch team orders:', error);
        throw error;
      }

      return (data || []) as TeamOrder[];
    },
    enabled: !!user?.id,
    staleTime: 10000,
    refetchInterval: 30000,
  });
}

/**
 * Hook to fetch delivered orders with server-side visibility.
 */
export function useDeliveredOrdersServer(params: Omit<UseTeamOrdersServerParams, 'runnerStatus'> = {}) {
  return useTeamOrdersServer({ ...params, runnerStatus: 'DELIVERED' });
}

/**
 * Hook to fetch booking orders with server-side visibility.
 */
export function useBookingOrdersServer(params: Omit<UseTeamOrdersServerParams, 'status'> = {}) {
  return useTeamOrdersServer({ ...params, status: 'BOOKING' });
}

/**
 * Hook to fetch ready orders with server-side visibility.
 */
export function useReadyOrdersServer(params: Omit<UseTeamOrdersServerParams, 'status'> = {}) {
  return useTeamOrdersServer({ ...params, status: 'READY' });
}

/**
 * Hook to fetch cancelled orders with server-side visibility.
 */
export function useCancelledOrdersServer(params: Omit<UseTeamOrdersServerParams, 'status'> = {}) {
  return useTeamOrdersServer({ ...params, status: 'CANCELLED' });
}

/**
 * Hook to fetch action required orders with server-side visibility.
 */
export function useActionRequiredOrdersServer(params: UseTeamOrdersServerParams = {}) {
  const { user } = useAuth();
  const { limit = 10000, offset = 0 } = params;

  return useQuery({
    queryKey: ['action-required-orders-server', user?.id, limit, offset],
    queryFn: async () => {
      // First get visible IDs
      const { data: visibleIds } = await supabase.rpc('get_visible_owner_ids');
      
      // Build query
      let query = supabase
        .from('orders')
        .select(`
          id,
          order_code,
          order_date,
          customer_name,
          phone,
          address,
          area,
          total_amount,
          status,
          runner_status,
          salesperson_action_required,
          salesperson_action_type,
          runner_final_outcome,
          runner_comment,
          failed_reason,
          next_delivery_date,
          salesperson_id,
          runner_id
        `)
        .eq('salesperson_action_required', true)
        .order('order_date', { ascending: false })
        .range(offset, offset + limit - 1);

      // Apply visibility filter (null means admin sees all)
      if (visibleIds !== null && Array.isArray(visibleIds)) {
        query = query.in('salesperson_id', visibleIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Failed to fetch action required orders:', error);
        throw error;
      }

      // Fetch user names for display
      const salespersonIds = [...new Set((data || []).map(o => o.salesperson_id))];
      const runnerIds = [...new Set((data || []).filter(o => o.runner_id).map(o => o.runner_id!))];
      const allUserIds = [...new Set([...salespersonIds, ...runnerIds])];

      let userMap: Record<string, string> = {};
      if (allUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', allUserIds);
        
        userMap = (profiles || []).reduce((acc, p) => {
          acc[p.id] = p.display_name || 'Deleted User';
          return acc;
        }, {} as Record<string, string>);
      }

      return (data || []).map(order => ({
        ...order,
        salesperson_name: userMap[order.salesperson_id] || 'Deleted User',
        runner_name: order.runner_id ? (userMap[order.runner_id] || 'Unknown') : null,
      }));
    },
    enabled: !!user?.id,
    staleTime: 10000,
    refetchInterval: 30000,
  });
}
