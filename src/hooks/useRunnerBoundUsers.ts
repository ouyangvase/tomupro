import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface BoundUser {
  id: string;
  display_name: string;
  email: string | null;
  role: 'salesperson' | 'manager';
}

/**
 * Hook to fetch all users bound to the current runner.
 * This includes both salespersons (from bindings table) and managers (from manager_runner_bindings table).
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

      // Collect all user IDs
      const salespersonIds = salespersonBindings?.map(b => b.salesperson_id) || [];
      const managerIds = managerBindings?.map(b => b.manager_id) || [];
      const allUserIds = [...new Set([...salespersonIds, ...managerIds])];

      if (allUserIds.length === 0) {
        return [] as BoundUser[];
      }

      // Fetch user details from user_directory
      const { data: users, error: usersError } = await supabase
        .from('user_directory')
        .select('id, display_name, email, role')
        .in('id', allUserIds)
        .order('display_name', { ascending: true });

      if (usersError) throw usersError;

      // Create a map of which role the binding came from
      const salespersonIdSet = new Set(salespersonIds);
      const managerIdSet = new Set(managerIds);

      return (users || []).map(u => ({
        id: u.id,
        display_name: u.display_name,
        email: u.email,
        // Use the binding type to determine label role
        role: managerIdSet.has(u.id) ? 'manager' as const : 'salesperson' as const,
      })) as BoundUser[];
    },
  });
}
