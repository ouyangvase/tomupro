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
      
      console.log('[useProductsByOwner] Fetching products for owner:', ownerUserId);
      
      const { data, error } = await supabase
        .from('products')
        .select('id, sku_code, sku_name, owner_user_id')
        .eq('owner_user_id', ownerUserId)
        .eq('is_active', true)
        .order('sku_code', { ascending: true });
      
      if (error) throw error;
      
      console.log('[useProductsByOwner] Fetched products count:', data?.length, 'for owner:', ownerUserId);
      
      // Verify all products belong to the correct owner (sanity check)
      const mismatchedProducts = data?.filter(p => p.owner_user_id !== ownerUserId);
      if (mismatchedProducts && mismatchedProducts.length > 0) {
        console.error('[useProductsByOwner] CRITICAL: Products returned for wrong owner!', mismatchedProducts);
      }
      
      return data as Array<{ id: string; sku_code: string | null; sku_name: string; owner_user_id: string }>;
    },
    enabled: !!ownerUserId,
    staleTime: 0, // Always fetch fresh data
  });
}

/**
 * Alias for useProductsByOwner - used in order context
 * to make intent clearer.
 */
export function useOrderOwnerProducts(ownerUserId: string | null) {
  return useProductsByOwner(ownerUserId);
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
