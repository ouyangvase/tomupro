import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CancelReason {
  id: string;
  reason: string;
  is_active: boolean;
  created_at: string;
}

export function useCancelReasons(activeOnly = true) {
  return useQuery({
    queryKey: ['cancel_reasons', activeOnly],
    queryFn: async () => {
      let query = supabase
        .from('cancel_reasons')
        .select('*')
        .order('reason', { ascending: true });

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CancelReason[];
    },
  });
}
