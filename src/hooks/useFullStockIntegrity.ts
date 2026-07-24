import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FullStockIntegrityRow {
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
  driver_allocate_qty: number;
  driver_return_qty: number;
  computed_balance: number;
  stored_balance: number;
  delta: number;
  status: 'OK' | 'MISMATCH' | 'NEGATIVE';
  issue_label: string | null;
}

export interface StockIntegritySummary {
  total_skus: number;
  healthy_count: number;
  mismatch_count: number;
  negative_count: number;
  health_percentage: number;
}

export interface RebuildResult {
  success: boolean;
  dry_run: boolean;
  total_skus_scanned: number;
  ok_count: number;
  mismatch_count: number;
  negative_count: number;
  missing_deductions_fixed: number;
}

export interface QuickRepairResult {
  success: boolean;
  dry_run: boolean;
  missing_deductions: number;
  fixed_deductions: number;
  queue_cleared: number;
  errors: string[];
  fixed_orders: string[];
}

// Fetch full stock integrity audit
export function useFullStockIntegrityAudit(
  ownerFilter?: string | string[] | null,
  statusFilter?: string | null
) {
  return useQuery({
    queryKey: ['full-stock-integrity-audit', ownerFilter, statusFilter],
    queryFn: async () => {
      const normalizedStatus = statusFilter === 'all' ? null : statusFilter ?? null;

      if (Array.isArray(ownerFilter)) {
        const ownerIds = Array.from(new Set(ownerFilter.filter(Boolean)));
        if (ownerIds.length === 0) return [] as FullStockIntegrityRow[];

        const rows = await Promise.all(
          ownerIds.map(async (ownerId) => {
            const { data, error } = await supabase.rpc('full_stock_integrity_audit', {
              p_owner_filter: ownerId,
              p_status_filter: normalizedStatus,
            });

            if (error) throw error;
            return (data || []) as FullStockIntegrityRow[];
          })
        );

        return rows.flat();
      }

      const { data, error } = await supabase.rpc('full_stock_integrity_audit', {
        p_owner_filter: ownerFilter === 'all' ? null : ownerFilter ?? null,
        p_status_filter: normalizedStatus
      });
      
      if (error) throw error;
      return (data || []) as FullStockIntegrityRow[];
    },
    staleTime: 0, // Always refetch
  });
}

// Fetch summary stats
export function useStockIntegritySummary(enabled = true) {
  return useQuery({
    queryKey: ['stock-integrity-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_stock_integrity_summary');
      
      if (error) throw error;
      const row = (data as unknown as StockIntegritySummary[])?.[0];
      return row || {
        total_skus: 0,
        healthy_count: 0,
        mismatch_count: 0,
        negative_count: 0,
        health_percentage: 100
      };
    },
    staleTime: 0,
    enabled,
  });
}

// Quick Repair mutation
export function useQuickRepair() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (dryRun: boolean): Promise<QuickRepairResult> => {
      const { data, error } = await supabase.rpc('repair_missing_stock_deductions', {
        p_dry_run: dryRun
      });
      
      if (error) throw new Error(error.message);
      return data as unknown as QuickRepairResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['full-stock-integrity-audit'] });
      queryClient.invalidateQueries({ queryKey: ['stock-integrity-summary'] });
      queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
      
      if (data.dry_run) {
        toast.info(`Preview: Found ${data.missing_deductions} missing deductions`);
      } else {
        toast.success(`Repair complete! Fixed ${data.fixed_deductions} deductions, cleared ${data.queue_cleared} queue items`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Quick repair failed: ${error.message}`);
    },
  });
}

// Full Rebuild mutation
export function useFullStockRebuild() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (dryRun: boolean): Promise<RebuildResult> => {
      const { data, error } = await supabase.rpc('apply_full_stock_rebuild', {
        p_dry_run: dryRun
      });
      
      if (error) throw new Error(error.message);
      return data as unknown as RebuildResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['full-stock-integrity-audit'] });
      queryClient.invalidateQueries({ queryKey: ['stock-integrity-summary'] });
      queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
      
      if (data.dry_run) {
        toast.info(`Preview: ${data.total_skus_scanned} SKUs scanned. ${data.mismatch_count} mismatches, ${data.negative_count} negative balances`);
      } else {
        toast.success(`Rebuild complete! Fixed ${data.missing_deductions_fixed} missing deductions. ${data.ok_count}/${data.total_skus_scanned} SKUs now healthy.`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Full rebuild failed: ${error.message}`);
    },
  });
}

// Summary stats from data (for filtering)
export function computeIntegritySummary(data: FullStockIntegrityRow[]) {
  const totalSkus = data.length;
  const okCount = data.filter(r => r.status === 'OK').length;
  const mismatchCount = data.filter(r => r.status === 'MISMATCH').length;
  const negativeCount = data.filter(r => r.status === 'NEGATIVE').length;
  
  return {
    totalSkus,
    healthyCount: okCount,
    mismatchCount,
    negativeCount,
    healthPercentage: totalSkus > 0 ? Math.round((okCount / totalSkus) * 100) : 100
  };
}
