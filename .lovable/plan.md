

# Plan: Fix Stock Balance Duplicates and Transfer Dialog Product Filtering

## Overview

Two related issues need to be fixed:

1. **Stock Balance Duplicates**: The stock balance page shows duplicate SKU entries with incorrect balances (e.g., KRILL OIL appears twice for derrick - once with +20 and once with -51)
2. **Transfer Dialog Shows Wrong Products**: When selecting a "From User", the product dropdown shows products from ALL users instead of only that user's products

## Root Cause Analysis

### Issue 1: Stock Balance Duplicates

**Problem**: Stock movements were created referencing products that don't belong to the warehouse owner.

For example, when stock was transferred FROM derrick TO Qi Xiu:
- The TRANSFER_OUT movements used Qi Xiu's product IDs (e.g., `005e6ca3-...`) instead of derrick's product IDs (e.g., `e3221a91-...`)
- This created entries in derrick's warehouse for products he doesn't own
- Result: Same SKU code appears twice (derrick's real product vs Qi Xiu's product incorrectly added)

**Current Bad Data**: 4 stock movements where product owner doesn't match warehouse owner - all from a single transfer

### Issue 2: Transfer Dialog Products

**Problem**: The `StockTransferDialog` uses `useProducts()` which fetches ALL products visible to admin.

When selecting "From User = derrick", the dropdown should only show derrick's products, not products from Qi Xiu or others.

## Solution

### Part 1: Fix the Transfer Dialog (Prevent Future Issues)

Update `StockTransferDialog.tsx` to use `useProductsByOwner(fromOwnerId)` instead of `useProducts()`.

| Before | After |
|--------|-------|
| Shows all products | Shows only products owned by selected "From User" |
| Products visible to admin | Products filtered by `owner_user_id = fromOwnerId` |
| Duplicates possible | No duplicates (each user has their own product records) |

### Part 2: Fix the Stock Balance View (Clean Display)

Update `stock_balance_view` to only show products where the product owner matches the warehouse owner.

This ensures that incorrectly-created stock movements (like the 4 bad ones) are hidden from the view.

### Part 3: Clean Up Bad Data (One-Time Fix)

Delete the 4 incorrect stock movement records that reference products not owned by the warehouse owner.

## Technical Implementation

### Changes Required

| Component | Change |
|-----------|--------|
| `src/components/inventory/StockTransferDialog.tsx` | Replace `useProducts()` with `useProductsByOwner(fromOwnerId)` |
| Database Migration | Update `stock_balance_view` to filter by product owner = warehouse owner |
| Database Migration | Delete the 4 bad stock movement records |
| Database Migration | Add trigger to prevent future product/warehouse owner mismatches |

### Code Changes

**StockTransferDialog.tsx** (lines 10-13, 27-29):

```typescript
// Replace useProducts import
import { useProductsByOwner } from '@/hooks/useProductsByOwner';

// Replace products query
const { data: products = [] } = useProductsByOwner(fromOwnerId);
```

**Database Migration**:

```sql
-- Fix stock_balance_view to only show products matching warehouse owner
CREATE OR REPLACE VIEW stock_balance_view AS
SELECT 
  sm.warehouse_id,
  w.name AS warehouse_name,
  w.owner_user_id,
  p.display_name AS owner_name,
  sm.product_id,
  pr.sku_code,
  pr.sku_name,
  sum(sm.qty_change) AS balance_qty,
  max(sm.created_at) AS last_movement_time
FROM stock_movements sm
JOIN warehouses w ON w.id = sm.warehouse_id
JOIN profiles p ON p.id = w.owner_user_id
JOIN products pr ON pr.id = sm.product_id
WHERE sm.product_id IS NOT NULL 
  AND pr.sku_code IS NOT NULL 
  AND w.is_active = true
  AND pr.owner_user_id = w.owner_user_id  -- NEW: Only products owned by warehouse owner
  AND (p.role = ANY (ARRAY['salesperson'::app_role, 'manager'::app_role, 'admin'::app_role]))
GROUP BY sm.warehouse_id, w.name, w.owner_user_id, p.display_name, sm.product_id, pr.sku_code, pr.sku_name
HAVING sum(sm.qty_change) <> 0;

-- Delete the 4 bad stock movements
DELETE FROM stock_movements 
WHERE id IN (
  '1bb08998-c90e-4397-bb02-0b8057ecdf4d',
  'beb39a8d-1382-4a62-b787-713ffca05a90',
  '5312f123-c330-45de-808d-a0cbc2896ddd',
  'b18daa23-48a4-46ce-b2c1-78e54ebfc605'
);

-- Add trigger to prevent future mismatches
CREATE OR REPLACE FUNCTION validate_stock_movement_product_owner()
RETURNS TRIGGER AS $$
DECLARE
  product_owner_id UUID;
  warehouse_owner_id UUID;
BEGIN
  SELECT owner_user_id INTO product_owner_id FROM products WHERE id = NEW.product_id;
  SELECT owner_user_id INTO warehouse_owner_id FROM warehouses WHERE id = NEW.warehouse_id;
  
  IF product_owner_id != warehouse_owner_id THEN
    RAISE EXCEPTION 'Product owner (%) does not match warehouse owner (%)', 
      product_owner_id, warehouse_owner_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_stock_movement_product_owner
  BEFORE INSERT ON stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION validate_stock_movement_product_owner();
```

## Expected Results

### Before Fix
| SKU | Balance |
|-----|---------|
| AKO02 | 20 |
| AKO02 | -51 |
| AKOG01 | -159 |
| AKOG01 | 147 |

### After Fix
| SKU | Balance |
|-----|---------|
| AKO02 | 20 |
| AKOG01 | 147 |

## Summary

1. **Update Transfer Dialog**: Only show products owned by the selected "From User"
2. **Update View Filter**: Add `pr.owner_user_id = w.owner_user_id` to the view
3. **Clean Bad Data**: Delete 4 incorrect stock movement records
4. **Add Validation**: Prevent future product/warehouse owner mismatches with a trigger

