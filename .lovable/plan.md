
# Fix: Action Required Page Not Showing Failed Orders for Managers with Data Sharing

## Problem Summary
The Action Required page shows 0 failed orders for managers who have data sharing or team member access configured. The database contains 42+ failed orders that should be visible to certain managers.

## Root Cause Analysis

### Database State
I queried the database and found:
- **42 failed orders** exist in the system (across Yao Xiang, Kaien, HC, yongjie, Evelyn)
- **3 managers have visibility** to other users via different sources:
  - **ZC**: Can see Yao Xiang (23 failed orders) via `user_data_shares`
  - **Chloe**: Can see HC, derrick, Qi Xiu (3 failed orders) via `user_data_shares`
  - **Emily**: Can see Evelyn, Xiao Tong, Yong Xin (1 failed order) via `group_members`

### The Bug
There are **two issues** causing the problem:

**Issue 1: Client-side `visibleIds` filter blocking valid orders**

In `SalespersonActionInbox.tsx` (lines 132-140):
```typescript
const actionRequiredOrders = useMemo(() => {
  let filtered = allOrders.filter(order => {
    // This filter may be too aggressive
    if (visibleIds !== null && Array.isArray(visibleIds) && !visibleIds.includes(order.salesperson_id)) {
      return false;  // <-- Blocks orders if visibleIds is stale or incomplete
    }
    return needsSalespersonAction(order);
  });
```

The `visibleIds` comes from `get_visible_owner_ids()` RPC. If this returns an empty array or hasn't loaded yet, orders are incorrectly filtered out.

**Issue 2: The RLS policy may not be returning orders**

The orders RLS policy `"Manager can view team orders"` uses:
```sql
is_in_manager_team(salesperson_id, auth.uid())
```

This calls the **two-parameter version** of `is_in_manager_team` which I verified DOES check `user_data_shares`. However, the `useOrders()` hook may not be receiving the orders if there's a timing issue or if the RLS check is failing for some reason.

## Solution

### Part 1: Add Debug Logging and Fix Client-Side Filter

**File: `src/pages/sales/SalespersonActionInbox.tsx`**

1. Add better handling for the `visibleIds` loading state
2. Show loading indicator while `visibleIds` is being fetched
3. Log visibility information for debugging
4. Fix the filter to not block orders when `visibleIds` is still loading

```typescript
// Before the filter, add loading state check
const { data: visibleIds, isLoading: visibleIdsLoading } = useQuery({...});

// Don't filter by visibleIds until it's loaded
const actionRequiredOrders = useMemo(() => {
  // Wait for visibility data before filtering
  if (visibleIdsLoading) return [];
  
  let filtered = allOrders.filter(order => {
    // Only apply visibility filter if we have the data
    if (visibleIds !== null && Array.isArray(visibleIds) && visibleIds.length > 0) {
      if (!visibleIds.includes(order.salesperson_id)) {
        return false;
      }
    }
    return needsSalespersonAction(order);
  });
  // ... rest of filtering
});
```

### Part 2: Fix Default View Mode for "Team Data"

The default view mode is `'my'` which shows only the manager's own orders:
```typescript
const { viewMode, ... } = useTeamViewState('my');  // Defaults to 'my'
```

When switching to "Team Data", if `selectedMember` is `'all'`, the filter should show all accessible orders. But there's a bug at line 152:
```typescript
} else if (selectedMember !== 'all') {
  filtered = filtered.filter(order => order.salesperson_id === selectedMember);
}
// If 'all' is selected, no additional filter - BUT visibleIds already filtered
```

The issue is that when `selectedMember === 'all'`, it relies on `visibleIds` to already have filtered correctly. But if `visibleIds` is empty/loading, no orders appear.

**Fix: Ensure "All Team" mode shows orders from ALL accessible team members**

```typescript
if (canViewGroup) {
  if (viewMode === 'my') {
    filtered = filtered.filter(order => order.salesperson_id === profile?.id);
  } else {
    // Team mode
    if (selectedMember !== 'all') {
      filtered = filtered.filter(order => order.salesperson_id === selectedMember);
    } else {
      // "All Team" - explicitly filter by manager ID + all team member IDs
      const accessibleIds = [profile?.id, ...teamMemberIds].filter(Boolean);
      if (accessibleIds.length > 0) {
        filtered = filtered.filter(order => accessibleIds.includes(order.salesperson_id));
      }
    }
  }
}
```

### Part 3: Fix `useTeamMembers` to Include All Sources

The `useTeamMembers` hook needs to ensure it fetches members from ALL binding sources:
- `manager_groups` + `group_members`
- `manager_salesperson_bindings`
- `profiles.manager_id`
- `user_data_shares`

**File: `src/hooks/useTeamMembers.ts`**

Add query for `manager_salesperson_bindings` (currently missing from the hook):

```typescript
// Add: Fetch from manager_salesperson_bindings
const { data: boundSalespersons, error: bindingsError } = await supabase
  .from('manager_salesperson_bindings')
  .select('salesperson:profiles!manager_salesperson_bindings_salesperson_id_fkey(*)')
  .eq('manager_id', user.id)
  .eq('active', true);

if (bindingsError) throw bindingsError;

for (const row of boundSalespersons ?? []) {
  const sp = row.salesperson as unknown as Profile;
  if (sp && sp.is_active && !seenIds.has(sp.id)) {
    seenIds.add(sp.id);
    allMembers.push({
      id: sp.id,
      display_name: sp.display_name,
      email: sp.email,
      role: sp.role,
      is_active: sp.is_active,
      avatar_url: sp.avatar_url,
      isShared: false,
    });
  }
}
```

### Part 4: Add Stats Debug Information

Add a small debug indicator to help troubleshoot visibility issues:

```typescript
// Add after the stats cards
{(role === 'admin' || role === 'manager') && (
  <div className="text-xs text-muted-foreground">
    Total orders fetched: {allOrders.length} | 
    Visible IDs: {visibleIds === null ? 'All (admin)' : (visibleIds?.length ?? 'loading')} |
    Team members: {teamMemberIds.length}
  </div>
)}
```

## Files to Change

| File | Change |
|------|--------|
| `src/pages/sales/SalespersonActionInbox.tsx` | Fix visibility filter, add loading state, fix "All Team" mode |
| `src/hooks/useTeamMembers.ts` | Add `manager_salesperson_bindings` query to include all team sources |

## Expected Outcome

After implementation:
1. **ZC** viewing "Action Required" in Team Data mode will see **23 failed orders** from Yao Xiang
2. **Chloe** will see **3 failed orders** from HC
3. **Emily** will see **1 failed order** from Evelyn
4. Managers without any bindings will see only their own orders (correctly showing 0 if they have none)

## Technical Notes

### Why the Bug Exists
The visibility logic is split between:
1. **RLS policies** (server-side) - using `is_in_manager_team(salesperson_id, auth.uid())`
2. **Client-side filter** (JavaScript) - using `visibleIds` from `get_visible_owner_ids()` RPC
3. **UI filter** (React state) - using `viewMode` and `selectedMember`

When these three layers don't align, orders can be incorrectly filtered out. The fix ensures they all use the same source of truth.

### RLS Function Verification
I verified that the two-parameter `is_in_manager_team(p_user_id, p_manager_id)` function correctly returns `true` for data share relationships:
```sql
SELECT public.is_in_manager_team(
  'a8a12027-ccf4-4f8a-9c8d-ea952319912f', -- Yao Xiang
  '4c236c3d-4ee2-44b6-ab04-84e53649cfdb'  -- ZC
) -- Returns TRUE
```

This confirms RLS should be returning the orders - the issue is the client-side filtering.
