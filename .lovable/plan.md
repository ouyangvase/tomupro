
# Fix: Infinite "Loading your profile..." and Authentication Flow Issues

## Problem Summary

The app is stuck on "Loading your profile..." due to two issues:
1. **Stale auth token handling** - When a user has an invalid refresh token, the app doesn't properly detect and clear it
2. **React Router ref warnings** - Non-critical but indicate structure issues with route components

## Root Cause Analysis

### Issue 1: Invalid Refresh Token Not Cleared
From the auth logs:
```
error_code: refresh_token_not_found
400: Invalid Refresh Token: Refresh Token Not Found
```

The current flow:
1. User opens app with stale token in localStorage
2. `getSession()` returns a cached session object (not yet expired)
3. App sets user state and starts profile fetch
4. In parallel, Supabase tries to refresh the token - FAILS
5. Profile fetch may hang because underlying requests fail
6. User sees infinite "Loading your profile..."

### Issue 2: TOKEN_REFRESHED Event Timing
The `onAuthStateChange` callback handles `TOKEN_REFRESHED` with no session, but `getSession()` may return a session before the refresh attempt completes. This creates a race condition.

### Issue 3: React Router Ref Warnings
```
Warning: Function components cannot be given refs.
Check the render method of `AppRoutes`.
```

This happens because React Router v7 may try to pass refs to route element components. While not breaking, it indicates potential issues.

## Solution

### Part 1: Add Session Validation Before Profile Fetch

**File: `src/contexts/AuthContext.tsx`**

Add explicit session validation that checks if the token is actually usable:

```typescript
// Before fetching profile, verify the session is actually valid
const validateSession = async (session: Session): Promise<boolean> => {
  try {
    // Quick verification call - if session is invalid, this will fail
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      console.warn('[Auth] Session validation failed:', error?.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Auth] Session validation exception:', err);
    return false;
  }
};
```

Then in the `getSession` handler:
```typescript
supabase.auth.getSession().then(async ({ data: { session }, error }) => {
  if (!mounted) return;
  
  if (error || !session) {
    clearAuthState();
    if (mounted) setLoading(false);
    return;
  }
  
  // Validate session is actually usable
  const isValid = await validateSession(session);
  if (!isValid) {
    console.warn('[Auth] Session invalid - clearing auth state');
    clearAuthState();
    if (mounted) setLoading(false);
    return;
  }
  
  // Session is valid, proceed with profile fetch
  setSession(session);
  setUser(session.user);
  await fetchProfile(session.user.id);
  if (mounted) setLoading(false);
});
```

### Part 2: Handle Auth Error Events More Aggressively

Add handling for auth error events:

```typescript
supabase.auth.onAuthStateChange(async (event, session) => {
  if (!mounted) return;
  
  console.log('[Auth] Auth state changed:', event);
  
  // Handle ALL events that indicate session failure
  if (event === 'TOKEN_REFRESHED' && !session) {
    console.warn('[Auth] Token refresh failed - clearing state');
    clearAuthState();
    if (mounted) setLoading(false);
    return;
  }
  
  if (event === 'SIGNED_OUT') {
    clearAuthState();
    if (mounted) setLoading(false);
    return;
  }
  
  // Handle user deleted or auth error scenarios
  if (event === 'USER_UPDATED' && !session) {
    clearAuthState();
    if (mounted) setLoading(false);
    return;
  }
  
  // ... rest of handler
});
```

### Part 3: Add Fetch Timeout to Profile Fetch

Add an explicit timeout to the profile fetch to prevent indefinite hanging:

```typescript
const fetchProfile = useCallback(async (userId: string, retryCount = 0): Promise<void> => {
  const maxRetries = 3;
  const baseDelay = 1000;
  const fetchTimeout = 8000; // 8 second timeout per attempt
  
  if (retryCount === 0) {
    setProfileStatus('loading');
    setProfileError(null);
  }
  
  console.log(`[Auth] Fetching profile for ${userId} (attempt ${retryCount + 1}/${maxRetries + 1})`);
  
  // Add timeout wrapper
  const fetchWithTimeout = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), fetchTimeout);
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
        .abortSignal(controller.signal);
      
      clearTimeout(timeoutId);
      return { data, error };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return { data: null, error: { message: 'Request timed out' } };
      }
      throw err;
    }
  };
  
  const { data, error } = await fetchWithTimeout();
  // ... rest of handler
}, [previousRole, handleAccountDisabled]);
```

### Part 4: Clear Stale Tokens on Initial Load

Add a cleanup check at the start of the auth effect:

```typescript
useEffect(() => {
  let mounted = true;
  
  // Check for potentially stale tokens and validate before proceeding
  const initializeAuth = async () => {
    try {
      // First check if we have a stored session
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.warn('[Auth] Initial session check error - clearing tokens');
        clearAuthState();
        if (mounted) setLoading(false);
        return;
      }
      
      if (!session) {
        // No session - user needs to log in
        if (mounted) setLoading(false);
        return;
      }
      
      // Validate session with a getUser call
      const { data: userData, error: userError } = await supabase.auth.getUser();
      
      if (userError || !userData.user) {
        console.warn('[Auth] Session validation failed - clearing tokens');
        clearAuthState();
        if (mounted) setLoading(false);
        return;
      }
      
      // Session is valid - proceed
      setSession(session);
      setUser(session.user);
      await fetchProfile(session.user.id);
      if (mounted) setLoading(false);
    } catch (err) {
      console.error('[Auth] Initialization error:', err);
      clearAuthState();
      if (mounted) setLoading(false);
    }
  };
  
  // Set up auth state listener
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      // ... existing handler
    }
  );
  
  // Initialize auth
  initializeAuth();
  
  return () => {
    mounted = false;
    subscription.unsubscribe();
  };
}, [fetchProfile, clearAuthState]);
```

## Files to Change

| File | Change |
|------|--------|
| `src/contexts/AuthContext.tsx` | Add session validation, fetch timeout, improve token refresh handling |

## Technical Details

### Why the Current Code Fails

The current implementation has this flow:
```
getSession() → returns cached session → fetchProfile() starts → token refresh fails in background
```

The problem is that `getSession()` returns the cached session from localStorage even if the refresh token is invalid. The actual token refresh happens asynchronously, and by the time it fails, the profile fetch has already started with an invalid session.

### The Fix

Validate the session explicitly with `getUser()` before proceeding:
```
getSession() → getUser() to validate → if valid: fetchProfile() → if invalid: clearAuthState()
```

`getUser()` makes an authenticated request to Supabase, which will fail if the session is truly invalid. This gives us a reliable signal before attempting profile fetch.

## Expected Outcome

After implementation:
1. Users with stale tokens are immediately redirected to login (no infinite loading)
2. Valid sessions proceed directly to profile load
3. Network timeouts on profile fetch show error state with Retry button
4. No more "Loading your profile..." stuck indefinitely

## CORS Errors Note

The CORS errors shown in the screenshots:
```
Access to internal resource at 'https://lovable.dev/auth-bridge...'
```

These are **platform-level issues** with Lovable's preview infrastructure, not application code. They appear to be related to manifest.json fetching and do not affect the core authentication flow. The app cannot fix these - they would need to be addressed by the Lovable platform team.
