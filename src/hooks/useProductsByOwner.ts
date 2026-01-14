import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fetch products owned by a specific user (salesperson or manager).
 * Used by runner inbound to populate product dropdown after selecting target user.
 */
export function useProductsByOwner(ownerUserId: string | null) {
  return useQuery({
    queryKey: ['products', 'by-owner', ownerUserId],
    queryFn: async () => {
      if (!ownerUserId) return [];
      
      const { data, error } = await supabase
        .from('products')
        .select('id, sku_code, sku_name')
        .eq('owner_user_id', ownerUserId)
        .eq('is_active', true)
        .order('sku_code', { ascending: true });
      
      if (error) throw error;
      return data as Array<{ id: string; sku_code: string | null; sku_name: string }>;
    },
    enabled: !!ownerUserId,
  });
}

/**
 * Find a product by SKU code for a given owner user.
 * SKU code is normalized (trimmed + uppercased) for matching.
 */
export async function findProductBySkuCode(
  ownerUserId: string,
  skuCode: string
): Promise<{ id: string; sku_code: string | null; sku_name: string } | null> {
  const normalizedSku = skuCode.trim().toUpperCase();
  if (!normalizedSku) return null;
  
  const { data, error } = await supabase
    .from('products')
    .select('id, sku_code, sku_name')
    .eq('owner_user_id', ownerUserId)
    .eq('is_active', true)
    .ilike('sku_code', normalizedSku)
    .limit(1)
    .maybeSingle();
  
  if (error) throw error;
  return data;
}
