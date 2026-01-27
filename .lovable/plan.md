
# Critical Fix: Authentication and Role Loading Issues

## Problem Summary

The app has three critical issues:

1. **All users display as "Salesperson"** - When profile fetch fails (503 errors), the app defaults to salesperson role
2. **Loading spinner hangs indefinitely** - No timeout or retry for database errors
3. **Sign out stuck on "Signing out..."** - No timeout for auth operations

## Root Cause

### The Core Problem: Unsafe Fallback to "Salesperson"

```typescript
// AppSidebar.tsx line 328 - BAD
const userRole = profile?.role || 'salesperson';  // Falls back when profile is null!
```

When the database returns 503 (transient schema cache errors), the profile fetch fails and `profile` remains `null`. The code then falls back to `'salesperson'`, causing:
- Sidebar shows wrong role
- Wrong menu items displayed
- Wrong dashboard rendered

## Solution

### Part 1: Remove Unsafe Role Fallbacks

**Files to modify:**

1. **`src/components/layout/AppSidebar.tsx`**
   - Change line 328 from `profile?.role || 'salesperson'` to `profile?.role`
   - Add loading state when role is undefined
   - Show skeleton/loading UI until role is available

2. **`src/pages/Dashboard.tsx`**
   - Add check for `!role` and show loading spinner instead of defaulting to SalespersonDashboard
   - Remove the `default:` case that falls back to SalespersonDashboard

3. **`src/pages/dashboard/MobileDashboard.tsx`**
   - Same fix - show loading when role is null instead of defaulting

### Part 2: Add Retry Logic for Profile Fetch

**File**: `src/contexts/AuthContext.tsx`

Add retry with exponential backoff when profile fetch fails:

```typescript
const fetchProfile = useCallback(async (userId: string, retryCount = 0) => {
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  
  if (error && retryCount < maxRetries) {
    // Exponential backoff: 1s, 2s, 4s
    const delay = baseDelay * Math.pow(2, retryCount);
    console.warn(`Profile fetch failed, retrying in ${delay}ms...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return fetchProfile(userId, retryCount + 1);
  }
  
  if (!error && data) {
    // ... existing profile processing
  }
}, [previousRole, handleAccountDisabled]);
```

### Part 3: Fix Loading State Race Condition

**File**: `src/contexts/AuthContext.tsx`

Don't set `loading = false` until profile is fetched:

```typescript
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Fetch profile BEFORE setting loading to false
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);  // Only set after profile is fetched
    }
  );
  // ...
}, [fetchProfile]);
```

### Part 4: Add Timeout for Sign Out

**File**: `src/contexts/AuthContext.tsx`

Add timeout to prevent signout from hanging:

```typescript
const signOut = async () => {
  if (signingOut) return;
  setSigningOut(true);
  
  // Add 5-second timeout for signout
  const signOutPromise = supabase.auth.signOut();
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Signout timeout')), 5000)
  );
  
  try {
    await Promise.race([signOutPromise, timeoutPromise]);
  } catch (error) {
    console.warn('Sign out error:', error);
  }
  
  // Always clear local state regardless of API response
  // ... existing cleanup code
};
```

## Summary of Changes

| File | Change |
|------|--------|
| `src/components/layout/AppSidebar.tsx` | Remove fallback to 'salesperson', show loading state |
| `src/pages/Dashboard.tsx` | Show loading when role is null, remove default case |
| `src/pages/dashboard/MobileDashboard.tsx` | Show loading when role is null, remove default case |
| `src/contexts/AuthContext.tsx` | Add retry logic, fix loading race condition, add signout timeout |

## Expected Outcome

After implementation:

1. **Correct role display** - Users see their actual role, not a fallback
2. **Graceful error handling** - Transient 503 errors are retried automatically
3. **No more loading hangs** - Profile fetch has timeout and retry
4. **Sign out works reliably** - Has 5-second timeout to prevent hanging

## Technical Notes

### Why 503 PGRST002 Errors Occur
These are transient Supabase PostgREST schema cache refresh errors. They self-resolve but the app needs to retry gracefully instead of failing silently.

### Why Default Fallback is Dangerous
Defaulting to any role when the actual role is unknown is a security and UX issue:
- Admins see only salesperson features
- Runners can't access their tools
- Users get confused about their access level
