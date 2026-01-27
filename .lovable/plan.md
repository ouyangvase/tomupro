
# Fix Data Sharing Visibility for Orders

## Problem Summary

When Emily (manager) selects "Team Data" and chooses "Xiao Tong (Shared)", the page shows "No ready orders" even though:
1. The data share exists and is active
2. Xiao Tong appears correctly in the dropdown
3. Xiao Tong has orders in the database

## Root Cause

The `get_visible_owner_ids()` database function does NOT include shared subjects from `user_data_shares`. It only checks traditional team bindings:
- `manager_salesperson_bindings`
- `manager_groups` + `group_members`  
- `profiles.manager_id`

When `useTeamOrders` passes `salespersonIds` that include shared users, the hook validates them against `visibleUserIds` from the RPC. Since Xiao Tong's ID is not in the RPC result, it gets filtered out and returns empty results.

**Network Evidence:**
```
RPC get_visible_owner_ids returns: ["5ecadf18-f601-47e0-bacb-0efafe811196"] (only Emily)
Expected: ["5ecadf18-f601-47e0-bacb-0efafe811196", "6e8d5ac8-92f7-49f7-97ef-875a86dc994c"] (Emily + Xiao Tong)
```

---

## Solution

### Database Migration: Update `get_visible_owner_ids()` Function

Add `user_data_shares` to the visibility calculation for all roles (managers and others who have shares):

```sql
CREATE OR REPLACE FUNCTION public.get_visible_owner_ids()
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role app_role;
  v_result uuid[];
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  v_role := public.get_user_role(v_user_id);

  -- Admin can see all - return NULL to indicate no filter
  IF v_role = 'admin' THEN
    RETURN NULL;
  END IF;

  -- Salesperson: own data + any shared subjects
  IF v_role = 'salesperson' THEN
    SELECT ARRAY[v_user_id] || COALESCE(
      array_agg(DISTINCT uds.subject_user_id) FILTER (WHERE uds.subject_user_id IS NOT NULL),
      ARRAY[]::uuid[]
    )
    INTO v_result
    FROM public.user_data_shares uds
    WHERE uds.viewer_user_id = v_user_id
      AND uds.active = true
      AND uds.scope_orders = true;
    
    RETURN v_result;
  END IF;

  -- Manager: own + bound salespersons + shared subjects
  IF v_role = 'manager' THEN
    SELECT ARRAY[v_user_id] || COALESCE(
      array_agg(DISTINCT member_id) FILTER (WHERE member_id IS NOT NULL),
      ARRAY[]::uuid[]
    )
    INTO v_result
    FROM (
      -- Canonical: manager_salesperson_bindings
      SELECT msb.salesperson_id AS member_id
      FROM public.manager_salesperson_bindings msb
      WHERE msb.manager_id = v_user_id
        AND msb.active = true

      UNION

      -- Backward compat: manager_groups + group_members
      SELECT gm.member_user_id AS member_id
      FROM public.manager_groups mg
      JOIN public.group_members gm ON gm.group_id = mg.id
      WHERE mg.manager_user_id = v_user_id

      UNION

      -- Backward compat: profiles.manager_id
      SELECT p.id AS member_id
      FROM public.profiles p
      WHERE p.manager_id = v_user_id
        AND p.is_active = true

      UNION

      -- NEW: Data sharing subjects (scope_orders = true)
      SELECT uds.subject_user_id AS member_id
      FROM public.user_data_shares uds
      WHERE uds.viewer_user_id = v_user_id
        AND uds.active = true
        AND uds.scope_orders = true
    ) team;

    RETURN v_result;
  END IF;

  -- Runner (and any other role): own data + any shared subjects
  SELECT ARRAY[v_user_id] || COALESCE(
    array_agg(DISTINCT uds.subject_user_id) FILTER (WHERE uds.subject_user_id IS NOT NULL),
    ARRAY[]::uuid[]
  )
  INTO v_result
  FROM public.user_data_shares uds
  WHERE uds.viewer_user_id = v_user_id
    AND uds.active = true
    AND uds.scope_orders = true;
  
  RETURN v_result;
END;
$$;
```

---

## Technical Details

### What This Fix Does

1. **For Managers**: Adds `user_data_shares` subjects to the UNION query that builds visible IDs
2. **For Salespersons**: Adds support for shared data (previously hardcoded to own ID only)
3. **For Runners/Others**: Adds support for shared data

### Why This Works

The `useTeamOrders` hook validates passed `salespersonIds` against the RPC result:
```typescript
const allowedIds = filters.salespersonIds.filter(id => visibleUserIds.includes(id));
```

After the fix, when Emily selects Xiao Tong:
- RPC returns: `[Emily's ID, Xiao Tong's ID]`
- Passed salespersonIds: `[Xiao Tong's ID]`
- allowedIds: `[Xiao Tong's ID]` ✅ (no longer filtered out)

### Dashboard Stats Sync

The same `get_visible_owner_ids()` function is used by:
- `get_team_orders` RPC
- `useManagerStats` hook
- Dashboard statistics queries

So fixing this function automatically fixes all dashboard and stats visibility issues.

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/[new].sql` | Update `get_visible_owner_ids()` to include `user_data_shares` |

No frontend code changes needed - the existing hooks already handle the IDs correctly once they're included in the RPC result.

---

## Expected Outcome

After implementation:
1. Emily selects "Team Data" → "Xiao Tong (Shared)"
2. Orders from Xiao Tong appear in Ready Sales, Booking Sales, etc.
3. Dashboard stats include Xiao Tong's orders in team totals
4. Action Required shows items from shared users
