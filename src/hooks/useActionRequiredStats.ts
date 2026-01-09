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

      // SINGLE SOURCE OF TRUTH: Only fetch orders where action is explicitly required
      const { data: orders, error } = await supabase
        .from('orders')
        .select('id, runner_status, next_delivery_date, runner_failed_reason_id, runner_comment')
        .eq('salesperson_id', user.id)
        .eq('salesperson_action_required', true);

      if (error) throw error;

      // Calculate stats for display breakdown
      let failedDelivery = 0;
      let rescheduled = 0;
      let runnerFlagged = 0;

      orders?.forEach(order => {
        const runnerStatus = order.runner_status as string;

        // Categorize for display
        if (runnerStatus === 'FAILED_DELIVERY') {
          failedDelivery++;
        } else if (order.next_delivery_date) {
          rescheduled++;
        } else if (order.runner_failed_reason_id || order.runner_comment) {
          runnerFlagged++;
        } else {
          runnerFlagged++; // Manual flag
        }
      });

      return {
        total: orders?.length || 0,
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

// For manager: Get action required stats for their assigned salespersons
export function useManagerActionRequiredStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['action-required-stats', 'manager', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      // First get the manager's group members (salespersons)
      const { data: groupMembers, error: membersError } = await supabase
        .from('group_members')
        .select(`
          member_user_id,
          manager_groups!inner(manager_user_id)
        `)
        .eq('manager_groups.manager_user_id', user.id);

      if (membersError) throw membersError;

      const memberIds = groupMembers?.map(gm => gm.member_user_id) || [];

      if (memberIds.length === 0) {
        return {
          systemTotal: 0,
          failedDelivery: 0,
          rescheduled: 0,
          runnerFlagged: 0,
          bySalesperson: [],
        };
      }

      // Fetch orders requiring action for those salespersons
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, salesperson_id, runner_status, next_delivery_date, runner_failed_reason_id, runner_comment')
        .eq('salesperson_action_required', true)
        .in('salesperson_id', memberIds);

      if (ordersError) throw ordersError;

      // Fetch salesperson info
      const { data: salespersons, error: usersError } = await supabase
        .from('user_directory')
        .select('id, display_name, email')
        .in('id', memberIds);

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

        let category: 'failedDelivery' | 'rescheduled' | 'runnerFlagged';

        if (runnerStatus === 'FAILED_DELIVERY') {
          category = 'failedDelivery';
          totalFailed++;
        } else if (order.next_delivery_date) {
          category = 'rescheduled';
          totalRescheduled++;
        } else {
          category = 'runnerFlagged';
          totalRunnerFlagged++;
        }

        if (spStatsMap[spId]) {
          spStatsMap[spId][category]++;
          spStatsMap[spId].total++;
        }
      });

      const bySalesperson = Object.values(spStatsMap)
        .sort((a, b) => b.total - a.total);

      return {
        systemTotal: orders?.length || 0,
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

// For admin: Get system-wide action required stats with breakdown by salesperson
export function useAdminActionRequiredStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['action-required-stats', 'admin'],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      // SINGLE SOURCE OF TRUTH: Only fetch orders where action is explicitly required
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, salesperson_id, runner_status, next_delivery_date, runner_failed_reason_id, runner_comment')
        .eq('salesperson_action_required', true);

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

        let category: 'failedDelivery' | 'rescheduled' | 'runnerFlagged';

        // Categorize for display
        if (runnerStatus === 'FAILED_DELIVERY') {
          category = 'failedDelivery';
          totalFailed++;
        } else if (order.next_delivery_date) {
          category = 'rescheduled';
          totalRescheduled++;
        } else {
          category = 'runnerFlagged';
          totalRunnerFlagged++;
        }

        if (spStatsMap[spId]) {
          spStatsMap[spId][category]++;
          spStatsMap[spId].total++;
        }
      });

      // Convert to sorted array (highest total first)
      const bySalesperson = Object.values(spStatsMap)
        .sort((a, b) => b.total - a.total);

      return {
        systemTotal: orders?.length || 0,
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
