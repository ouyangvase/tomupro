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
 * Only returns users who have an ACTIVE warehouse.
 */
export function useRunnerBoundUsers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['runner-bound-users', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [] as BoundUser[];

      console.log('[useRunnerBoundUsers] Fetching bound users for runner ID:', user.id);

      // Use the unified view that combines salesperson and manager bindings
      const { data, error } = await supabase
        .from('v_runner_target_users')
        .select('*')
        .eq('runner_id', user.id)
        .order('name', { ascending: true });

      if (error) {
        console.error('[useRunnerBoundUsers] Error fetching from view:', error);
        throw error;
      }

      console.log('[useRunnerBoundUsers] Raw results from view:', data?.length);

      // Filter to only users with warehouses and deduplicate by user_id
      const userMap = new Map<string, BoundUser>();
      
      (data || []).forEach(row => {
        if (row.user_id && row.warehouse_id && !userMap.has(row.user_id)) {
          userMap.set(row.user_id, {
            id: row.user_id,
            display_name: row.name || 'Unknown',
            email: row.email,
            role: (row.role as 'salesperson' | 'manager') || 'salesperson',
            warehouse_id: row.warehouse_id,
          });
        }
      });

      const result = Array.from(userMap.values());

      console.log('[useRunnerBoundUsers] Final users with warehouses:', result.length);
      console.log('[useRunnerBoundUsers] Roles breakdown:', {
        salespersons: result.filter(u => u.role === 'salesperson').length,
        managers: result.filter(u => u.role === 'manager').length,
      });

      return result;
    },
  });
}
