import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { StockBalance, Warehouse } from '@/types/database';

export function useStockBalance() {
  return useQuery({
    queryKey: ['stock-balance'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_balance_view')
        .select('*');
      if (error) throw error;
      return data as StockBalance[];
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
