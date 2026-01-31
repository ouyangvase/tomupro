import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BackfillResult {
  success: boolean;
  dryRun: boolean;
  message: string;
  results: {
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

export function useStockBackfill() {
  return useMutation({
    mutationFn: async (dryRun: boolean = true): Promise<BackfillResult> => {
      const { data, error } = await supabase.functions.invoke('backfill-stock-movements', {
        body: { dryRun }
      });
      
      if (error) throw new Error(error.message);
      return data as BackfillResult;
    },
    onSuccess: (data) => {
      if (data.dryRun) {
        toast.info(`Dry run complete. Found ${data.results.missingDeductionsCreated} missing deductions.`);
      } else {
        toast.success(`Repair complete. Fixed ${data.results.missingDeductionsCreated} deductions.`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Stock scan failed: ${error.message}`);
    },
  });
}
