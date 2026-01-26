

# Remove Manager Bindings and Use Data Shares for Team View

## Summary of Issues

| Issue | Root Cause | Solution |
|-------|------------|----------|
| 1. Remove manager bindings | manager_groups + group_members still has 10 entries | Delete all data from these tables |
| 2. Team Data shows wrong users | TeamViewToggle uses manager_groups, not user_data_shares | Rewrite to use user_data_shares |
| 3. Sign in/out timeouts (504) | RLS policies querying manager_groups/group_members cause slow queries | Simplify RLS by removing obsolete checks |

## Current Data State

| Table | Count | Action |
|-------|-------|--------|
| manager_salesperson_bindings | 0 active | Already empty |
| manager_groups | 9 groups | DELETE all |
| group_members | 10 members | DELETE all |
| user_data_shares | 2 active | Keep (this is the new system) |

---

## Part 1: Database Cleanup - Remove All Manager Bindings

Delete all data from the legacy manager binding tables:

```sql
-- Delete all group members first (FK dependency)
DELETE FROM group_members;

-- Delete all manager groups
DELETE FROM manager_groups;

-- Delete any inactive manager_salesperson_bindings (cleanup)
DELETE FROM manager_salesperson_bindings;
```

---

## Part 2: Update TeamViewToggle to Use Data Shares

Replace the manager_groups-based `useTeamMembers` logic with `useDataShares`.

### File: `src/hooks/useTeamMembers.ts`

**Before:**
```typescript
// Primary source of truth: manager_groups + group_members
const { data: groups } = await supabase
  .from('manager_groups')
  .select('id')
  .eq('manager_user_id', user.id);
```

**After:**
```typescript
// Primary source of truth: user_data_shares (subjects the manager can view)
const { data: shares } = await supabase
  .from('user_data_shares')
  .select('subject:profiles!user_data_shares_subject_user_id_fkey(*)')
  .eq('viewer_user_id', user.id)
  .eq('active', true)
  .eq('scope_orders', true);  // Only include shares with orders access
```

### File: `src/components/filters/TeamViewToggle.tsx`

Update to use the new data shares-based team members:

```typescript
// Now "Team Data" shows users from user_data_shares
const { data: teamMembers = [] } = useTeamMembers();  // Updated implementation
```

---

## Part 3: Fix RLS Performance (Sign In/Out Issues)

The RLS policies reference `manager_groups` and `group_members` in complex subqueries, causing timeouts. After removing the data, we should also simplify the RLS policies.

### Affected RLS Policies (to simplify)

| Table | Policy | Action |
|-------|--------|--------|
| profiles | manager_view_group_profiles | Remove - no longer needed |
| warehouses | Manager can view team warehouses | Simplify to use user_data_shares |
| inbound_shipments | Manager can view own and team inbound | Simplify |
| products | Multiple manager policies | Consolidate |

### Example RLS Simplification:

**Before (slow):**
```sql
CREATE POLICY "Manager can view team products" ON products
  FOR SELECT USING (
    (get_user_role(auth.uid()) = 'manager') AND (
      owner_user_id = auth.uid()
      OR is_in_manager_team(owner_user_id, auth.uid())  -- Queries manager_groups
    )
  );
```

**After (fast):**
```sql
CREATE POLICY "Manager can view team products" ON products
  FOR SELECT USING (
    (get_user_role(auth.uid()) = 'manager') AND (
      owner_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM user_data_shares uds
        WHERE uds.viewer_user_id = auth.uid()
          AND uds.subject_user_id = products.owner_user_id
          AND uds.active = true
          AND uds.scope_products = true
      )
    )
  );
```

---

## Part 4: Update Server-Side RPC

### Function: `get_visible_owner_ids`

Update to use user_data_shares instead of manager_groups:

```sql
CREATE OR REPLACE FUNCTION public.get_visible_owner_ids()
RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role app_role;
  v_user_id uuid;
  v_result uuid[];
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM profiles WHERE id = v_user_id;
  
  -- Admin sees all
  IF v_role = 'admin' THEN
    RETURN NULL;
  END IF;
  
  -- Start with own ID
  v_result := ARRAY[v_user_id];
  
  -- For managers/salespersons: add data share subjects
  SELECT v_result || array_agg(subject_user_id)
  INTO v_result
  FROM user_data_shares
  WHERE viewer_user_id = v_user_id
    AND active = true;
  
  RETURN v_result;
END;
$$;
```

---

## Summary of Changes

| Component | Change | Impact |
|-----------|--------|--------|
| **Database** | Delete all manager_groups and group_members | Cleans up obsolete binding system |
| **Database** | Simplify RLS policies | Fixes 504 timeout errors on login |
| **Database** | Update get_visible_owner_ids RPC | Uses user_data_shares for visibility |
| `src/hooks/useTeamMembers.ts` | Rewrite to use user_data_shares | Team Data shows shared users |
| `src/hooks/useTeamVisibility.ts` | Remove manager_groups references | Cleaner implementation |
| `src/hooks/useActionRequiredStats.ts` | Remove manager_groups fallback | Uses only user_data_shares |

---

## Expected Results

| Before | After |
|--------|-------|
| Team Data shows manager_groups members | Team Data shows user_data_shares subjects |
| Login times out with 504 errors | Login completes quickly |
| Complex RLS with multiple binding tables | Simple RLS using only user_data_shares |
| manager_groups: 9 groups, 10 members | manager_groups: empty (table can be dropped later) |

---

## Data Shares Already Configured

User **Chloe** (manager) has 2 data shares:
1. Can view **derrick** (manager) - orders, products, stock, inbound
2. Can view **Qi Xiu** (salesperson) - orders, products, stock, inbound

After this change, when Chloe selects "Team Data", she will see derrick + Qi Xiu's data instead of the old manager_groups members.

