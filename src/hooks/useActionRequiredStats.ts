import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ActionRequiredStats {
  total: number;
  failedDelivery: number;
  rescheduled: number;
  runnerFlagged: number;
}

export interface ActionRequiredBySalesperson {
  salespersonId: string;
  salespersonName: string;
  email: string | null;
  total: number;
  failedDelivery: number;
  rescheduled: number;
  runnerFlagged: number;
}

// For salesperson: Get their own action required stats
export function useSalespersonActionRequiredStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['action-required-stats', 'salesperson', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      // Fetch orders requiring action for this salesperson
      const { data: orders, error } = await supabase
        .from('orders')
        .select('id, status, runner_status, next_delivery_date, runner_failed_reason_id, runner_comment, salesperson_action_required')
        .eq('salesperson_id', user.id)
        .neq('status', 'CANCELLED');

      if (error) throw error;

      // Calculate stats based on action required logic
      let failedDelivery = 0;
      let rescheduled = 0;
      let runnerFlagged = 0;

      orders?.forEach(order => {
        const runnerStatus = order.runner_status as string;
        
        // Skip delivered orders unless explicitly flagged
        if (runnerStatus === 'DELIVERED' && !order.salesperson_action_required) {
          return;
        }

        // Rule 1: Failed delivery
        if (runnerStatus === 'FAILED_DELIVERY') {
          failedDelivery++;
          return;
        }

        // Rule 2: Has reschedule date
        if (order.next_delivery_date) {
          rescheduled++;
          return;
        }

        // Rule 3: Runner flagged (has reason or comment)
        if (order.runner_failed_reason_id || order.runner_comment) {
          runnerFlagged++;
          return;
        }

        // Rule 4: Manual flag
        if (order.salesperson_action_required) {
          runnerFlagged++;
        }
      });

      return {
        total: failedDelivery + rescheduled + runnerFlagged,
        failedDelivery,
        rescheduled,
        runnerFlagged,
      } as ActionRequiredStats;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });
}

// For runner: Get failed orders stats
export function useRunnerActionRequiredStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['action-required-stats', 'runner', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const { data: orders, error } = await supabase
        .from('orders')
        .select('id, status, runner_status')
        .eq('runner_id', user.id);

      if (error) throw error;

      let failedDelivery = 0;
      let cancelled = 0;

      orders?.forEach(order => {
        if (order.runner_status === 'FAILED_DELIVERY') {
          failedDelivery++;
        }
        if (order.status === 'CANCELLED') {
          cancelled++;
        }
      });

      return {
        total: failedDelivery + cancelled,
        failedDelivery,
        cancelled,
      };
    },
    enabled: !!user,
    refetchInterval: 30000,
  });
}

// For admin: Get system-wide action required stats with breakdown by salesperson
export function useAdminActionRequiredStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['action-required-stats', 'admin'],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      // Fetch all relevant orders
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, salesperson_id, status, runner_status, next_delivery_date, runner_failed_reason_id, runner_comment, salesperson_action_required')
        .neq('status', 'CANCELLED');

      if (ordersError) throw ordersError;

      // Fetch salesperson directory
      const { data: salespersons, error: usersError } = await supabase
        .from('user_directory')
        .select('id, display_name, email')
        .eq('role', 'salesperson');

      if (usersError) throw usersError;

      // Create a map of salesperson stats
      const spStatsMap: Record<string, ActionRequiredBySalesperson> = {};

      salespersons?.forEach(sp => {
        spStatsMap[sp.id] = {
          salespersonId: sp.id,
          salespersonName: sp.display_name,
          email: sp.email,
          total: 0,
          failedDelivery: 0,
          rescheduled: 0,
          runnerFlagged: 0,
        };
      });

      // Calculate stats
      let totalFailed = 0;
      let totalRescheduled = 0;
      let totalRunnerFlagged = 0;

      orders?.forEach(order => {
        const runnerStatus = order.runner_status as string;
        const spId = order.salesperson_id;

        // Skip delivered orders unless explicitly flagged
        if (runnerStatus === 'DELIVERED' && !order.salesperson_action_required) {
          return;
        }

        let category: 'failedDelivery' | 'rescheduled' | 'runnerFlagged' | null = null;

        // Rule 1: Failed delivery
        if (runnerStatus === 'FAILED_DELIVERY') {
          category = 'failedDelivery';
          totalFailed++;
        }
        // Rule 2: Has reschedule date
        else if (order.next_delivery_date) {
          category = 'rescheduled';
          totalRescheduled++;
        }
        // Rule 3: Runner flagged
        else if (order.runner_failed_reason_id || order.runner_comment || order.salesperson_action_required) {
          category = 'runnerFlagged';
          totalRunnerFlagged++;
        }

        if (category && spStatsMap[spId]) {
          spStatsMap[spId][category]++;
          spStatsMap[spId].total++;
        }
      });

      // Convert to sorted array (highest total first)
      const bySalesperson = Object.values(spStatsMap)
        .sort((a, b) => b.total - a.total);

      return {
        systemTotal: totalFailed + totalRescheduled + totalRunnerFlagged,
        failedDelivery: totalFailed,
        rescheduled: totalRescheduled,
        runnerFlagged: totalRunnerFlagged,
        bySalesperson,
      };
    },
    enabled: !!user,
    refetchInterval: 30000,
  });
}
