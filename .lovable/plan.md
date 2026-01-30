
# Plan: Fix Transfer Stock Product Dropdown to Show Only User's Available Stock

## Problem Summary

Based on analysis of the screenshots and database:

1. **Transfer Dialog Products**: The product dropdown should only show products that:
   - Belong to the selected "From User" (owner_user_id filter)
   - Have actual stock available (balance > 0)

2. **Stock Balance**: Already verified as correct after the previous fix. The `stock_balance_view` now properly filters by `pr.owner_user_id = w.owner_user_id`.

## Root Cause

The current implementation uses `useProductsByOwner(fromOwnerId)` which fetches products from the `products` table filtered by owner. However, this shows ALL products owned by that user, not just products with available stock.

The screenshot shows:
- FT07 products (owned by JL) appearing for derrick - this shouldn't happen with the current code
- AKOG01 appearing twice - this could be a display bug or stale cache

## Solution

Improve the Transfer Stock dialog to only show products that have positive stock balance for the selected user.

### Approach

Instead of using `useProductsByOwner` (which queries the products table), filter from the stock balance data which already has the correct products.

### Changes Required

| File | Change |
|------|--------|
| `src/components/inventory/StockTransferDialog.tsx` | Use stock balance data to populate product dropdown instead of products query |

### Implementation Details

**Current flow:**
```
useProductsByOwner(fromOwnerId) -> shows ALL products owned by user
```

**New flow:**
```
useStockBalance() -> filter by fromOwnerId -> only products with balance > 0
```

### Code Changes

```typescript
// StockTransferDialog.tsx

// Remove: const { data: products = [] } = useProductsByOwner(fromOwnerId || null);

// Replace with: Derive products from stock balance
const availableProducts = useMemo(() => {
  if (!fromOwnerId) return [];
  
  return stockBalance
    .filter(s => s.owner_user_id === fromOwnerId && Number(s.balance_qty) > 0)
    .map(s => ({
      id: s.product_id,
      sku_code: s.sku_code,
      sku_name: s.sku_name
    }));
}, [stockBalance, fromOwnerId]);

// Use availableProducts in the dropdown instead of products
```

### Benefits

| Aspect | Before | After |
|--------|--------|-------|
| Products shown | All products owned by user | Only products with stock > 0 |
| Data source | Products table | Stock balance view (already filtered correctly) |
| Duplicates | Possible if RLS is misconfigured | Impossible (stock balance is grouped by product) |
| User experience | May see products with 0 stock | Only sees transferable products |

## Verification

After implementation:
- derrick should only see 4 products: AKO02 (20), AKOG01 (147), JP01 (139), JPGO1 (75)
- No FT07 or other user's products should appear
- No duplicate entries

## Summary

The fix changes the product dropdown data source from the products table to the stock balance view, which:
1. Is already filtered by product owner = warehouse owner
2. Only includes products with non-zero balance
3. Eliminates any possibility of showing wrong products or duplicates
