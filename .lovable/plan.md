
# Fix: Infinite Loading Loop Due to useEffect Dependency

## Problem Summary

The app is stuck in an infinite blinking/loading loop after login for **all users** on **both preview and published** URLs. The loop never stops and the dashboard never loads.

## Root Cause

In `src/contexts/AuthContext.tsx` (line 352), the main auth initialization `useEffect` includes `profile` in its dependency array:

```typescript
useEffect(() => {
  // ... initialization logic including initializeAuth()
}, [fetchProfile, clearAuthState, validateSession, profile]);  // ← profile causes the loop
```

This creates an infinite loop:

1. User logs in successfully
2. `initializeAuth()` runs, validates session, fetches profile
3. `setProfile(newProfile)` is called → profile state changes
4. The `useEffect` re-runs because `profile` changed
5. `initializeAuth()` runs again, fetches profile again
6. `setProfile()` called again → profile state changes
7. Loop repeats infinitely

The console logs confirm this pattern - we see repeated:
- `[Auth] Initializing auth...`
- `[Auth] Profile loaded successfully`
- `Cleaning up realtime subscription...`
- `[Auth] Initializing auth...` (loop restarts)

## Solution

Remove `profile` from the `useEffect` dependency array since:
1. The initialization should only run ONCE when the component mounts
2. Profile changes should be handled by the `onAuthStateChange` listener, not by re-running initialization
3. The `fetchProfile` callback already handles profile state internally

### File Change: `src/contexts/AuthContext.tsx`

**Line 352** - Remove `profile` from the dependency array:

```typescript
// BEFORE (causes infinite loop)
}, [fetchProfile, clearAuthState, validateSession, profile]);

// AFTER (correct - runs only on mount)
}, [fetchProfile, clearAuthState, validateSession]);
```

However, this creates a new issue - the `onAuthStateChange` handler references `profile` to check if it needs to re-fetch:

```typescript
// Line 327 - This reference to profile is the real issue
if (!profile || profile.id !== session.user.id) {
  await fetchProfile(session.user.id);
}
```

This check inside `onAuthStateChange` is problematic because:
1. It references external state (`profile`) which could be stale due to closure
2. It's what causes the dependency warning if we remove `profile`

**Better fix:** Change the logic to NOT check profile existence in the auth state handler. Instead, always fetch profile on SIGNED_IN events and use a ref to track if we already have a valid profile for the current user:

### Complete Fix

```typescript
// Add a ref to track current profile user ID (avoids closure issues)
const profileUserIdRef = useRef<string | null>(null);

// Update the ref whenever profile changes
useEffect(() => {
  profileUserIdRef.current = profile?.id ?? null;
}, [profile?.id]);

// In the useEffect for auth initialization:
useEffect(() => {
  let mounted = true;
  
  const initializeAuth = async () => {
    // ... existing initialization logic unchanged
  };
  
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      if (!mounted) return;
      
      console.log('[Auth] Auth state changed:', event);
      
      // ... existing error handling unchanged
      
      // For SIGNED_IN or valid session updates
      if (session?.user) {
        setSession(session);
        setUser(session.user);
        
        // Only fetch profile if we don't already have it for THIS user
        // Use ref to avoid stale closure issues
        if (profileUserIdRef.current !== session.user.id) {
          await fetchProfile(session.user.id);
        }
      } else if (!session) {
        // ... existing no-session handling
      }
      
      if (mounted) {
        setLoading(false);
      }
    }
  );

  initializeAuth();

  return () => {
    mounted = false;
    subscription.unsubscribe();
  };
}, [fetchProfile, clearAuthState, validateSession]);  // NO profile in deps
```

## Files to Change

| File | Change |
|------|--------|
| `src/contexts/AuthContext.tsx` | Add `profileUserIdRef`, update auth effect to use ref instead of profile state |

## Technical Details

### Why `profile` in Dependencies Causes Infinite Loop

React's `useEffect` hook re-runs whenever any dependency changes. When we have:

```typescript
useEffect(() => {
  // calls initializeAuth which calls fetchProfile which calls setProfile
}, [profile]);
```

Each `setProfile()` call changes the `profile` state, which triggers the effect again, which fetches profile again, creating an endless cycle.

### Why Using a Ref Fixes It

A `useRef` value:
- Does NOT trigger re-renders when changed
- Provides a stable reference that persists across renders
- Avoids the stale closure problem in async callbacks

By using `profileUserIdRef.current` instead of `profile` in the comparison, we:
1. Remove `profile` from dependencies (stops the loop)
2. Still correctly detect if we need to fetch profile for a new user
3. Avoid stale closure issues in the `onAuthStateChange` callback

## Expected Outcome

After this fix:
1. User logs in
2. `initializeAuth()` runs ONCE
3. Profile is fetched and loaded
4. Dashboard renders successfully
5. No more infinite loop or blinking
