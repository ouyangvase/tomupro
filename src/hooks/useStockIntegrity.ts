import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface StockIntegrityRow {
  owner_user_id: string;
  owner_name: string;
  warehouse_id: string;
  warehouse_name: string;
  product_id: string;
  sku_code: string | null;
  sku_name: string;
  inbound_qty: number;
  adjustment_qty: number;
  transfer_in_qty: number;
  transfer_out_qty: number;
  delivered_qty: number;
  computed_balance: number;
  stored_balance: number;
  diff: number;
  status: 'OK' | 'ERROR';
  suspected_issue: string | null;
  duplicate_inbound_count: number;
  duplicate_deduct_count: number;
}

export interface MovementDrilldownRow {
  id: string;
  movement_type: string;
  qty_change: number;
  reference_type: string;
  reference_id: string | null;
  order_id: string | null;
  order_code: string | null;
  inbound_tracking: string | null;
  created_at: string;
  created_by_name: string | null;
}

// Fetch stock integrity audit
export function useStockIntegrityAudit(ownerFilter?: string | null) {
  return useQuery({
    queryKey: ['stock-integrity-audit', ownerFilter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('audit_stock_integrity', {
        p_owner_filter: ownerFilter === 'all' ? null : ownerFilter ?? null
      });
      
      if (error) throw error;
      return (data || []) as StockIntegrityRow[];
    },
    staleTime: 0, // Always refetch
  });
}

// Fetch movement drilldown for a specific product/warehouse
export function useMovementDrilldown(warehouseId?: string, productId?: string) {
  return useQuery({
    queryKey: ['movement-drilldown', warehouseId, productId],
    queryFn: async () => {
      if (!warehouseId || !productId) return [];
      
      const { data, error } = await supabase.rpc('get_sku_movement_drilldown', {
        p_warehouse_id: warehouseId,
        p_product_id: productId
      });
      
      if (error) throw error;
      return (data || []) as MovementDrilldownRow[];
    },
    enabled: !!warehouseId && !!productId,
  });
}

// Summary stats from audit
export function useStockIntegritySummary(data: StockIntegrityRow[]) {
  const totalSkus = data.length;
  const errorCount = data.filter(r => r.status === 'ERROR').length;
  const negativeBalanceCount = data.filter(r => r.computed_balance < 0).length;
  const overDeductedCount = data.filter(r => r.suspected_issue?.includes('Over-deducted')).length;
  
  return {
    totalSkus,
    errorCount,
    negativeBalanceCount,
    overDeductedCount,
    healthyCount: totalSkus - errorCount,
    healthPercentage: totalSkus > 0 ? Math.round((totalSkus - errorCount) / totalSkus * 100) : 100
  };
}
