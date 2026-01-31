

# Plan: Fix Stock Balance Calculation and Run Backfill

## Problem Summary

The inventory page is showing incorrect balances because stock deductions were never created for 177 delivered orders. For example:

| Product | Inbound | Delivered Orders | Current Deductions | Current Balance | Expected Balance |
|---------|---------|------------------|-------------------|-----------------|------------------|
| FT02 - GOLD | 12 | 8 (across 6 orders) | -1 | 11 | 4 |
| FT02 - BLACK | 8 | ? | ? | 7 | ? |

**Root Cause**: The delivery queue trigger failed for 185 orders with "Insufficient stock" validation errors, creating a chicken-and-egg problem where orders can't deduct because earlier orders blocked them.

## Solution

### Part 1: Optimize Edge Function (Immediate Fix)

The current backfill function times out because it processes each order individually with many database round-trips. We need to optimize it to use batch operations.

### Part 2: Create a Database Function for Bulk Repair

Create a PostgreSQL function that performs the backfill directly in the database, avoiding the edge function timeout issue.

### Changes Required

| File | Change |
|------|--------|
| Database Migration | Create `repair_missing_stock_deductions()` function |
| `src/pages/admin/StockIntegrityScan.tsx` | Add button to call the new RPC function |
| `src/hooks/useStockBackfill.ts` | Add alternative method using RPC |

## Technical Implementation

### 1. Database Function for Bulk Repair

Create a new PostgreSQL function that:
- Scans all DELIVERED orders without proper deductions
- Creates missing stock movements in bulk
- Updates order flags
- Returns summary statistics

```sql
CREATE OR REPLACE FUNCTION repair_missing_stock_deductions(p_dry_run BOOLEAN DEFAULT true)
RETURNS JSON AS $$
DECLARE
  v_missing_count INT := 0;
  v_fixed_count INT := 0;
  v_errors TEXT[] := '{}';
BEGIN
  -- Find all DELIVERED orders with missing deductions
  -- For each order_item, check if a DELIVER_DEDUCT exists
  -- If not, create one using the correct warehouse
  
  -- In dry run mode, just count
  -- In apply mode, insert the movements
  
  RETURN json_build_object(
    'dry_run', p_dry_run,
    'missing_count', v_missing_count,
    'fixed_count', v_fixed_count,
    'errors', v_errors
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 2. UI Updates

Add a new button that calls the database function directly, bypassing the edge function:

```typescript
// New mutation in useStockBackfill.ts
export function useQuickRepair() {
  return useMutation({
    mutationFn: async (dryRun: boolean) => {
      const { data, error } = await supabase.rpc('repair_missing_stock_deductions', {
        p_dry_run: dryRun
      });
      if (error) throw error;
      return data;
    }
  });
}
```

### 3. Immediate Manual Fix (Alternative)

If the database function approach is too complex, we can simplify the edge function to:
1. Process orders in smaller batches (50 at a time)
2. Use batch inserts instead of individual inserts
3. Return partial progress

## Expected Results After Fix

| Metric | Before | After |
|--------|--------|-------|
| FT02 - GOLD balance | 11 | 4 |
| FT02 - BLACK balance | 7 | ~1-2 |
| Orders with stock_deducted=true | 887 | 1,064 |
| delivery_queue FAILED items | 185 | 0 (marked as REPROCESSED) |

## Summary

The stock balances are showing incorrectly because the deduction movements were never created. The fix requires:

1. **Database migration**: Create a bulk repair function that runs inside PostgreSQL
2. **UI update**: Add a button to trigger the repair via RPC
3. **Hook update**: Add method to call the new RPC function

After running the repair, the inventory page will automatically show correct balances because it reads from `stock_balance_view` which sums all movements.

