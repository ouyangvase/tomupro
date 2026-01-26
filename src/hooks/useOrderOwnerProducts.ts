import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fetch products filtered by a specific order owner.
 * Used in OrderEditor and ImportOrdersDialog to only show products
 * belonging to the selected order_owner_id.
 * 
 * This ensures:
 * - Salesperson can only use their own products
 * - Manager "My Order" uses only manager's products
 * - Manager "Team Order" uses only selected team member's products
 */
export function useOrderOwnerProducts(ownerUserId: string | null) {
  return useQuery({
    queryKey: ['products', 'order-owner', ownerUserId],
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
