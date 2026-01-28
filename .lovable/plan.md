
# Fix: Order Items Not Showing for Data Sharing Viewers

## Problem Summary

When users view orders through data sharing (e.g., HC viewing Yao Xiang's orders), the "Items" column displays "No items" even though items exist. The same order (EL2515) shows items correctly when viewed by the owner.

**Affected scenarios:**
- Managers viewing team member orders via `user_data_shares`
- Managers viewing orders via `manager_groups`
- Any visibility via legacy `profiles.manager_id` bindings

## Root Cause

The `can_access_order_items(p_order_id uuid)` database function is **missing data sharing visibility checks**. It currently only allows access for:
- Direct salesperson/runner/driver on the order
- Admin users
- Managers with `manager_salesperson_bindings`

**Missing visibility sources:**
1. `user_data_shares` (data sharing feature)
2. `manager_groups` + `group_members` (team groups)
3. `profiles.manager_id` (legacy manager assignment)

This function controls RLS on `order_items` table, so when it returns false, the entire `order_items` array comes back empty.

## Solution

Update `can_access_order_items` function to use the same visibility logic as `is_in_manager_team` and `get_visible_owner_ids`, ensuring alignment across all data access functions.

### Database Migration

```sql
CREATE OR REPLACE FUNCTION public.can_access_order_items(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = p_order_id
    AND (
      -- Direct assignment
      o.salesperson_id = auth.uid()
      OR o.runner_id = auth.uid()
      OR o.driver_id = auth.uid()
      
      -- Admin can see all
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      
      -- Manager visibility
      OR (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'manager')
        AND (
          o.salesperson_id = auth.uid()
          -- manager_salesperson_bindings
          OR EXISTS (
            SELECT 1 FROM manager_salesperson_bindings
            WHERE manager_id = auth.uid() AND salesperson_id = o.salesperson_id AND active = true
          )
          -- manager_groups
          OR EXISTS (
            SELECT 1 FROM manager_groups mg
            JOIN group_members gm ON gm.group_id = mg.id
            WHERE mg.manager_user_id = auth.uid() AND gm.member_user_id = o.salesperson_id
          )
          -- legacy profiles.manager_id
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = o.salesperson_id AND manager_id = auth.uid()
          )
        )
      )
      
      -- Data sharing visibility (orders scope)
      OR EXISTS (
        SELECT 1 FROM user_data_shares
        WHERE viewer_user_id = auth.uid()
          AND subject_user_id = o.salesperson_id
          AND active = true
          AND scope_orders = true
      )
    )
  );
$function$;
```

## Files to Change

| Location | Change |
|----------|--------|
| Database Migration | Update `can_access_order_items` function with missing visibility sources |

## Technical Details

### Visibility Source Alignment

After this fix, all visibility functions will be aligned:

| Source | orders RLS | order_items RLS | products RLS | get_visible_owner_ids |
|--------|------------|-----------------|--------------|----------------------|
| manager_salesperson_bindings | Yes | Yes (after fix) | Yes | Yes |
| manager_groups | Yes | Yes (after fix) | Yes | Yes |
| profiles.manager_id | Yes | Yes (after fix) | Yes | Yes |
| user_data_shares | Yes | Yes (after fix) | Yes | Yes |

### Performance Considerations

The function uses indexed columns:
- `manager_salesperson_bindings(manager_id, salesperson_id, active)`
- `manager_groups(manager_user_id)` + `group_members(group_id, member_user_id)`
- `profiles(manager_id)` - index exists
- `user_data_shares(viewer_user_id, subject_user_id, active)`

These indexes are already in place per the memory about unified binding visibility.

## Expected Outcome

After applying this fix:
1. HC and ZC will see items for Yao Xiang's orders (e.g., EL2316, JM046, JM257)
2. All managers will see team member order items correctly
3. Data sharing viewers with `scope_orders = true` will see order items
4. Product names will resolve correctly in the joined query

## Verification

For manager HC viewing Yao Xiang's order EL2316:
- Before fix: Shows "No items"
- After fix: Shows "BWC001/BOTOX WRINKLE CREAM × 1"
