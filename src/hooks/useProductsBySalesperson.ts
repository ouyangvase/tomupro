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

/**
 * Find a product by SKU code for a given salesperson.
 * SKU code is normalized (trimmed + uppercased) for matching.
 */
export async function findProductBySkuCode(
  salespersonId: string,
  skuCode: string
): Promise<{ id: string; sku_code: string | null; sku_name: string } | null> {
  const normalizedSku = skuCode.trim().toUpperCase();
  if (!normalizedSku) return null;
  
  const { data, error } = await supabase
    .from('products')
    .select('id, sku_code, sku_name')
    .eq('owner_user_id', salespersonId)
    .eq('is_active', true)
    .ilike('sku_code', normalizedSku)
    .limit(1)
    .maybeSingle();
  
  if (error) throw error;
  return data;
}
