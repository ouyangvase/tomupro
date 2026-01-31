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
