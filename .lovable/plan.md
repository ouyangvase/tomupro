
# Plan: Fix Stock Balance and Transfer Logic

## Problem Summary

The stock balance for derrick is showing incorrect values because:

1. **Transfer dialog used wrong product IDs** - The recent transfer from derrick to Qi Xiu incorrectly stored Qi Xiu's product IDs in `stock_transfer_items` instead of derrick's
2. **TRANSFER_OUT movements were never created** - The validation trigger blocked the movements because the stored product ID didn't match the source warehouse owner
3. **TRANSFER_IN movements were created using incorrect product IDs** - These bypassed validation because the product owner matched Qi Xiu's warehouse

### Current vs Expected Balances (derrick)

| SKU | Current Balance | Missing Movement | Expected Balance |
|-----|-----------------|------------------|------------------|
| AKO02 | 20 | TRANSFER_OUT -51 | -31 |
| AKOG01 | 147 | TRANSFER_OUT -159 | -12 |
| JP01 | 139 | TRANSFER_OUT -144 | -5 |
| JPGO1 | 75 | TRANSFER_OUT -77 | -2 |

## Root Cause

In `useStockVisibility.ts`, the `useCreateStockTransfer` function:
1. Looks up destination products and stores them in `stock_transfer_items`
2. Tries to use source product IDs for TRANSFER_OUT but the trigger validates against the stored product ID
3. Creates TRANSFER_IN successfully because destination products match destination warehouse

## Solution

### Part 1: Fix the Hook Logic

Update `useCreateStockTransfer` to:
1. Store SOURCE product IDs in `stock_transfer_items` (not destination)
2. Use source product IDs for TRANSFER_OUT movements
3. Use mapped destination product IDs only for TRANSFER_IN movements

### Part 2: Clean Up Bad Data

Delete incorrect movements and create correct ones:

1. **Delete the wrong TRANSFER_IN movements** for Qi Xiu's warehouse (they used wrong product IDs)
2. **Create correct TRANSFER_OUT movements** for derrick's warehouse using derrick's product IDs
3. **Create correct TRANSFER_IN movements** for Qi Xiu's warehouse using Qi Xiu's product IDs
4. **Update stock_transfer_items** to use correct source product IDs

### Part 3: Fix Other Broken Transfers

Check and fix Emily → KAIWEI transfers that are also missing movements.

## Technical Implementation

### Changes Required

| Component | Change |
|-----------|--------|
| `src/hooks/useStockVisibility.ts` | Fix `useCreateStockTransfer` to store source product IDs and handle movements correctly |
| Database Migration | Delete bad movements, create correct ones, update transfer items |

### Code Changes (useStockVisibility.ts)

```typescript
// In useCreateStockTransfer mutation:

// 1. Store SOURCE product IDs in transfer items (not destination)
const itemsToInsert = data.items.map(item => ({
  transfer_id: transfer.id,
  product_id: item.product_id, // This is already the source product ID from the dialog
  qty: item.qty,
}));

// 2. Create movements with correct product IDs
const movements = [];
for (const item of data.items) {
  // Source product ID (from transfer items - owned by from_owner)
  const sourceProductId = item.product_id;
  // Destination product ID (mapped to to_owner's product)
  const destProductId = productIdMap[item.product_id];
  
  // TRANSFER_OUT from source (uses source product ID)
  movements.push({
    warehouse_id: data.from_warehouse_id,
    product_id: sourceProductId, // ← Use source product ID
    movement_type: 'TRANSFER_OUT',
    qty_change: -item.qty,
    reference_type: 'STOCK_TRANSFER',
    reference_id: transfer.id,
    created_by: user?.id,
  });
  
  // TRANSFER_IN to destination (uses destination product ID)
  movements.push({
    warehouse_id: data.to_warehouse_id,
    product_id: destProductId, // ← Use destination product ID
    movement_type: 'TRANSFER_IN',
    qty_change: item.qty,
    reference_type: 'STOCK_TRANSFER',
    reference_id: transfer.id,
    created_by: user?.id,
  });
}
```

### Database Migration (Data Cleanup)

```sql
-- 1. Delete the incorrect TRANSFER_IN movements for derrick→Qi Xiu transfer
DELETE FROM stock_movements 
WHERE reference_id = 'e4e4f54b-2234-49bb-988c-ae2abe6b3302'
  AND movement_type = 'TRANSFER_IN';

-- 2. Insert correct TRANSFER_OUT for derrick using derrick's product IDs
INSERT INTO stock_movements (warehouse_id, product_id, movement_type, qty_change, reference_type, reference_id, created_by)
VALUES 
  -- AKO02: derrick's product e3221a91-..., qty -51
  ('609314cd-1dc8-428f-95ce-cf9b151b013b', 'e3221a91-2b20-4c04-9e19-0cafd24f501c', 'TRANSFER_OUT', -51, 'STOCK_TRANSFER', 'e4e4f54b-2234-49bb-988c-ae2abe6b3302', (SELECT id FROM profiles WHERE display_name = 'Admin' LIMIT 1)),
  -- AKOG01: derrick's product d960b39a-..., qty -159
  ('609314cd-1dc8-428f-95ce-cf9b151b013b', 'd960b39a-5187-4869-bba4-85f487329b83', 'TRANSFER_OUT', -159, 'STOCK_TRANSFER', 'e4e4f54b-2234-49bb-988c-ae2abe6b3302', (SELECT id FROM profiles WHERE display_name = 'Admin' LIMIT 1)),
  -- JP01: derrick's product 6a858f77-..., qty -144
  ('609314cd-1dc8-428f-95ce-cf9b151b013b', '6a858f77-4a5e-400c-b464-b28c065def06', 'TRANSFER_OUT', -144, 'STOCK_TRANSFER', 'e4e4f54b-2234-49bb-988c-ae2abe6b3302', (SELECT id FROM profiles WHERE display_name = 'Admin' LIMIT 1)),
  -- JPGO1: derrick's product 87857048-..., qty -77
  ('609314cd-1dc8-428f-95ce-cf9b151b013b', '87857048-afb7-4cce-a7e7-a25807dc8190', 'TRANSFER_OUT', -77, 'STOCK_TRANSFER', 'e4e4f54b-2234-49bb-988c-ae2abe6b3302', (SELECT id FROM profiles WHERE display_name = 'Admin' LIMIT 1));

-- 3. Insert correct TRANSFER_IN for Qi Xiu using Qi Xiu's product IDs
INSERT INTO stock_movements (warehouse_id, product_id, movement_type, qty_change, reference_type, reference_id, created_by)
SELECT 
  (SELECT id FROM warehouses WHERE owner_user_id = '357b8426-7509-4110-b023-1f352670c8e8' AND is_active = true),
  p.id,
  'TRANSFER_IN',
  CASE p.sku_code 
    WHEN 'AKO02' THEN 51
    WHEN 'AKOG01' THEN 159
    WHEN 'JP01' THEN 144
    WHEN 'JPGO1' THEN 77
  END,
  'STOCK_TRANSFER',
  'e4e4f54b-2234-49bb-988c-ae2abe6b3302',
  (SELECT id FROM profiles WHERE display_name ILIKE '%admin%' LIMIT 1)
FROM products p
WHERE p.owner_user_id = '357b8426-7509-4110-b023-1f352670c8e8'
  AND p.sku_code IN ('AKO02', 'AKOG01', 'JP01', 'JPGO1');

-- 4. Update stock_transfer_items to use derrick's product IDs
UPDATE stock_transfer_items sti
SET product_id = (
  SELECT dp.id 
  FROM products dp 
  WHERE dp.owner_user_id = 'b58df4aa-edc6-40ba-baa4-7ebc64124c13'
    AND dp.sku_code = (SELECT sku_code FROM products WHERE id = sti.product_id)
)
WHERE transfer_id = 'e4e4f54b-2234-49bb-988c-ae2abe6b3302';
```

## Expected Results After Fix

### derrick's Stock Balance

| SKU | Inbound | Delivered | Transfer Out | Balance |
|-----|---------|-----------|--------------|---------|
| AKO02 | +179 | -159 | -51 | -31 |
| AKOG01 | +210 | -63 | -159 | -12 |
| JP01 | +145 | -6 | -144 | -5 ✓ |
| JPGO1 | +77 | -2 | -77 | -2 |

### Qi Xiu's Stock Balance

| SKU | Transfer In | Balance |
|-----|-------------|---------|
| AKO02 | +51 | 51 |
| AKOG01 | +159 | 159 |
| JP01 | +144 | 144 |
| JPGO1 | +77 | 77 |

## Summary

1. **Fix transfer logic** in `useCreateStockTransfer` to store source product IDs and create movements with correct IDs
2. **Delete bad TRANSFER_IN** movements that used wrong product IDs
3. **Insert correct TRANSFER_OUT** movements for derrick
4. **Insert correct TRANSFER_IN** movements for Qi Xiu (using Qi Xiu's product IDs)
5. **Update transfer items** to reference source product IDs
