import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface BoundUser {
  id: string;
  display_name: string;
  email: string | null;
  role: 'salesperson' | 'manager';
  warehouse_id: string | null;
}

/**
 * Hook to fetch all users bound to the current runner.
 * Uses the v_runner_target_users view which unifies salesperson and manager bindings.
 * Returns BOTH salespersons and managers with proper warehouse resolution.
 */
export function useRunnerBoundUsers(runnerIdOverride?: string) {
  const { user } = useAuth();
  const runnerScopeId = runnerIdOverride || user?.id;

  return useQuery({
    queryKey: ['runner-bound-users', runnerScopeId],
    enabled: Boolean(runnerScopeId),
    queryFn: async () => {
      if (!runnerScopeId) return [] as BoundUser[];

      // Use the unified view that combines salesperson and manager bindings
      const { data, error } = await supabase
        .from('v_runner_target_users')
        .select('*')
        .eq('runner_id', runnerScopeId)
        .order('name', { ascending: true });

      if (error) {
        throw error;
      }

      // Deduplicate by user_id, keep users with warehouses preferred
      const userMap = new Map<string, BoundUser>();
      
      (data || []).forEach(row => {
        if (row.user_id) {
          const existing = userMap.get(row.user_id);
          // Prefer entries with warehouse_id
          if (!existing || (!existing.warehouse_id && row.warehouse_id)) {
            userMap.set(row.user_id, {
              id: row.user_id,
              display_name: row.name || 'Unknown',
              email: row.email,
              role: (row.role as 'salesperson' | 'manager') || 'salesperson',
              warehouse_id: row.warehouse_id,
            });
          }
        }
      });

      const result = Array.from(userMap.values());

      return result;
    },
  });
}
