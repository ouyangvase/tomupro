

# Fix 503 Notification Query Timeout

## Problem

The `useNotificationSystem.ts` hook is querying the notifications table **without a user_id filter**, causing:
- RLS policy to evaluate a subquery `(SELECT profiles.role FROM profiles...)` for all 3,247+ rows
- Statement timeout errors (8 errors in the last hour)
- 503 Service Unavailable responses

## Root Cause

**File:** `src/hooks/useNotificationSystem.ts`

**Line 31-35 (useNotifications):**
```typescript
const { data, error } = await supabase
  .from('notifications')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(100);  // Missing .eq('user_id', user.id)
```

**Line 52-55 (useUnreadCount):**
```typescript
const { count, error } = await supabase
  .from('notifications')
  .select('*', { count: 'exact', head: true })
  .eq('is_read', false);  // Missing .eq('user_id', user.id)
```

Compare to the correct version in `src/hooks/useNotifications.ts` which properly filters by user_id.

## Solution

### Phase 1: Fix Notification Queries

Update `src/hooks/useNotificationSystem.ts`:

**Fix useNotifications (line 31-35):**
```typescript
const { data, error } = await supabase
  .from('notifications')
  .select('*')
  .eq('user_id', user.id)  // Add user filter
  .order('created_at', { ascending: false })
  .limit(100);
```

**Fix useUnreadCount (line 52-55):**
```typescript
const { count, error } = await supabase
  .from('notifications')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', user.id)  // Add user filter
  .eq('is_read', false);
```

### Phase 2: Add Missing Index for Sorting (Optional Performance Enhancement)

Add an index for the `created_at` sort operation:

```sql
CREATE INDEX IF NOT EXISTS idx_notifications_user_created 
  ON notifications(user_id, created_at DESC);
```

This index covers:
- Filter by user_id
- Order by created_at DESC
- Efficient for LIMIT queries

## Impact

| Before | After |
|--------|-------|
| Scans all 3,247+ rows with RLS subquery | Uses index on user_id |
| Statement timeout after 8s | Query completes in ~50ms |
| 503 Service Unavailable | Reliable responses |

## About the CORS Errors

The CORS errors on `lovable.dev/auth-bridge` are **not related to your code**. They are:
- Platform-level authentication infrastructure
- Related to manifest.json requests for PWA features
- Not affecting app functionality

These are expected in certain preview scenarios and can be safely ignored.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useNotificationSystem.ts` | Add `.eq('user_id', user.id)` to 2 queries |
| Database (optional) | Add `idx_notifications_user_created` index |

## Technical Details

### Why This Causes Timeouts

1. Query arrives: `SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100`
2. RLS policy evaluates for EACH row: `user_id = auth.uid() OR (recipient_role = (SELECT role FROM profiles...))`
3. The subquery `SELECT role FROM profiles WHERE id = auth.uid()` runs 3,247 times
4. Total time exceeds 8-second statement timeout
5. 503 error returned to client

### Why Adding user_id Filter Fixes It

1. Query becomes: `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`
2. Index `idx_notifications_user_unread(user_id, is_read)` is used
3. Only matching rows are evaluated by RLS (typically ~50-100 rows)
4. Query completes in milliseconds

