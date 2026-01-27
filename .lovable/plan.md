
# Fix System Loading, Import Issues, and Stock Balance Discrepancies

## Problem Summary

### Issue 1: System Keeps Loading (CRITICAL)
The database is returning 503 errors with "PGRST002: Could not query the database for the schema cache. Retrying." and "canceling statement due to statement timeout" errors.

**Root Cause:** The previous change increased query limits to `1,000,000` which is overwhelming the database, causing statement timeouts and schema cache failures.

**Evidence:**
- Network requests show 503 errors 
- Database logs show multiple "canceling statement due to statement timeout" errors

### Issue 2: File Import Failed
Need to verify the import dialog is working correctly. Based on code review, the import appears functional but may be timing out due to the overall database load from Issue 1.

### Issue 3: Delivered Orders Not Tallying with Stock Balance
**59 delivered orders** have `stock_deducted = false`, meaning stock was never properly deducted. This creates inventory discrepancies.

**Evidence from database:**
```
Orders with runner_status='DELIVERED' but stock_deducted=false: 59
Stock deductions count: 234
Delivered orders with stock_deducted=true: 242
```

---

## Solution

### Fix 1: Reduce Query Limits to Prevent Timeouts

Revert the extreme limit of 1,000,000 to a reasonable value that balances data visibility with performance.

**Strategy:** Use progressive limits based on context:
- **Team Orders (Ready/Booking/Cancelled):** 10,000 limit (status-filtered queries are efficient)
- **General Orders:** 5,000 limit
- **Server-side queries:** 10,000 limit with pagination support

#### Files to Modify:

**`src/hooks/useOrders.ts`**
```typescript
// Line 20: Change from 1000000 to reasonable limit
const queryLimit = 5000;
```

**`src/hooks/useTeamOrders.ts`**
```typescript
// Line 49: Change from 1000000 to reasonable limit
.limit(10000);
```

**`src/hooks/useTeamOrdersServer.ts`**
```typescript
// Line 59: Change default limit
const { status, runnerStatus, reconciliationStatus, limit = 10000, offset = 0 } = params;

// Line 118: Change default limit
const { limit = 10000, offset = 0 } = params;
```

---

### Fix 2: Create Backfill Script for Missing Stock Deductions

Create a database migration that identifies and fixes the 59 orders missing stock deductions.

**SQL Migration:**
```sql
-- Backfill missing stock deductions for DELIVERED orders
-- This runs as a one-time fix for historical data

DO $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_warehouse_id uuid;
BEGIN
  -- Find all DELIVERED orders that haven't had stock deducted
  FOR v_order IN 
    SELECT o.id, o.salesperson_id, o.fulfillment_warehouse_id
    FROM orders o
    WHERE o.runner_status = 'DELIVERED'
      AND o.stock_deducted = false
  LOOP
    -- Get the correct warehouse using existing function
    SELECT public.get_stock_owner_warehouse(v_order.id) INTO v_warehouse_id;
    
    -- Skip if no warehouse found
    IF v_warehouse_id IS NULL THEN
      RAISE NOTICE 'Order % has no warehouse, skipping', v_order.id;
      CONTINUE;
    END IF;
    
    -- Create stock movements for each order item
    FOR v_item IN
      SELECT id, product_id, qty
      FROM order_items
      WHERE order_id = v_order.id AND product_id IS NOT NULL
    LOOP
      -- Check if deduction already exists (idempotency)
      IF NOT EXISTS (
        SELECT 1 FROM stock_movements 
        WHERE order_id = v_order.id 
          AND product_id = v_item.product_id 
          AND movement_type = 'DELIVER_DEDUCT'
      ) THEN
        INSERT INTO stock_movements (
          warehouse_id,
          product_id,
          movement_type,
          qty_change,
          reference_type,
          reference_id,
          order_id,
          created_by
        ) VALUES (
          v_warehouse_id,
          v_item.product_id,
          'DELIVER_DEDUCT',
          -v_item.qty,
          'ORDER_ITEM',
          v_item.id,
          v_order.id,
          v_order.salesperson_id
        );
      END IF;
    END LOOP;
    
    -- Mark order as stock_deducted
    UPDATE orders 
    SET stock_deducted = true,
        inventory_deducted_at = COALESCE(delivered_at, now()),
        fulfillment_warehouse_id = v_warehouse_id
    WHERE id = v_order.id;
    
    RAISE NOTICE 'Backfilled stock for order %', v_order.id;
  END LOOP;
END $$;
```

---

## Technical Details

### Why 1,000,000 Limit Causes Issues
- Supabase has statement timeout limits (typically 60 seconds for complex queries)
- Fetching 1M rows with JOINs (order_items, products) creates massive query plans
- RLS policies add overhead that compounds with large datasets
- The database connection pool gets exhausted under heavy load

### Recommended Limits
| Context | Limit | Reason |
|---------|-------|--------|
| Status-filtered queries | 10,000 | Most pages show filtered data (READY, BOOKING, etc.) |
| General order queries | 5,000 | Unfiltered queries need lower limits |
| High-volume pages (Delivered) | 10,000 | Historical data with good indexes |

### Stock Deduction Integrity
The `stock_deducted = false` issue likely occurred due to:
1. Race conditions during high-traffic periods
2. Process-delivery edge function failures that weren't properly logged
3. Orders marked as DELIVERED through a different code path that bypassed stock deduction

The backfill migration ensures all historical delivered orders have proper stock movements.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useOrders.ts` | Reduce limit from 1,000,000 to 5,000 |
| `src/hooks/useTeamOrders.ts` | Reduce limit from 1,000,000 to 10,000 |
| `src/hooks/useTeamOrdersServer.ts` | Reduce default limits from 1,000,000 to 10,000 |
| `supabase/migrations/[new].sql` | Backfill missing stock deductions |

---

## Expected Outcome

After implementation:
1. **Loading fixed** - Pages load quickly without database timeouts
2. **Import working** - CSV imports complete successfully (no longer blocked by DB load)
3. **Stock balance accurate** - All 59 missing deductions are backfilled, inventory tallies with delivered orders
