
# Fix: Failed Orders Not Showing in Action Required for Managers

## Problem Summary

Failed delivery orders are not appearing in the Action Required page for managers, even though:
1. The orders exist in the database (42 total failed orders)
2. The RLS policies should allow visibility
3. The `SalespersonActionInbox.tsx` has the correct filtering logic

## Root Cause

There are two separate issues creating the problem:

### Issue 1: `useManagerActionRequiredStats` Hook Missing Data Sources

The `useManagerActionRequiredStats` hook in `src/hooks/useActionRequiredStats.ts` only queries two binding sources:
1. `manager_salesperson_bindings`
2. `group_members` via `manager_groups`

But it's **missing** two additional sources that `get_visible_owner_ids` RPC and `useTeamMembers` include:
- `user_data_shares` (for data sharing feature)
- `profiles.manager_id` (legacy binding)

This causes the dashboard stats to show 0 even when team members have failed orders.

### Issue 2: `SalespersonActionInbox.tsx` Uses `useOrders()` Without Visibility Filter

The Action Required page calls `useOrders()` which fetches ALL orders visible via RLS. However:
1. The RLS on `orders` table uses `is_in_manager_team()` which DOES include data shares
2. But the frontend filtering at lines 157-159 uses `teamMemberIds` from `useTeamMembers()`
3. This creates a mismatch where RLS returns the correct data, but the frontend filter may not align

Currently, `useTeamMembers()` correctly includes all sources, so the main issue is the stats hook.

## Solution

### Part 1: Update `useManagerActionRequiredStats` to Include All Team Sources

Modify the hook to use the same visibility sources as `get_visible_owner_ids`:
1. Add `user_data_shares` query for subjects with `scope_orders = true`
2. Add `profiles.manager_id` query for legacy bindings

### Part 2: Use Server-Side RPC for Consistency

As a more robust solution, the stats hook should use the existing `get_visible_owner_ids` RPC to ensure consistency with RLS policies.

## Files to Change

| File | Change |
|------|--------|
| `src/hooks/useActionRequiredStats.ts` | Add `user_data_shares` and `profiles.manager_id` to team member aggregation in `useManagerActionRequiredStats` |

## Technical Details

### Current Code (Missing Sources)
```typescript
// Lines 127-150 in useActionRequiredStats.ts
const [bindingsRes, groupMembersRes] = await Promise.all([
  // 1. manager_salesperson_bindings
  // 2. group_members
]);

const allMemberIds = [...new Set([user.id, ...bindingMemberIds, ...groupMemberIds])];
```

### Fixed Code (All Sources)
```typescript
const [bindingsRes, groupMembersRes, legacyRes, sharesRes] = await Promise.all([
  // 1. manager_salesperson_bindings (canonical)
  supabase
    .from('manager_salesperson_bindings')
    .select('salesperson_id')
    .eq('manager_id', user.id)
    .eq('active', true),
  
  // 2. group_members via manager_groups (backward compat)
  supabase
    .from('group_members')
    .select('member_user_id, manager_groups!inner(manager_user_id)')
    .eq('manager_groups.manager_user_id', user.id),
  
  // 3. profiles.manager_id (legacy binding)
  supabase
    .from('profiles')
    .select('id')
    .eq('manager_id', user.id)
    .eq('is_active', true),
  
  // 4. user_data_shares (data sharing feature)
  supabase
    .from('user_data_shares')
    .select('subject_user_id')
    .eq('viewer_user_id', user.id)
    .eq('active', true)
    .eq('scope_orders', true)
]);

const bindingMemberIds = bindingsRes.data?.map(b => b.salesperson_id) || [];
const groupMemberIds = groupMembersRes.data?.map(gm => gm.member_user_id) || [];
const legacyMemberIds = legacyRes.data?.map(p => p.id) || [];
const sharedSubjectIds = sharesRes.data?.map(s => s.subject_user_id) || [];

const allMemberIds = [...new Set([
  user.id,
  ...bindingMemberIds,
  ...groupMemberIds,
  ...legacyMemberIds,
  ...sharedSubjectIds
])];
```

## Visibility Source Alignment

After this fix, all visibility logic will be aligned:

| Component | Sources Used |
|-----------|--------------|
| `get_visible_owner_ids` RPC | msb + groups + profiles.manager_id + user_data_shares |
| `is_in_manager_team` RLS | msb + groups + profiles.manager_id + user_data_shares |
| `useTeamMembers` hook | msb + groups + profiles.manager_id + user_data_shares |
| `useManagerActionRequiredStats` | msb + groups + profiles.manager_id + user_data_shares (AFTER FIX) |

## Expected Outcome

After this fix:
1. Dashboard "Team Action Required" card will show the correct count (including failed orders from shared subjects)
2. Action Required page will display all failed orders from the manager's team and shared subjects
3. Stats breakdown (Failed, Rescheduled, Notes) will be accurate

## Test Verification

For Emily (manager with 1 failed order for team member Evelyn):
- Before fix: Shows 0 action required
- After fix: Shows 1 action required (EV110 - Evelyn's failed order)
