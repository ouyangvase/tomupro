
# Fix Plan: Inactive Warehouse Stock Movement Error

## Problem Summary

The error "Cannot create stock movement for inactive warehouse 2590531e-ce4d-403e-af76-3a4c41945ff3" occurs because:

1. **KAIWEI** was promoted from salesperson to manager
2. Old orders (KW 14, KW 15, etc.) still reference the **old inactive SALESPERSON warehouse**
3. The `useRevertDelivery.ts` hook uses `order.fulfillment_warehouse_id` directly without checking if it's active
4. **7 orders** in the database still have stale warehouse references

---

## Phase 1: Fix `useRevertDelivery.ts` Hook

**File:** `src/hooks/useRevertDelivery.ts`

**Change:** Instead of using `order.fulfillment_warehouse_id` directly, call the `get_stock_owner_warehouse` RPC to get the correct active warehouse:

```typescript
// BEFORE (broken - line 55-93):
if (order.stock_deducted && order.fulfillment_warehouse_id) {
  // Uses stale warehouse ID directly
  warehouse_id: order.fulfillment_warehouse_id,  // ❌ WRONG
}

// AFTER (fixed):
if (order.stock_deducted) {
  // Always recalculate the correct active warehouse
  const { data: warehouseId, error: warehouseError } = await supabase
    .rpc('get_stock_owner_warehouse', { p_order_id: orderId });
  
  if (warehouseError || !warehouseId) {
    throw new Error('No active warehouse found for stock restoration');
  }
  
  // Use the calculated active warehouse
  warehouse_id: warehouseId,  // ✅ CORRECT
}
```

This ensures stock is returned to the **current active warehouse** even if the salesperson's role has changed.

---

## Phase 2: Data Migration - Fix Stale Warehouse References

**Database Migration:** Update all orders with inactive `fulfillment_warehouse_id` to point to the correct active warehouse.

```sql
-- Update orders with inactive warehouse references
UPDATE orders o
SET fulfillment_warehouse_id = (
  SELECT w.id 
  FROM warehouses w
  JOIN profiles p ON p.id = o.salesperson_id
  WHERE w.owner_user_id = o.salesperson_id
    AND w.warehouse_type = (CASE 
      WHEN p.role = 'manager' THEN 'MANAGER'
      ELSE 'SALESPERSON'
    END)::warehouse_type
    AND w.is_active = true
  LIMIT 1
)
FROM warehouses w_old
WHERE o.fulfillment_warehouse_id = w_old.id
  AND w_old.is_active = false;
```

This will fix:
- KW 14, KW 15, KW 16, KW 17, KW 18, KW 19 (KAIWEI's orders)
- Any other orders referencing inactive warehouses

---

## Phase 3: Add Defensive Check to Database Trigger

Enhance the existing `validate_stock_movement_warehouse` trigger to provide a more helpful error message:

```sql
-- Improved error message with user-friendly details
CREATE OR REPLACE FUNCTION validate_stock_movement_warehouse()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_name TEXT;
  v_active_warehouse_id UUID;
BEGIN
  -- Check if warehouse is active
  IF NOT EXISTS (
    SELECT 1 FROM warehouses 
    WHERE id = NEW.warehouse_id AND is_active = true
  ) THEN
    -- Get owner name for helpful error
    SELECT p.display_name INTO v_owner_name
    FROM warehouses w
    JOIN profiles p ON p.id = w.owner_user_id
    WHERE w.id = NEW.warehouse_id;
    
    RAISE EXCEPTION 'Cannot create stock movement for inactive warehouse. Owner: %. Please use the active warehouse.', COALESCE(v_owner_name, 'Unknown');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

---

## Summary of Changes

| Component | Action | Description |
|-----------|--------|-------------|
| `src/hooks/useRevertDelivery.ts` | MODIFY | Use `get_stock_owner_warehouse` RPC instead of cached warehouse ID |
| `orders` table | MIGRATE | Update 7 orders with stale `fulfillment_warehouse_id` |
| `validate_stock_movement_warehouse()` | ENHANCE | Improve error message with owner name |

---

## Expected Outcome

After implementation:

1. **Reverse Delivered** action will work correctly even for users who changed roles
2. All existing orders will have correct `fulfillment_warehouse_id` references
3. Database trigger prevents future stock movements to inactive warehouses with helpful error message
4. Stock is always returned to the **currently active** warehouse regardless of what's stored on the order
