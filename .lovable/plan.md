
# Plan: Fix Global Search to Respect Visibility

## Problem
The global search shows "No orders found" because it directly queries the `orders` table, which is restricted by Row Level Security (RLS) policies. Users can only see orders matching specific conditions:
- Admin: All orders
- Runner: Orders where they are `runner_id`
- Salesperson: Orders where they are `salesperson_id`
- Manager: Orders where `salesperson_id` is in their team
- Driver: Orders where they are `driver_id`

The current search doesn't account for these visibility rules.

## Solution
Create a new database function `search_visible_orders` that searches across all orders the user has access to, then update the GlobalSearchBar component to use this function.

## Changes Required

### 1. Database Migration - Create `search_visible_orders` RPC

Create a new RPC function that:
- Takes a search query parameter
- Uses the same visibility logic as existing order access
- Searches by `order_code` and `customer_name` (case-insensitive)
- Returns matching orders with status badges

```sql
CREATE OR REPLACE FUNCTION public.search_visible_orders(
  p_query text,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  order_code text,
  customer_name text,
  status text,
  runner_status text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_role app_role;
  v_visible_ids uuid[];
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;
  
  v_role := public.get_user_role(v_user_id);
  v_visible_ids := public.get_visible_owner_ids();
  
  RETURN QUERY
  SELECT 
    o.id,
    o.order_code,
    o.customer_name,
    o.status::text,
    o.runner_status::text,
    o.created_at
  FROM public.orders o
  WHERE 
    -- Search filter
    (o.order_code ILIKE '%' || p_query || '%' 
     OR o.customer_name ILIKE '%' || p_query || '%')
    -- Visibility filter based on role
    AND (
      v_visible_ids IS NULL  -- Admin sees all
      OR o.salesperson_id = ANY(v_visible_ids)  -- Visible salespersons
      OR o.runner_id = v_user_id  -- Runner sees their assigned orders
      OR o.driver_id = v_user_id  -- Driver sees their assigned orders
    )
  ORDER BY o.created_at DESC
  LIMIT p_limit;
END;
$$;
```

### 2. Update GlobalSearchBar Component

Modify `src/components/GlobalSearchBar.tsx` to:
- Use the new `search_visible_orders` RPC instead of direct table query
- Display `runner_status` in addition to `status` for better context
- Improve navigation to handle all order statuses (DELIVERED, CANCELLED, etc.)

| File | Changes |
|------|---------|
| `src/components/GlobalSearchBar.tsx` | Replace direct `orders` query with `search_visible_orders` RPC call |

### 3. Navigation Improvements

Update the result click handler to navigate to the correct page based on both `status` and `runner_status`:
- BOOKING status → `/sales/booking`
- READY status + DELIVERED runner_status → `/runner/delivered-orders`
- READY status + FAILED_DELIVERY → `/sales/action-inbox`
- READY status (other) → `/sales/ready`
- CANCELLED status → `/sales/cancelled`

## Technical Details

**Current Search (broken):**
```typescript
const { data, error } = await supabase
  .from('orders')
  .select('id, order_code, customer_name, status, created_at')
  .or(`order_code.ilike.%${query}%,customer_name.ilike.%${query}%`)
```

**New Search (fixed):**
```typescript
const { data, error } = await supabase
  .rpc('search_visible_orders', {
    p_query: query,
    p_limit: 8
  });
```

## Expected Results
- Runners will find orders assigned to them
- Managers will find orders from their team members
- Salespersons will find their own orders + shared subjects
- Admins will find all orders
- Search results show status badge indicating order state
- Clicking a result navigates to the appropriate page
