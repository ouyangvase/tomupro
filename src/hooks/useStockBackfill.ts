import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BackfillResult {
  success: boolean;
  dryRun: boolean;
  forceReprocess?: boolean;
  message: string;
  results: {
    failedQueueCleared: number;
    deliveredOrdersScanned: number;
    deliveredNotDeductedFixed: number;
    missingDeductionsCreated: number;
    duplicateDeductionsReversed: number;
    failedOrdersScanned: number;
    missingReturnsCreated: number;
    duplicateReturnsReversed: number;
    warehouseTypeMismatches: number;
    errors: string[];
    fixedOrders: string[];
  };
}

export interface BackfillOptions {
  dryRun: boolean;
  forceReprocess?: boolean;
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

export function useStockBackfill() {
  return useMutation({
    mutationFn: async (options: BackfillOptions): Promise<BackfillResult> => {
      const { data, error } = await supabase.functions.invoke('backfill-stock-movements', {
        body: { dryRun: options.dryRun, forceReprocess: options.forceReprocess ?? false }
      });
      
      if (error) throw new Error(error.message);
      return data as BackfillResult;
    },
    onSuccess: (data) => {
      if (data.dryRun) {
        const issues = data.results.missingDeductionsCreated + 
                       data.results.duplicateDeductionsReversed + 
                       data.results.warehouseTypeMismatches +
                       data.results.failedQueueCleared;
        toast.info(`Dry run complete. Found ${issues} issues to fix.`);
      } else {
        toast.success(`Repair complete. Fixed ${data.results.missingDeductionsCreated} deductions.`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Stock scan failed: ${error.message}`);
    },
  });
}

// Fast database-level repair function (no edge function timeout issues)
export function useQuickRepair() {
  return useMutation({
    mutationFn: async (dryRun: boolean): Promise<QuickRepairResult> => {
      const { data, error } = await supabase.rpc('repair_missing_stock_deductions', {
        p_dry_run: dryRun
      });
      
      if (error) throw new Error(error.message);
      return data as unknown as QuickRepairResult;
    },
    onSuccess: (data) => {
      if (data.dry_run) {
        toast.info(`Preview: Found ${data.missing_deductions} missing deductions, ${data.queue_cleared} failed queue items`);
      } else {
        toast.success(`Repair complete! Fixed ${data.fixed_deductions} deductions, cleared ${data.queue_cleared} queue items`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Quick repair failed: ${error.message}`);
    },
  });
}
