import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface RunnerInboxStats {
  totalActive: number;
  assignedCount: number;
  takenCount: number;
  noDriverCount: number;
}

/**
 * Server-side counts for Runner Inbox summary cards.
 * Scope: runner_id = current user, status = READY,
 *        runner_status IN (ASSIGNED, TAKEN), status != CANCELLED.
 * BOOKING and UNASSIGNED orders are excluded — runners only see READY assigned orders.
 */
export function useRunnerInboxStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['runner-inbox-stats', user?.id],
    queryFn: async (): Promise<RunnerInboxStats> => {
      if (!user) throw new Error('Not authenticated');

      const [totalActiveRes, assignedRes, takenRes, noDriverRes] = await Promise.all([
        // Total active: READY + ASSIGNED/TAKEN only
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('runner_id', user.id)
          .eq('status', 'READY')
          .in('runner_status', ['ASSIGNED', 'TAKEN'])
          .neq('status', 'CANCELLED'),

        // Count ASSIGNED orders (READY only)
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('runner_id', user.id)
          .eq('status', 'READY')
          .eq('runner_status', 'ASSIGNED')
          .neq('status', 'CANCELLED'),

        // Count TAKEN orders (READY only)
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('runner_id', user.id)
          .eq('status', 'READY')
          .eq('runner_status', 'TAKEN')
          .neq('status', 'CANCELLED'),

        // Count orders with no driver assigned (READY + ASSIGNED/TAKEN)
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('runner_id', user.id)
          .eq('status', 'READY')
          .in('runner_status', ['ASSIGNED', 'TAKEN'])
          .neq('status', 'CANCELLED')
          .is('driver_id', null),
      ]);

      const totalActive = totalActiveRes.count || 0;
      const assignedCount = assignedRes.count || 0;
      const takenCount = takenRes.count || 0;
      const noDriverCount = noDriverRes.count || 0;

      return {
        totalActive,
        assignedCount,
        takenCount,
        noDriverCount,
      };
    },
    enabled: !!user,
    refetchInterval: 120000,
  });
}
