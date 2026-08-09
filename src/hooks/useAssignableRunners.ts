import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type RunnerAssignmentScope =
  | { type: 'all' }
  | { type: 'salesperson'; salespersonId: string }
  | { type: 'manager'; managerId: string };

export interface AssignableRunner {
  id: string;
  display_name: string;
  email: string | null;
}

/**
 * The single UI source for runner assignment choices.
 * The database trigger is the authoritative write guard; this hook keeps
 * every selector aligned with the same binding scope before the user submits.
 */
export function useAssignableRunners(scope: RunnerAssignmentScope | null) {
  return useQuery({
    queryKey: ['assignable-runners', scope],
    enabled: Boolean(scope),
    queryFn: async (): Promise<AssignableRunner[]> => {
      if (!scope) return [];

      if (scope.type === 'all') {
        const { data, error } = await supabase
          .from('user_directory')
          .select('id, display_name, email, role')
          .eq('role', 'runner')
          .order('display_name', { ascending: true });

        if (error) throw error;
        return (data || []).map(({ id, display_name, email }) => ({ id, display_name, email }));
      }

      const runnerIdsQuery = scope.type === 'salesperson'
        ? supabase
          .from('bindings')
          .select('runner_id')
          .eq('salesperson_id', scope.salespersonId)
          .eq('active', true)
        : supabase
          .from('manager_runner_bindings')
          .select('runner_id')
          .eq('manager_id', scope.managerId);

      const { data: bindingRows, error: bindingError } = await runnerIdsQuery;
      if (bindingError) throw bindingError;

      const runnerIds = [...new Set((bindingRows || []).map((row) => row.runner_id).filter(Boolean))];
      if (runnerIds.length === 0) return [];

      const { data, error } = await supabase
        .from('user_directory')
        .select('id, display_name, email, role')
        .eq('role', 'runner')
        .in('id', runnerIds)
        .order('display_name', { ascending: true });

      if (error) throw error;
      return (data || []).map(({ id, display_name, email }) => ({ id, display_name, email }));
    },
  });
}
