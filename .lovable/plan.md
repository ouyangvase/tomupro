
# Fix Database Statement Timeout Error

## Problem Analysis

The error "current transaction is aborted, commands ignored until end of transaction block" is a **cascading failure** caused by:

1. **Statement timeout on orders query** - The main query fetching orders with nested `order_items` and `products` is timing out
2. **Heavy RLS policy evaluation** - The `order_items` RLS policies call `get_user_role(auth.uid())` and `is_in_manager_team()` for EVERY row
3. **Large dataset** - One runner has **688 orders**, triggering ~2000+ RLS function calls per page load
4. **Transaction cascade** - Once one query times out, PostgreSQL marks the transaction as aborted, and ALL subsequent queries fail

## Solution: Multi-Part Fix

### Part 1: Add Missing Index for Product Lookup

Create an index on `order_items.product_id` to speed up the product join in nested queries.

```sql
CREATE INDEX idx_order_items_product_id 
ON order_items(product_id);
```

### Part 2: Optimize RLS Policy on order_items

The current policy evaluates `get_user_role()` for every row. Replace with a more efficient policy that:
1. Caches the role check
2. Uses JOIN instead of EXISTS for better query planning

**Current problematic policy:**
```sql
-- Calls get_user_role() per row + EXISTS subquery per row
(EXISTS ( SELECT 1 FROM orders o
  WHERE o.id = order_items.order_id 
  AND ((auth.uid() = o.salesperson_id) 
    OR (auth.uid() = o.runner_id) 
    OR (get_user_role(auth.uid()) = ANY (ARRAY['admin', 'manager'])))))
```

**Optimized policy using security definer function:**
```sql
CREATE OR REPLACE FUNCTION can_access_order_items(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = p_order_id
    AND (
      o.salesperson_id = auth.uid()
      OR o.runner_id = auth.uid()
      OR o.driver_id = auth.uid()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      OR (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'manager')
        AND (
          o.salesperson_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM manager_salesperson_bindings
            WHERE manager_id = auth.uid() AND salesperson_id = o.salesperson_id AND active = true
          )
        )
      )
    )
  );
$$;

-- Drop existing policies
DROP POLICY IF EXISTS "Order items follow order access" ON order_items;
DROP POLICY IF EXISTS "Manager can view team order items" ON order_items;

-- Create simplified policy
CREATE POLICY "order_items_access" ON order_items
FOR ALL
USING (can_access_order_items(order_id));
```

### Part 3: Add Composite Index for Runner Queries

Create a composite index optimized for the runner inbox query pattern:

```sql
CREATE INDEX idx_orders_runner_created_desc
ON orders(runner_id, created_at DESC)
WHERE runner_id IS NOT NULL;
```

### Part 4: Frontend Query Optimization

Reduce the initial load by adding more specific server-side filters in `useOrders`:

**File: `src/hooks/useOrders.ts`**

Add a `limit` parameter and reduce default from 500 to 100 for inbox views:

```typescript
interface OrderFilters {
  status?: OrderStatus;
  salespersonId?: string;
  salespersonIds?: string[];
  runnerId?: string;
  runnerStatus?: RunnerStatus;
  reconciliationStatus?: ReconciliationStatus;
  limit?: number;  // Add this
}

// In query:
.limit(filters?.limit || 500)
```

**File: `src/pages/runner/RunnerInbox.tsx`**

Exclude delivered/failed orders at the server level:

```typescript
const { data: orders, isLoading } = useOrders({ 
  runnerId: user?.id,
  limit: 200  // Reduce initial load
});
```

### Part 5: Reduce Query Scope for Runner Inbox

Since Runner Inbox only shows active orders (not delivered, not failed), add server-side exclusion:

**File: `src/hooks/useOrders.ts`**

Add new filter for excluding specific runner statuses:

```typescript
if (filters?.excludeDeliveredAndFailed) {
  query = query.neq('runner_status', 'DELIVERED');
  query = query.neq('runner_status', 'FAILED_DELIVERY');
}
```

---

## Summary of Changes

| Change | Type | Purpose |
|--------|------|---------|
| `CREATE INDEX idx_order_items_product_id` | Database | Speed up product JOIN |
| `CREATE INDEX idx_orders_runner_created_desc` | Database | Speed up runner queries |
| Replace order_items RLS policies | Database | Reduce function call overhead |
| Create `can_access_order_items()` function | Database | Single-point access check |
| Add `limit` param to useOrders | Frontend | Reduce data fetched |
| Add `excludeDeliveredAndFailed` filter | Frontend | Server-side filtering |

## Expected Result

| Metric | Before | After |
|--------|--------|-------|
| Orders query time | Timeout (>8s) | <1s |
| RLS function calls | 2000+/page | 200-300/page |
| Page load for runner | Error | Works |
| Transaction errors | Cascade failure | None |

## Execution Order

1. Create database indexes (immediate performance boost)
2. Create `can_access_order_items` function
3. Replace RLS policies (requires careful migration)
4. Update frontend hooks
5. Update RunnerInbox component
