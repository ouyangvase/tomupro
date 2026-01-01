import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Binding } from '@/types/database';

export function useBindings(salespersonId?: string) {
  return useQuery({
    queryKey: ['bindings', salespersonId],
    queryFn: async () => {
      let query = supabase
        .from('bindings')
        .select(`
          *,
          salesperson:profiles!bindings_salesperson_id_fkey(id, display_name, email),
          runner:profiles!bindings_runner_id_fkey(id, display_name, email)
        `)
        .eq('active', true);

      if (salespersonId) {
        query = query.eq('salesperson_id', salespersonId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Binding[];
    },
  });
}
