import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useProductsBySalesperson(salespersonId: string | null) {
  return useQuery({
    queryKey: ['products', 'by-salesperson', salespersonId],
    queryFn: async () => {
      if (!salespersonId) return [];
      
      const { data, error } = await supabase
        .from('products')
        .select('id, sku_code, sku_name')
        .eq('owner_user_id', salespersonId)
        .eq('is_active', true)
        .order('sku_code', { ascending: true });
      
      if (error) throw error;
      return data as Array<{ id: string; sku_code: string | null; sku_name: string }>;
    },
    enabled: !!salespersonId,
  });
}
