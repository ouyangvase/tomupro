# Stock Integrity System - Fixed

## Problem Solved

The stock rebuild was failing with `invalid input value for enum order_status: "delivered"` because:
- The `order_status` enum only has: `BOOKING`, `CANCELLED`, `READY`
- Delivery is tracked via the `runner_status` TEXT field (value: `'DELIVERED'`)
- The repair function was incorrectly checking `orders.status = 'delivered'`

## Solution Implemented

### A) Created Canonical View `v_delivered_order_lines`
A single source of truth for what counts as "delivered":
```sql
WHERE o.runner_status = 'DELIVERED' AND o.status != 'CANCELLED'
```

### B) Fixed `repair_missing_stock_deductions`
- Uses `runner_status` instead of `status` enum
- References the canonical view for consistency
- Bulk SQL operations (no loops)
- Idempotent with `ON CONFLICT DO NOTHING`

### C) Added Debug Function
`debug_delivered_qty_comparison(sku_code)` compares:
- Delivered qty from orders (canonical view)
- Delivered qty from stock movements
- Shows MATCH/MISMATCH status

### D) Enhanced `apply_full_stock_rebuild`
- Returns total delivered lines counted
- Includes sample SKU debug info
- No enum casting errors

## Verification
- AKO02: Delivered Orders shows 207 qty
- Stock Audit should now match after rebuild

## Files Changed
- New migration applied to fix database functions
- Created `v_delivered_order_lines` view
- Updated `repair_missing_stock_deductions` function
- Updated `apply_full_stock_rebuild` function
- Added `debug_delivered_qty_comparison` function
