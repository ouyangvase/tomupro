
# Plan: Fix Stock Balance Discrepancies with Enhanced Backfill

## Problem Analysis

Based on database investigation, there are significant stock balance discrepancies:

| Issue | Count | Example |
|-------|-------|---------|
| DELIVERED orders without stock deduction | 177 | JL275, JL306, JL311, JL332, JL345 |
| delivery_queue FAILED items | 185 | Blocked by "Insufficient stock" validation |
| Products with missing deductions | 30+ | FT02-GOLD: 7 missing deductions |

### FT02-GOLD Specific Issue
| Metric | Value |
|--------|-------|
| Inbound | +12 |
| Delivered Orders | 6 orders, 8 total qty |
| Actual Deductions | Only 1 |
| Current Balance | 11 (WRONG) |
| Expected Balance | 12 - 8 = **4** |

### Root Cause
1. The delivery_queue trigger has **stock validation** that blocks deductions when "insufficient stock"
2. Orders delivered out-of-sequence cause a **chicken-and-egg problem** - can't deduct because earlier orders consumed stock
3. The existing `backfill-stock-movements` function **has never been executed** (no audit logs found)

## Solution

Enhance the backfill function to:
1. **Skip stock validation entirely** - for already-delivered orders, we must deduct regardless of current balance
2. **Process ALL delivered orders** with `stock_deducted=false`, not just those in delivery_queue
3. **Allow negative balances** during backfill (this is a data repair operation)
4. **Update order flags** to mark them as properly deducted

### Changes Required

| File | Change |
|------|--------|
| `supabase/functions/backfill-stock-movements/index.ts` | Add forceDeduct option and improve logging |

## Technical Implementation

### 1. Update Backfill Function

The existing function already has the correct logic but needs:
- Better handling of the case where warehouse might be missing
- Force creation of deductions even for products with zero/negative balance
- More comprehensive logging for debugging

```typescript
// The current function already does this correctly:
// 1. Scans ALL DELIVERED orders (regardless of stock_deducted flag)
// 2. Creates DELIVER_DEDUCT movements for missing deductions
// 3. Updates stock_deducted flag on orders
// 4. Handles warehouse type correctly (MANAGER vs SALESPERSON)

// Key improvement: Add explicit handling for failed delivery_queue items
const { dryRun = true, forceReprocess = false } = await req.json();

// If forceReprocess is true, also clear the failed delivery_queue items
if (!dryRun && forceReprocess) {
  // Mark failed delivery_queue items as "REPROCESSED" so they don't block future processing
  await supabase
    .from('delivery_queue')
    .update({ status: 'REPROCESSED' })
    .eq('status', 'FAILED');
}
```

### 2. Add Reprocess Failed Queue Option

Add a new feature to reprocess failed delivery_queue items by marking them as handled so the backfill can create fresh movements.

### 3. UI Enhancement

Update the StockIntegrityScan page to show:
- Count of failed delivery_queue items
- Option to force reprocess
- Detailed breakdown by product

## Expected Outcome After Running Backfill

| Product | Before | After |
|---------|--------|-------|
| FT02 - GOLD | Balance: 11 | Balance: 4 (12 inbound - 8 delivered) |
| FT02 - BLACK | Balance: 7 | Balance: ~0-2 |
| BODYCURVE variants | Balance: 0 | Balance: negative (over-sold) |

**Note**: Some products may show negative balance after backfill. This is **correct** - it indicates the business sold more than was in inventory (either inbound wasn't recorded, or stock was never added).

## Step-by-Step Fix Process

1. **Admin navigates to** `/admin/stock-integrity`
2. **Click "Preview Scan (Dry Run)"** - shows 177+ missing deductions
3. **Click "Apply Fix"** - creates all missing stock movements
4. **Verify in Inventory page** - balances should now be correct

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/backfill-stock-movements/index.ts` | Add forceReprocess parameter and reprocess logic |
| `src/pages/admin/StockIntegrityScan.tsx` | Add "Force Reprocess Failed Queue" option |
| `src/hooks/useStockBackfill.ts` | Update interface to include forceReprocess option |

## Summary

The fix is straightforward - the existing backfill function has the correct logic, it just needs to be:
1. **Actually executed** via the admin UI
2. **Enhanced** with a forceReprocess option to handle failed delivery_queue items
3. **Allowed to create negative balances** (which represent real business over-selling)

After running the fix:
- FT02-GOLD will show balance of **4** (not 11)
- 177 orders will be marked as `stock_deducted=true`
- Stock movements will match actual deliveries
