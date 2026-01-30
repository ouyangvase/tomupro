
# Plan: Allow Runners to See Managers in User Filter Dropdown

## Problem
The "All Users" filter dropdown on the Delivered Orders page only shows salespersons, not managers. Users like Emily, Allen, Derick, Kaiwei, Chloe, Ahbii, CEO Levan, HC, ZC are all managers but don't appear in the dropdown for runners.

## Root Cause
The Row Level Security (RLS) policy on the `user_directory` table restricts what users runners can see:

```sql
-- Current policy (line 26-36)
CREATE POLICY "Runner can read relevant directory entries"
ON public.user_directory FOR SELECT
USING (
  public.get_user_role(auth.uid()) = 'runner'
  AND (
    id = auth.uid()
    OR role = 'driver'
    OR role IN ('salesperson', 'runner')  -- ❌ Missing 'manager'!
  )
);
```

Managers have orders too (they can be salespersons themselves), so runners need to see them in the filter dropdown.

## Solution
Update the RLS policy to include managers in the list of visible roles for runners.

## Changes Required

### Database Migration

Update the runner policy on `user_directory` to include managers:

```sql
-- Drop existing runner policy
DROP POLICY IF EXISTS "Runner can read relevant directory entries" 
  ON public.user_directory;

-- Create updated policy including managers
CREATE POLICY "Runner can read relevant directory entries"
ON public.user_directory FOR SELECT
USING (
  public.get_user_role(auth.uid()) = 'runner'
  AND (
    id = auth.uid()
    OR role = 'driver'
    OR role IN ('salesperson', 'runner', 'manager')  -- ✅ Added 'manager'
  )
);
```

## Impact

| Role | Before | After |
|------|--------|-------|
| Runner viewing user dropdown | Sees salespersons only | Sees salespersons AND managers |
| Filter functionality | Cannot filter by manager orders | Can filter by any order owner |

## Files to Change

| Type | Description |
|------|-------------|
| Database Migration | Update RLS policy on `user_directory` to allow runners to see manager profiles |

No frontend code changes needed - the component already filters for `role === 'salesperson' || role === 'manager'` on line 345.
