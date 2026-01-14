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
 * This includes both salespersons (from bindings table) and managers (from manager_runner_bindings table).
 * Only returns users who have an ACTIVE warehouse.
 */
export function useRunnerBoundUsers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['runner-bound-users', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return [] as BoundUser[];

      // Fetch salesperson bindings for this runner
      const { data: salespersonBindings, error: spError } = await supabase
        .from('bindings')
        .select('salesperson_id')
        .eq('runner_id', user.id)
        .eq('active', true);

      if (spError) throw spError;

      // Fetch manager bindings for this runner
      const { data: managerBindings, error: mgrError } = await supabase
        .from('manager_runner_bindings')
        .select('manager_id')
        .eq('runner_id', user.id);

      if (mgrError) throw mgrError;

      // Collect all user IDs from both binding types
      const salespersonIds = salespersonBindings?.map(b => b.salesperson_id) || [];
      const managerIds = managerBindings?.map(b => b.manager_id) || [];
      const allUserIds = [...new Set([...salespersonIds, ...managerIds])];

      console.log('[useRunnerBoundUsers] Salesperson IDs from bindings:', salespersonIds.length);
      console.log('[useRunnerBoundUsers] Manager IDs from manager_runner_bindings:', managerIds.length);
      console.log('[useRunnerBoundUsers] Total unique user IDs:', allUserIds.length);

      if (allUserIds.length === 0) {
        console.log('[useRunnerBoundUsers] No bound users found');
        return [] as BoundUser[];
      }

      // Fetch profiles with their roles (user_directory has role from profiles)
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, email, role, is_active')
        .in('id', allUserIds)
        .eq('is_active', true)
        .in('role', ['salesperson', 'manager'])
        .order('display_name', { ascending: true });

      if (profilesError) throw profilesError;

      // Fetch active warehouses for these users
      const { data: warehouses, error: warehousesError } = await supabase
        .from('warehouses')
        .select('id, owner_user_id')
        .in('owner_user_id', allUserIds)
        .eq('is_active', true);

      if (warehousesError) throw warehousesError;

      // Create warehouse lookup map
      const warehouseMap = new Map<string, string>();
      (warehouses || []).forEach(w => {
        warehouseMap.set(w.owner_user_id, w.id);
      });

      console.log('[useRunnerBoundUsers] Profiles found:', profiles?.length);
      console.log('[useRunnerBoundUsers] Active warehouses found:', warehouses?.length);

      // Filter to only users with active warehouses and map to result
      const result = (profiles || [])
        .filter(p => warehouseMap.has(p.id))
        .map(p => ({
          id: p.id,
          display_name: p.display_name,
          email: p.email,
          // Use actual role from profile, not binding type
          role: p.role as 'salesperson' | 'manager',
          warehouse_id: warehouseMap.get(p.id) || null,
        }));

      console.log('[useRunnerBoundUsers] Final users with warehouses:', result.length);
      console.log('[useRunnerBoundUsers] Roles breakdown:', {
        salespersons: result.filter(u => u.role === 'salesperson').length,
        managers: result.filter(u => u.role === 'manager').length,
      });

      return result as BoundUser[];
    },
  });
}
