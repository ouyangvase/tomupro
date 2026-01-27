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

      // Fetch orders that require action: either flagged OR runner_status = FAILED_DELIVERY
      const { data: orders, error } = await supabase
        .from('orders')
        .select('id, status, runner_status, next_delivery_date, runner_failed_reason_id, runner_comment, salesperson_action_required')
        .eq('salesperson_id', user.id)
        .neq('status', 'CANCELLED');

      if (error) throw error;

      // Filter: salesperson_action_required = true OR runner_status = FAILED_DELIVERY
      const actionRequired = orders?.filter(order => 
        order.salesperson_action_required === true || 
        (order.runner_status as string) === 'FAILED_DELIVERY'
      ) || [];

      // Calculate stats for display breakdown
      let failedDelivery = 0;
      let rescheduled = 0;
      let runnerFlagged = 0;

      actionRequired.forEach(order => {
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
        total: actionRequired.length,
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

// For manager: Get action required stats for their assigned salespersons + their own orders
export function useManagerActionRequiredStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['action-required-stats', 'manager', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      // Get team members from ALL visibility sources (aligned with is_in_manager_team RLS):
      // 1. manager_salesperson_bindings (canonical)
      // 2. group_members via manager_groups (backward compat)
      // 3. profiles.manager_id (legacy binding)
      // 4. user_data_shares (data sharing feature)
      const [bindingsRes, groupMembersRes, legacyRes, sharesRes] = await Promise.all([
        supabase
          .from('manager_salesperson_bindings')
          .select('salesperson_id')
          .eq('manager_id', user.id)
          .eq('active', true),
        supabase
          .from('group_members')
          .select(`
            member_user_id,
            manager_groups!inner(manager_user_id)
          `)
          .eq('manager_groups.manager_user_id', user.id),
        supabase
          .from('profiles')
          .select('id')
          .eq('manager_id', user.id)
          .eq('is_active', true),
        supabase
          .from('user_data_shares')
          .select('subject_user_id')
          .eq('viewer_user_id', user.id)
          .eq('active', true)
          .eq('scope_orders', true)
      ]);

      if (bindingsRes.error) throw bindingsRes.error;
      if (groupMembersRes.error) throw groupMembersRes.error;
      if (legacyRes.error) throw legacyRes.error;
      if (sharesRes.error) throw sharesRes.error;

      // Combine all member IDs + manager's own ID
      const bindingMemberIds = bindingsRes.data?.map(b => b.salesperson_id) || [];
      const groupMemberIds = groupMembersRes.data?.map(gm => gm.member_user_id) || [];
      const legacyMemberIds = legacyRes.data?.map(p => p.id) || [];
      const sharedSubjectIds = sharesRes.data?.map(s => s.subject_user_id) || [];
      const allMemberIds = [...new Set([
        user.id,
        ...bindingMemberIds,
        ...groupMemberIds,
        ...legacyMemberIds,
        ...sharedSubjectIds
      ])];

      // Fetch orders for manager + team (either flagged OR failed delivery)
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, status, salesperson_id, runner_status, next_delivery_date, runner_failed_reason_id, runner_comment, salesperson_action_required')
        .in('salesperson_id', allMemberIds)
        .neq('status', 'CANCELLED');

      if (ordersError) throw ordersError;

      // Filter: salesperson_action_required = true OR runner_status = FAILED_DELIVERY
      const actionRequired = orders?.filter(order => 
        order.salesperson_action_required === true || 
        (order.runner_status as string) === 'FAILED_DELIVERY'
      ) || [];

      // Fetch salesperson info
      const { data: salespersons, error: usersError } = await supabase
        .from('user_directory')
        .select('id, display_name, email')
        .in('id', allMemberIds);

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

      actionRequired.forEach(order => {
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
        .filter(sp => sp.total > 0)
        .sort((a, b) => b.total - a.total);

      return {
        systemTotal: actionRequired.length,
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

      // Fetch orders (either flagged OR failed delivery)
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, status, salesperson_id, runner_status, next_delivery_date, runner_failed_reason_id, runner_comment, salesperson_action_required')
        .neq('status', 'CANCELLED');

      if (ordersError) throw ordersError;

      // Filter: salesperson_action_required = true OR runner_status = FAILED_DELIVERY
      const actionRequired = orders?.filter(order => 
        order.salesperson_action_required === true || 
        (order.runner_status as string) === 'FAILED_DELIVERY'
      ) || [];

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

      actionRequired.forEach(order => {
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
        systemTotal: actionRequired.length,
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
