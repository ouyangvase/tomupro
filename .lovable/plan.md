

# Plan: Stock Balance Scan and Repair System

## Problem Summary

Based on database analysis, there are significant stock inconsistencies:

| Status | Count | Issue |
|--------|-------|-------|
| DELIVERED orders with `stock_deducted=true` | 887 | Correct |
| DELIVERED orders with `stock_deducted=false` | 177 | Missing deductions |
| delivery_queue FAILED items | 185 | Blocked due to validation errors |
| Total stock movements | 1,353 | Inconsistent with order count |

**Example**: FT02 - GOLD (LUXECARVE BANGLE) has:
- Inbound: +12 units
- Deductions: Only -1 (SALE_DEDUCT)
- Current balance: 11 units
- Actual delivered via orders: 8 units
- **Missing deductions: ~7 units**

## Solution Overview

Create an admin-accessible Stock Integrity Scan feature that:
1. Runs a full inventory audit via the existing `backfill-stock-movements` edge function
2. Provides dry-run capability to preview changes before applying
3. Shows detailed results in the admin UI
4. Allows triggering the repair with one click

### Changes Required

| File | Change |
|------|--------|
| `src/pages/admin/ReconciliationAdmin.tsx` | Add "Stock Integrity Scan" section with scan/repair buttons |
| `src/hooks/useStockBackfill.ts` (new) | Hook to call backfill edge function with dry-run toggle |

## Implementation Details

### 1. New Hook: useStockBackfill

```typescript
// src/hooks/useStockBackfill.ts
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BackfillResult {
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
```

### 2. Update ReconciliationAdmin.tsx

Add a new "Stock Integrity" section with:

```typescript
// New UI section in ReconciliationAdmin.tsx

// State
const [scanResults, setScanResults] = useState<BackfillResult | null>(null);
const { mutate: runBackfill, isPending: isScanning } = useStockBackfill();

// Handlers
const handleDryRun = () => {
  runBackfill(true, {
    onSuccess: (data) => setScanResults(data)
  });
};

const handleApplyFix = () => {
  runBackfill(false, {
    onSuccess: (data) => {
      setScanResults(data);
      queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
      queryClient.invalidateQueries({ queryKey: ['filtered-stock-balance'] });
    }
  });
};

// UI Component
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Database className="h-5 w-5" />
      Stock Integrity Scan
    </CardTitle>
    <CardDescription>
      Scan all delivered orders and ensure stock movements are correctly recorded
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="flex gap-2">
      <Button 
        variant="outline" 
        onClick={handleDryRun}
        disabled={isScanning}
      >
        <Search className="h-4 w-4 mr-2" />
        {isScanning ? 'Scanning...' : 'Preview Scan (Dry Run)'}
      </Button>
      
      {scanResults && !scanResults.dryRun && (
        <Badge variant="success">
          Last repair: {scanResults.results.missingDeductionsCreated} fixed
        </Badge>
      )}
    </div>
    
    {/* Results Display */}
    {scanResults && (
      <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Orders Scanned</p>
            <p className="text-2xl font-bold">{scanResults.results.deliveredOrdersScanned}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Missing Deductions</p>
            <p className="text-2xl font-bold text-orange-500">
              {scanResults.results.missingDeductionsCreated}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Duplicates Found</p>
            <p className="text-2xl font-bold">
              {scanResults.results.duplicateDeductionsReversed}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Warehouse Mismatches</p>
            <p className="text-2xl font-bold">
              {scanResults.results.warehouseTypeMismatches}
            </p>
          </div>
        </div>
        
        {/* Errors */}
        {scanResults.results.errors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Errors Found ({scanResults.results.errors.length})</AlertTitle>
            <AlertDescription>
              <ul className="text-xs mt-2 space-y-1 max-h-32 overflow-y-auto">
                {scanResults.results.errors.slice(0, 10).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {scanResults.results.errors.length > 10 && (
                  <li>...and {scanResults.results.errors.length - 10} more</li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        
        {/* Apply Fix Button */}
        {scanResults.dryRun && scanResults.results.missingDeductionsCreated > 0 && (
          <Button 
            variant="destructive" 
            onClick={handleApplyFix}
            disabled={isScanning}
          >
            <Wrench className="h-4 w-4 mr-2" />
            Apply Fix ({scanResults.results.missingDeductionsCreated} deductions)
          </Button>
        )}
        
        {!scanResults.dryRun && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Repair Complete</AlertTitle>
            <AlertDescription>
              Stock balance has been updated. Refresh the inventory page to see changes.
            </AlertDescription>
          </Alert>
        )}
      </div>
    )}
  </CardContent>
</Card>
```

## Visual Flow

```text
+--------------------------------------------------+
|  Stock Integrity Scan                             |
|  Scan all delivered orders and verify stock       |
|                                                   |
|  [Preview Scan (Dry Run)]                         |
|                                                   |
|  +----------------------------------------------+ |
|  | Orders Scanned: 1,064                        | |
|  | Missing Deductions: 177                      | |
|  | Duplicates Found: 0                          | |
|  | Warehouse Mismatches: 12                     | |
|  |                                              | |
|  | [Apply Fix (177 deductions)]                 | |
|  +----------------------------------------------+ |
+--------------------------------------------------+
```

## Technical Notes

1. **Edge Function**: The `backfill-stock-movements` function already exists and handles:
   - Scanning all DELIVERED orders for missing deductions
   - Creating DELIVER_DEDUCT movements for any missing
   - Reversing duplicate deductions
   - Fixing warehouse type mismatches
   - Scanning FAILED/CANCELLED orders for missing returns
   - Logging all changes to audit_logs

2. **Dry Run Mode**: When `dryRun=true`, the function calculates what would change but makes no modifications

3. **Idempotency**: The function handles concurrent runs gracefully via unique constraints

4. **Role-Aware**: Uses `get_stock_owner_warehouse` RPC to ensure stock is deducted from the correct warehouse type (MANAGER vs SALESPERSON)

## Expected Results After Running

| Metric | Before | After |
|--------|--------|-------|
| DELIVERED orders with proper deduction | 887 | 1,064 |
| FT02 - GOLD balance | 11 | 3 (12 inbound - 8 delivered - 1 other) |
| Stock movements accuracy | ~60% | 100% |

