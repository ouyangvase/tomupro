

# Fix Data Sharing Visibility - Missing RLS Policy

## Problem Identified

When a manager (Emily) clicks "Team Data", it shows "No team members or shared access" even though data sharing is configured correctly in the database.

**Root Cause**: The `profiles` table RLS policies do not allow managers to view profiles of users they have active data shares with.

### Evidence from Network Logs
```
Request: GET user_data_shares?...viewer_user_id=eq.5ecadf18-f601-47e0-bacb-0efafe811196
Response: [{"subject":null}, {"subject":null}]
```

Emily can read the `user_data_shares` rows (2 records returned), but the JOIN to `profiles` for the `subject` field returns `null` because RLS blocks her from seeing those profiles.

---

## Solution

Add a new RLS policy on `profiles` table that allows managers to read profiles of users they have active data shares with.

### Database Migration

```sql
-- Allow managers to view profiles of users they have active data shares with
CREATE POLICY "manager_can_view_shared_subject_profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    get_user_role(auth.uid()) = 'manager'::app_role
    AND EXISTS (
      SELECT 1 
      FROM user_data_shares uds
      WHERE uds.viewer_user_id = auth.uid()
        AND uds.subject_user_id = profiles.id
        AND uds.active = true
    )
  );
```

This policy:
1. Only applies to users with `manager` role
2. Allows SELECT access to profiles
3. Only for profiles where there's an active data share with the manager as the viewer

---

## Implementation Steps

### Step 1: Create Database Migration

Create a new migration file to add the RLS policy:

**File**: `supabase/migrations/[timestamp]_add_shared_subject_profile_visibility.sql`

```sql
-- Add RLS policy for managers to view profiles of shared subjects
CREATE POLICY "manager_can_view_shared_subject_profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    get_user_role(auth.uid()) = 'manager'::app_role
    AND EXISTS (
      SELECT 1 
      FROM user_data_shares uds
      WHERE uds.viewer_user_id = auth.uid()
        AND uds.subject_user_id = profiles.id
        AND uds.active = true
    )
  );
```

---

## Expected Outcome

After this fix:

1. Emily clicks "Team Data" → Sees dropdown with "Xiao Tong (Shared)" and "Yong Xin (Shared)"
2. The query `user_data_shares?select=subject:profiles!...(*)` returns actual profile data instead of `null`
3. Orders for shared users become visible in Ready Sales, Booking Sales, etc.

---

## Technical Details

### Why The Current Code Works (After RLS Fix)

The `useTeamMembers` hook already includes the query for shared subjects:
```typescript
// Line 91-99 of useTeamMembers.ts
const { data: sharedSubjects } = await supabase
  .from('user_data_shares')
  .select(`subject:profiles!user_data_shares_subject_user_id_fkey(*)`)
  .eq('viewer_user_id', user.id)
  .eq('active', true)
  .eq('scope_orders', true);
```

The query is correct, but the JOIN fails because RLS blocks access to the `profiles` table for those specific users. Once the RLS policy is added, this same query will work.

### Security Considerations

The new policy is secure because:
- Only managers can use it (`get_user_role()` check)
- Only allows SELECT, not UPDATE/DELETE
- Only reveals profiles that the admin has explicitly granted access to via `user_data_shares`
- The `user_data_shares` table itself is admin-controlled

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/[new].sql` | Add RLS policy for shared subject profile visibility |

**No code changes needed** - the hooks and components are already correctly implemented.

