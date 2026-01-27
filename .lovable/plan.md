
# Fix Data Sharing Visibility for Orders

## Problem

Data sharing is configured (Emily can see Xiao Tong and Yong Xin's data), but:
1. The "Team Data" toggle shows "No team members assigned yet"
2. No orders appear in Booking Sales, Ready Sales, Delivered Orders, etc.

## Root Cause Analysis

### What's Working
- `user_data_shares` table has correct records (viewer: Emily, subjects: Xiao Tong, Yong Xin)
- `get_accessible_owner_ids()` RPC correctly includes shared subjects
- `is_in_manager_team()` function includes data share visibility

### What's Broken
The `TeamViewToggle` component and `useTeamViewState()` hook only check for team members via:
- `manager_salesperson_bindings` (empty for Emily)
- `manager_groups` + `group_members` (empty for Emily)
- `profiles.manager_id` (empty for Emily)

They do NOT check `user_data_shares`, causing "No team members assigned yet" and empty filter arrays.

## Solution

### Phase 1: Update useTeamMembers Hook

Modify `src/hooks/useTeamMembers.ts` to include shared subjects as "virtual team members":

```typescript
// Add shared subjects to team members for managers
const { data: sharedSubjects } = await supabase
  .from('user_data_shares')
  .select(`
    subject:profiles!user_data_shares_subject_user_id_fkey(*)
  `)
  .eq('viewer_user_id', user.id)
  .eq('active', true)
  .eq('scope_orders', true);

// Combine traditional team members with shared subjects
const allMembers = [
  ...traditionalTeamMembers,
  ...sharedSubjects.map(s => s.subject)
];
```

### Phase 2: Update TeamViewToggle Component

Modify `src/components/filters/TeamViewToggle.tsx`:

1. Add option to show shared subjects alongside team members
2. Update the empty state message to differentiate between "no team bindings" and "shared access available"

```typescript
// Import shared subjects hook
import { useMySharedAccess } from '@/hooks/useDataSharing';

// In component
const { data: sharedAccess = [] } = useMySharedAccess();
const ordersSharedAccess = sharedAccess.filter(s => s.scopes.orders);

// Combine for display
const hasTeamOrSharedAccess = teamMembers.length > 0 || ordersSharedAccess.length > 0;

// Update dropdown to show shared users
{ordersSharedAccess.map((share) => (
  <SelectItem key={share.subjectId} value={share.subjectId}>
    {share.subjectName} (Shared)
  </SelectItem>
))}
```

### Phase 3: Update useTeamViewState Hook

Modify `useTeamViewState()` in `src/components/filters/TeamViewToggle.tsx`:

```typescript
export function useTeamViewState(defaultViewMode: ViewMode = 'my') {
  const { role, profile } = useAuth();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: sharedAccess = [] } = useMySharedAccess();
  
  // Combine team members and shared subjects for orders
  const allAccessibleMembers = useMemo(() => {
    const ordersShares = sharedAccess.filter(s => s.scopes.orders);
    return [
      ...teamMembers.map(m => ({ id: m.id, displayName: m.display_name, isShared: false })),
      ...ordersShares.map(s => ({ id: s.subjectId, displayName: s.subjectName, isShared: true })),
    ];
  }, [teamMembers, sharedAccess]);
  
  const getFilteredSalespersonIds = (): string[] | undefined => {
    if (role !== 'manager' || !profile?.id) return undefined;
    
    if (viewMode === 'my') {
      return [profile.id];
    }
    
    // Team Data mode - include all accessible
    if (selectedMember === 'all') {
      return [profile.id, ...allAccessibleMembers.map(m => m.id)];
    }
    
    return [selectedMember];
  };
  
  return {
    // ... existing returns
    hasTeamOrSharedAccess: allAccessibleMembers.length > 0,
    allAccessibleMembers,
  };
}
```

### Phase 4: Update Order Pages

Update pages to use the enhanced hook correctly:

**Files to modify:**
- `src/pages/sales/BookingSales.tsx`
- `src/pages/sales/ReadySales.tsx`
- `src/pages/sales/CancelledSales.tsx`
- `src/pages/runner/RunnerDeliveredOrders.tsx`
- `src/pages/sales/SalespersonActionInbox.tsx`

The existing integration should work once the hook returns the correct IDs.

## Alternative Approach: Replace with DataScopeSelector

Instead of modifying TeamViewToggle, we could replace it entirely with `DataScopeSelector` which was designed for data sharing:

1. Replace `TeamViewToggle` import with `DataScopeSelector`
2. Use `useVisibleUserIds(scope)` hook for filtering
3. Remove `useTeamViewState()` usage

This is cleaner but requires more extensive changes to each page.

## Implementation Files

| File | Change |
|------|--------|
| `src/hooks/useTeamMembers.ts` | Include shared subjects in team member results |
| `src/components/filters/TeamViewToggle.tsx` | Add shared access integration and update useTeamViewState |
| `src/pages/sales/BookingSales.tsx` | Use updated hook (minimal changes) |
| `src/pages/sales/ReadySales.tsx` | Use updated hook (minimal changes) |
| `src/pages/sales/CancelledSales.tsx` | Use updated hook (minimal changes) |
| `src/pages/runner/RunnerDeliveredOrders.tsx` | Use updated hook (minimal changes) |

## Expected Outcome

After implementation:
1. Emily sees "Team Data" toggle with Xiao Tong and Yong Xin listed
2. Switching to "Team Data" shows all 145+ orders from those salespersons
3. "All Team" option shows combined data
4. Individual salesperson selection works

## Technical Details

### Database Verification
Current data confirms setup is correct:
- Emily (5ecadf18-f601-47e0-bacb-0efafe811196) is a manager
- Has active shares to view Xiao Tong and Yong Xin with all scopes enabled
- Orders exist: 6 BOOKING, 135+ READY, 2 CANCELLED for these salespersons

### Why RPC Works But UI Doesn't
The `get_accessible_owner_ids()` RPC is called correctly and returns the right IDs. However, the UI components that display team options use a DIFFERENT data source (`useTeamMembers`) that doesn't query `user_data_shares`.
