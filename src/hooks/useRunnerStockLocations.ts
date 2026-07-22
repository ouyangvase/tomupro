import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { RunnerStockLocation, StockBalance } from '@/types/database';

type StockLocationRowRef = Pick<StockBalance, 'warehouse_id' | 'product_id'>;

const stockLocationKey = (warehouseId: string, productId: string) => `${warehouseId}:${productId}`;
const untypedSupabase = supabase as any;

export function getRunnerStockLocationKey(row: StockLocationRowRef) {
  return stockLocationKey(row.warehouse_id, row.product_id);
}

export function useRunnerStockLocations(rows: StockLocationRowRef[]) {
  const { profile } = useAuth();

  const rowRefs = useMemo(() => {
    const seen = new Set<string>();
    return rows
      .filter((row) => row.warehouse_id && row.product_id)
      .filter((row) => {
        const key = getRunnerStockLocationKey(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [rows]);

  const productIds = useMemo(() => Array.from(new Set(rowRefs.map((row) => row.product_id))), [rowRefs]);
  const warehouseIds = useMemo(() => Array.from(new Set(rowRefs.map((row) => row.warehouse_id))), [rowRefs]);

  return useQuery({
    queryKey: [
      'runner-stock-locations',
      profile?.id,
      rowRefs.map((row) => getRunnerStockLocationKey(row)).sort().join('|'),
    ],
    enabled: profile?.role === 'runner' && !!profile?.id && rowRefs.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const rowKeys = new Set(rowRefs.map((row) => getRunnerStockLocationKey(row)));
      const { data, error } = await untypedSupabase
        .from('runner_stock_locations')
        .select('*')
        .eq('runner_id', profile!.id)
        .in('product_id', productIds)
        .in('warehouse_id', warehouseIds);

      if (error) throw error;

      return ((data || []) as RunnerStockLocation[]).reduce<Record<string, RunnerStockLocation>>((acc, note) => {
        const key = stockLocationKey(note.warehouse_id, note.product_id);
        if (rowKeys.has(key)) acc[key] = note;
        return acc;
      }, {});
    },
  });
}

export function useUpsertRunnerStockLocation() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      warehouseId,
      productId,
      remark,
    }: {
      warehouseId: string;
      productId: string;
      remark: string;
    }) => {
      if (!profile?.id || profile.role !== 'runner') {
        throw new Error('Only runner users can edit stock location remarks.');
      }

      const trimmedRemark = remark.trim();
      if (trimmedRemark.length > 180) {
        throw new Error('Stock location remark must be 180 characters or less.');
      }

      const { data, error } = await untypedSupabase
        .from('runner_stock_locations')
        .upsert({
          runner_id: profile.id,
          warehouse_id: warehouseId,
          product_id: productId,
          remark: trimmedRemark,
          updated_by: profile.id,
        }, {
          onConflict: 'runner_id,warehouse_id,product_id',
        })
        .select()
        .single();

      if (error) throw error;
      return data as RunnerStockLocation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-stock-locations', profile?.id] });
      toast({ title: 'Stock location saved' });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Unable to save stock location',
        description: error.message,
      });
    },
  });
}
