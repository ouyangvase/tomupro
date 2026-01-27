
# Fix: Loading Stuck and Invalid Session Handling

## Problem Summary

The app is stuck on "Loading..." on the Auth page due to two issues:

1. **Invalid refresh token not properly handled** - When Supabase has a stale refresh token, it returns a 400 error. The AuthContext tries to use this invalid session to fetch a profile, which can cause the loading state to get stuck.

2. **Auth page shouldn't wait for loading** - The Auth page should display immediately regardless of auth loading state since it's the login page.

3. **Race condition in session handling** - The `getSession()` and `onAuthStateChange` callbacks can race, causing duplicate profile fetches or stuck states.

## Root Cause Analysis

From the network logs:
```
POST /auth/v1/token?grant_type=refresh_token
Status: 400
Response: {"code":"refresh_token_not_found","message":"Invalid Refresh Token: Refresh Token Not Found"}
```

When this happens, the AuthContext's `getSession()` may return a stale session object, and the `onAuthStateChange` may not fire correctly, leaving `loading: true` indefinitely.

## Solution

### Part 1: Handle Invalid Sessions Gracefully

**File: `src/contexts/AuthContext.tsx`**

Add session validation and clear invalid tokens when refresh fails:

```typescript
useEffect(() => {
  let mounted = true;
  
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      if (!mounted) return;
      
      // Handle session refresh failures
      if (event === 'TOKEN_REFRESHED' && !session) {
        // Refresh failed - clear invalid tokens
        clearAuthState();
        if (mounted) setLoading(false);
        return;
      }
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setPreviousRole(null);
        setRoleChanged(false);
      }
      
      if (mounted) setLoading(false);
    }
  );
  
  // Check for existing session with error handling
  supabase.auth.getSession().then(async ({ data: { session }, error }) => {
    if (!mounted) return;
    
    // If there's an auth error or no valid session, clear state
    if (error || !session) {
      setUser(null);
      setSession(null);
      setProfile(null);
      if (mounted) setLoading(false);
      return;
    }
    
    setSession(session);
    setUser(session.user);
    
    if (session.user) {
      await fetchProfile(session.user.id);
    }
    
    if (mounted) setLoading(false);
  }).catch((error) => {
    console.error('Session check failed:', error);
    if (mounted) setLoading(false);
  });

  return () => {
    mounted = false;
    subscription.unsubscribe();
  };
}, [fetchProfile]);
```

### Part 2: Add Auth Loading Timeout

Add a maximum loading timeout to prevent infinite loading:

```typescript
// Add a timeout to prevent infinite loading
useEffect(() => {
  const timeout = setTimeout(() => {
    if (loading) {
      console.warn('Auth loading timeout - forcing completion');
      setLoading(false);
    }
  }, 10000); // 10 second timeout
  
  return () => clearTimeout(timeout);
}, [loading]);
```

### Part 3: Clear Stale Tokens on 400 Errors

Add listener for auth errors to clear invalid tokens:

```typescript
// Clear stale tokens function
const clearAuthState = useCallback(() => {
  const projectId = 'fitonksgqfxnpljiylkn';
  localStorage.removeItem(`sb-${projectId}-auth-token`);
  localStorage.removeItem('supabase.auth.token');
  sessionStorage.clear();
  setUser(null);
  setSession(null);
  setProfile(null);
  setPreviousRole(null);
  setRoleChanged(false);
}, []);
```

### Part 4: Show Auth Page Without Loading Check

**File: `src/pages/Auth.tsx`**

Add early return for auth page loading state:

```typescript
export default function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp, user, loading } = useAuth();
  const { toast } = useToast();
  // ... rest of state
  
  // Show auth page immediately if not authenticated
  // Even if loading, show the form so users can try to login
  useEffect(() => {
    if (user && !loading) {
      navigate('/');
    }
  }, [user, loading, navigate]);
  
  // Rest of component renders normally...
}
```

## Summary of Changes

| File | Change |
|------|--------|
| `src/contexts/AuthContext.tsx` | Add invalid session handling, loading timeout, clear stale tokens |
| `src/pages/Auth.tsx` | Update redirect logic to work with loading state |

## Expected Outcome

After implementation:
1. **No more infinite loading** - 10-second timeout prevents stuck states
2. **Invalid tokens cleared automatically** - Users with stale sessions get logged out properly
3. **Auth page shows immediately** - Login form visible even during loading
4. **Proper error handling** - Auth errors are caught and handled gracefully

## Technical Details

### Why This Happens
The Supabase client stores session tokens in localStorage. When the refresh token expires or becomes invalid (e.g., after a database reset or session cleanup), the client tries to refresh and fails with error 400. The current code doesn't handle this gracefully.

### The CORS Errors
The `auth-bridge` and `manifest.json` CORS errors shown in the console are Lovable platform issues (not code-related) and are safe to ignore. They don't affect app functionality.

### The ForwardRef Warnings
The React warnings about "Function components cannot be given refs" are from react-router-dom and are harmless deprecation warnings that don't affect functionality.
