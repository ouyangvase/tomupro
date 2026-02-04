import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface RecentAdjustmentsParams {
  page: number;
  pageSize: number;
  skuFilter?: string;
  userFilter?: string;
}

export interface AdjustmentWithDetails {
  id: string;
  created_at: string;
  product_id: string;
  warehouse_id: string;
  movement_type: string;
  qty_change: number;
  created_by: string;
  reference_type: string;
  // Joined fields
  sku_code: string | null;
  sku_name: string;
  warehouse_name: string;
  created_by_name: string;
}

export function useRecentAdjustments({ page, pageSize, skuFilter, userFilter }: RecentAdjustmentsParams) {
  return useQuery({
    queryKey: ['recent-adjustments', page, pageSize, skuFilter, userFilter],
    queryFn: async () => {
      // Build base query with joins
      let query = supabase
        .from('stock_movements')
        .select(`
          id,
          created_at,
          product_id,
          warehouse_id,
          movement_type,
          qty_change,
          created_by,
          reference_type,
          products!inner(sku_code, sku_name),
          warehouses!inner(name),
          profiles!stock_movements_created_by_fkey(display_name)
        `, { count: 'exact' })
        .in('movement_type', ['RETURN', 'ADJUSTMENT'])
        .eq('reference_type', 'MANUAL')
        .order('created_at', { ascending: false });

      // Apply SKU filter
      if (skuFilter) {
        query = query.or(`products.sku_code.ilike.%${skuFilter}%,products.sku_name.ilike.%${skuFilter}%`);
      }

      // Apply user filter
      if (userFilter) {
        query = query.eq('created_by', userFilter);
      }

      // Apply pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      
      if (error) throw error;

      // Transform to flat structure
      const adjustments: AdjustmentWithDetails[] = (data || []).map((row: any) => ({
        id: row.id,
        created_at: row.created_at,
        product_id: row.product_id,
        warehouse_id: row.warehouse_id,
        movement_type: row.movement_type,
        qty_change: row.qty_change,
        created_by: row.created_by,
        reference_type: row.reference_type,
        sku_code: row.products?.sku_code || null,
        sku_name: row.products?.sku_name || 'Unknown',
        warehouse_name: row.warehouses?.name || 'Unknown',
        created_by_name: row.profiles?.display_name || 'Unknown',
      }));

      return {
        data: adjustments,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      };
    },
  });
}

// Hook to get unique users who made adjustments (for filter dropdown)
export function useAdjustmentUsers() {
  return useQuery({
    queryKey: ['adjustment-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('created_by, profiles!stock_movements_created_by_fkey(display_name)')
        .in('movement_type', ['RETURN', 'ADJUSTMENT'])
        .eq('reference_type', 'MANUAL');
      
      if (error) throw error;

      // Get unique users
      const uniqueUsers = new Map<string, string>();
      (data || []).forEach((row: any) => {
        if (row.created_by && !uniqueUsers.has(row.created_by)) {
          uniqueUsers.set(row.created_by, row.profiles?.display_name || 'Unknown');
        }
      });

      return Array.from(uniqueUsers.entries()).map(([id, name]) => ({
        id,
        name,
      }));
    },
  });
}
