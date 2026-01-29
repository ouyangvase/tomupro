
# Plan: Add Runner Export & Fix Export Amount Display

## Overview
Two issues need to be fixed:
1. **Runner Export Button**: Add an "Export" button for runners on the Delivered Orders page
2. **Export Amount Bug**: Fix the export to show correct line item amounts instead of repeating the order total for each row

## What's Currently Happening

When an order has multiple items (e.g., AKO797 with 2 SKUs totaling BND 99):
- The export creates 2 rows (one per SKU)
- Each row shows "99" in the amount column
- This looks like 99 + 99 = 198 total when summing the column

## Solution

### 1. Add Export Button for Runners
Add the Export dropdown button for runners (not just Admin/Manager) on the Delivered Orders page.

### 2. Fix the Export Amount Logic
Change the export format to show:
- **`line_amount`**: The individual line item amount (e.g., 52 for KRILL OIL, 47 for BOSSTER OIL)
- **`order_total`**: The order's total amount (99) shown only for context

This way, when you sum the `line_amount` column, you get the correct total.

## Files to Change

| File | Change |
|------|--------|
| `src/lib/csv.ts` | Update `exportRunnerOrderLines` and `exportOrderLines` to use `line_total` for the amount column per item, rename `total_amount` to `order_total` for clarity |
| `src/pages/runner/RunnerDeliveredOrders.tsx` | Add export button for runners (remove `isAdminOrManager` restriction) |

## Technical Details

### Export Column Changes

**Before (incorrect):**
| order_ref | sku_code | qty | total_amount |
|-----------|----------|-----|--------------|
| AKO797 | AKO02 | 3 | 99 |
| AKO797 | AKOG01 | 2 | 99 |

**After (correct):**
| order_ref | sku_code | qty | line_amount | order_total |
|-----------|----------|-----|-------------|-------------|
| AKO797 | AKO02 | 3 | 52 | 99 |
| AKO797 | AKOG01 | 2 | 47 | 99 |

Now summing `line_amount` gives the true total.

### Code Changes

**`src/lib/csv.ts` - Update RunnerOrderLineExport interface:**
```typescript
export interface RunnerOrderLineExport {
  // ... existing fields ...
  qty: number;
  line_amount: number;  // Individual item amount
  order_total: number;  // Order's total for reference
}
```

**`src/lib/csv.ts` - Update the export logic:**
```typescript
lines.push({
  // ... existing fields ...
  qty: item.qty || 0,
  line_amount: Number(item.line_total) || 0,  // Use line_total
  order_total: Number(order.total_amount) || 0,
});
```

**`src/pages/runner/RunnerDeliveredOrders.tsx` - Enable export for runners:**
```typescript
// Change from:
{isAdminOrManager && ( <DropdownMenu>...</DropdownMenu> )}

// To:
{(isAdminOrManager || role === 'runner') && ( 
  <DropdownMenu>...</DropdownMenu> 
)}
```

## Expected Outcome
1. Runners will see an "Export" button on their Delivered Orders page
2. Export files will show correct line-level amounts that sum correctly
3. Order total is preserved for reference but clearly separated from line amounts
