

# Fix Manager Warehouse Error, Failed Orders Data, and Runner Inbox

## Issues Summary

| Issue | Root Cause | Impact |
|-------|------------|--------|
| 1. "Cannot create stock movement for inactive warehouse" error for managers | Database trigger uses stale `fulfillment_warehouse_id` without recalculating it | Managers can't complete deliveries |
| 2. Failed Orders page shows 0 orders | `useOrders` hook defaults to 500 orders and doesn't fetch failed orders specifically | Runners can't see failed/cancelled orders |
| 3. Runner Inbox should show real data | Already fixed - uses `limit: 1000000` | Working correctly |

---

## Part 1: Fix Inactive Warehouse Error for Managers

### Root Cause Analysis

There are **105 orders** with stale `fulfillment_warehouse_id` pointing to inactive SALESPERSON warehouses, but the owners are now managers with active MANAGER warehouses.

The `process_delivery_queue_item` database trigger (line 276) uses the stale warehouse ID directly:
```sql
v_warehouse_id := v_order.fulfillment_warehouse_id;  -- Uses stale ID!
IF v_warehouse_id IS NULL THEN
  -- Only falls back to finding active warehouse when NULL
```

### Solution

**Database Migration**: Update the `process_delivery_queue_item` trigger to ALWAYS recalculate the correct active warehouse using the `get_stock_owner_warehouse` RPC, just like the edge functions do.

```sql
-- Fix: ALWAYS recalculate correct warehouse, never trust cached ID
CREATE OR REPLACE FUNCTION public.process_delivery_queue_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_warehouse_id UUID;
  v_item RECORD;
  v_missing_items TEXT[];
BEGIN
  SELECT o.id, o.salesperson_id, o.runner_id, o.order_code, o.stock_deducted
  INTO v_order
  FROM orders o
  WHERE o.id = NEW.order_id;
  
  -- ... existing checks ...
  
  -- CRITICAL FIX: ALWAYS recalculate the correct warehouse
  -- Never trust cached fulfillment_warehouse_id - it may be stale from role changes
  SELECT public.get_stock_owner_warehouse(NEW.order_id) INTO v_warehouse_id;
  
  IF v_warehouse_id IS NULL THEN
    -- Fallback: find any active warehouse for the salesperson
    SELECT id INTO v_warehouse_id
    FROM warehouses
    WHERE owner_user_id = v_order.salesperson_id
      AND is_active = true
    LIMIT 1;
  END IF;
  
  -- ... rest of function ...
END;
$$;
```

Also need to **update the `set_default_fulfillment_warehouse` trigger** to set the correct warehouse type based on the salesperson's role:

```sql
CREATE OR REPLACE FUNCTION public.set_default_fulfillment_warehouse()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_warehouse_id UUID;
  v_user_role TEXT;
BEGIN
  IF NEW.fulfillment_warehouse_id IS NULL AND NEW.salesperson_id IS NOT NULL THEN
    -- Get the user's role
    SELECT role INTO v_user_role FROM profiles WHERE id = NEW.salesperson_id;
    
    -- Find the correct warehouse based on role
    SELECT id INTO v_warehouse_id
    FROM warehouses
    WHERE owner_user_id = NEW.salesperson_id
      AND warehouse_type = (CASE 
        WHEN v_user_role = 'manager' THEN 'MANAGER' 
        ELSE 'SALESPERSON' 
      END)::warehouse_type
      AND is_active = true
    LIMIT 1;
    
    NEW.fulfillment_warehouse_id := v_warehouse_id;
  END IF;
  RETURN NEW;
END;
$$;
```

Additionally, run a **data fix** to correct all stale warehouse IDs:

```sql
-- Fix all orders with stale fulfillment_warehouse_id
UPDATE orders o
SET fulfillment_warehouse_id = (
  SELECT public.get_stock_owner_warehouse(o.id)
)
WHERE o.fulfillment_warehouse_id IN (
  SELECT id FROM warehouses WHERE is_active = false
);
```

---

## Part 2: Fix Failed Orders Page to Show Real Data

### Root Cause

The `RunnerFailedOrders.tsx` page uses:
```typescript
const { data: orders } = useOrders({ runnerId: user?.id });  // Defaults to 500 orders
```

This fetches up to 500 orders sorted by `created_at DESC`, but doesn't specifically request failed orders. If failed orders are older than the 500 most recent, they won't be included.

### Solution

**File: `src/pages/runner/RunnerFailedOrders.tsx`**

Update the hook to:
1. Request a high limit (1000000) 
2. OR create a new filter option for failed orders specifically

```typescript
// Option 1: Use high limit (simple fix)
const { data: orders, isLoading, refetch } = useOrders({ 
  runnerId: user?.id,
  limit: 1000000
});
```

OR add a dedicated filter in useOrders:

**File: `src/hooks/useOrders.ts`**

Add a new filter option `includeFailedOnly` that uses a server-side filter:

```typescript
interface OrderFilters {
  // ... existing filters ...
  includeFailedAndCancelledOnly?: boolean;  // For Failed Orders page
}

// In queryFn:
if (filters?.includeFailedAndCancelledOnly) {
  query = query.or('runner_status.eq.FAILED_DELIVERY,status.eq.CANCELLED');
}
```

**File: `src/pages/runner/RunnerFailedOrders.tsx`**

```typescript
const { data: orders, isLoading, refetch } = useOrders({ 
  runnerId: user?.id,
  includeFailedAndCancelledOnly: true,
  limit: 1000000
});

// Remove client-side filtering since it's now server-side
const failedOrders = orders || [];
```

---

## Part 3: Confirm Runner Inbox Works Correctly

The Runner Inbox already uses:
```typescript
const { data: orders, isLoading } = useOrders({ 
  runnerId: user?.id,
  excludeDeliveredAndFailed: true,
  limit: 1000000
});
```

**Status**: Already working correctly. The screenshot shows 521 orders selected, which matches the database count (521 active orders).

---

## Summary of Changes

| File | Change | Purpose |
|------|--------|---------|
| **Database Migration** | Update `process_delivery_queue_item` to always recalculate warehouse | Fix inactive warehouse error |
| **Database Migration** | Update `set_default_fulfillment_warehouse` to be role-aware | Prevent future stale IDs |
| **Database Migration** | Fix existing stale `fulfillment_warehouse_id` values | Clean up existing data |
| `src/hooks/useOrders.ts` | Add `includeFailedAndCancelledOnly` filter | Server-side filter for failed orders |
| `src/pages/runner/RunnerFailedOrders.tsx` | Use new filter with high limit | Show all failed/cancelled orders |

---

## Technical Details

### Database Function Fix

The `get_stock_owner_warehouse` RPC correctly handles role changes:
```sql
SELECT w.id
FROM orders o
JOIN profiles p ON p.id = o.salesperson_id
JOIN warehouses w ON w.owner_user_id = o.salesperson_id
WHERE o.id = p_order_id
  AND w.warehouse_type = (CASE 
    WHEN p.role = 'manager' THEN 'MANAGER'
    ELSE 'SALESPERSON'
  END)::warehouse_type
  AND w.is_active = true
LIMIT 1;
```

### Current Data State

- **105 orders** have stale `fulfillment_warehouse_id` (pointing to inactive warehouses)
- **10 failed/cancelled orders** exist for the runner but aren't showing
- Affected managers include: KAIWEI, derrick, and others who changed from salesperson to manager role

### Expected Results After Fix

| Before | After |
|--------|-------|
| Manager users get "inactive warehouse" error | Deliveries complete successfully |
| Failed Orders shows 0 | Failed Orders shows 10 orders for this runner |
| Runner Inbox works | Still works (no change needed) |

