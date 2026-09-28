import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { StockBalance, Warehouse } from '@/types/database';

export function useStockBalance() {
  return useQuery({
    queryKey: ['stock-balance'],
    queryFn: async () => {
      // Supabase's default response limit is 1,000 rows. Adjustments and
      // stock-transfer selectors need the same complete SKU set as the
      // paginated Stock Balance page, so load the view in bounded pages.
      const pageSize = 1000;
      const rows: StockBalance[] = [];

      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from('stock_balance_view')
          .select('*')
          .order('owner_name', { ascending: true })
          .order('warehouse_name', { ascending: true })
          .order('sku_code', { ascending: true, nullsFirst: false })
          .order('product_id', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;
        rows.push(...((data || []) as StockBalance[]));
        if (!data || data.length < pageSize) break;
      }

      return rows;
    },
  });
}

export function useWarehouses() {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return data as Warehouse[];
    },
  });
}
