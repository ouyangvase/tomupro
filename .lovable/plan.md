
# Fix: Stock Deduction Trigger Bug and Reprocess Failed Orders

## Problem Summary

Product P013 (CAR ACRYSTAL COATING) shows incorrect stock balance:
- **Current Balance**: 23 units
- **Expected Balance**: 9 units (Inbound 35 - Delivered 26 = 9)

The root cause is a bug in the `process_delivery_queue_item` database trigger that processes stock deductions asynchronously.

## Root Cause Analysis

The trigger function references `v_order.total_amount` but never selects it into the record variable:

```sql
-- Line 18-20: Only selects these fields
SELECT o.id, o.salesperson_id, o.runner_id, o.order_code, o.stock_deducted
INTO v_order
FROM orders o WHERE o.id = NEW.order_id;

-- Line 113: Tries to use total_amount (which doesn't exist!)
INSERT INTO claims (order_id, amount, created_by)
VALUES (NEW.order_id, v_order.total_amount, ...);  -- FAILS HERE
```

**Impact:**
- 208 orders across the system have FAILED stock deductions
- 8 orders for P013 specifically failed (14 units not deducted)
- Stock balances are overstated for many products

## Solution

### Part 1: Fix the Trigger Function

Add `total_amount` to the SELECT statement in the trigger:

```sql
SELECT o.id, o.salesperson_id, o.runner_id, o.order_code, o.stock_deducted, o.total_amount
INTO v_order
FROM orders o
WHERE o.id = NEW.order_id;
```

### Part 2: Reprocess All Failed Queue Items

Create a migration that:
1. Fixes the trigger function
2. Reprocesses all FAILED queue items by resetting their status to PENDING
3. The trigger will then automatically reprocess them

## Database Migration

```sql
-- 1. Fix the trigger function by adding total_amount to the SELECT
CREATE OR REPLACE FUNCTION public.process_delivery_queue_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_warehouse_id UUID;
  v_item RECORD;
  v_missing_items TEXT[];
BEGIN
  -- Get the order details (FIX: include total_amount)
  SELECT o.id, o.salesperson_id, o.runner_id, o.order_code, 
         o.stock_deducted, o.total_amount
  INTO v_order
  FROM orders o
  WHERE o.id = NEW.order_id;

  -- ... rest of function unchanged ...
END;
$function$;

-- 2. Reset FAILED queue items with the specific error to PENDING
-- This will trigger reprocessing
UPDATE delivery_queue
SET status = 'PENDING',
    error_message = NULL,
    retry_count = 0,
    processed_at = NULL
WHERE status = 'FAILED'
  AND error_message = 'record "v_order" has no field "total_amount"';
```

## Files to Change

| Location | Change |
|----------|--------|
| Database Migration | Fix `process_delivery_queue_item` trigger function |
| Database Migration | Reset 208 FAILED queue items for reprocessing |

## Expected Outcome

After applying the fix:

1. **P013 balance**: 23 → 9 (correct)
2. **208 orders**: Stock properly deducted, claims created
3. **All products**: Balances corrected across the system
4. **Future deliveries**: Will process successfully

## Verification

After migration:
- P013 should show balance = 9
- No orders with `stock_deducted = false` and `runner_status = 'DELIVERED'`
- No FAILED queue items with the `total_amount` error
