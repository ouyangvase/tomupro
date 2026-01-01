import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Binding } from '@/types/database';

interface BindingFilters {
  salespersonId?: string;
  runnerId?: string;
  active?: boolean;
}

export function useBindings(filters?: BindingFilters | string) {
  // Support both old string format and new object format
  const normalizedFilters: BindingFilters = typeof filters === 'string' 
    ? { salespersonId: filters }
    : filters || {};

  return useQuery({
    queryKey: ['bindings', normalizedFilters],
    queryFn: async () => {
      let query = supabase
        .from('bindings')
        .select(`
          *,
          salesperson:profiles!bindings_salesperson_id_fkey(id, display_name, email),
          runner:profiles!bindings_runner_id_fkey(id, display_name, email)
        `);

      if (normalizedFilters.active !== undefined) {
        query = query.eq('active', normalizedFilters.active);
      } else {
        query = query.eq('active', true);
      }

      if (normalizedFilters.salespersonId) {
        query = query.eq('salesperson_id', normalizedFilters.salespersonId);
      }

      if (normalizedFilters.runnerId) {
        query = query.eq('runner_id', normalizedFilters.runnerId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Binding[];
    },
  });
}
