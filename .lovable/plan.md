
# Fix Infinite Loading When Backend Is Unavailable

## Problem Analysis

The app gets stuck on "Loading..." or "Loading profile..." indefinitely when the Supabase backend is experiencing timeouts. This is happening because:

1. **Database is timing out** - Postgres logs show multiple "canceling statement due to statement timeout" errors
2. **Error handling gap** - The `fetchProfile` function in `AuthContext.tsx` silently ignores errors
3. **No retry mechanism** - When the profile fetch fails, there's no way for the user to retry
4. **Stuck state** - `ProtectedRoute` sees `user` exists but `profile` is null, showing "Loading profile..." forever

## Solution

Implement a robust loading state with:
- Error tracking in AuthContext
- Auto-retry with exponential backoff
- Clear "Backend unavailable" message with manual retry button
- Timeout detection to prevent infinite loading

---

## Changes Required

### 1. Update AuthContext.tsx

Add new state for tracking connection errors and retry logic:

```typescript
// New state
const [connectionError, setConnectionError] = useState<string | null>(null);
const [retryCount, setRetryCount] = useState(0);

// Enhanced fetchProfile with error handling
const fetchProfile = useCallback(async (userId: string): Promise<boolean> => {
  try {
    setConnectionError(null);
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    
    if (error) {
      console.error('Profile fetch error:', error);
      setConnectionError('Unable to connect to server. Please check your connection.');
      return false;
    }
    
    if (!data) {
      console.error('No profile found for user:', userId);
      setConnectionError('Profile not found. Please contact support.');
      return false;
    }
    
    // ... existing profile processing logic ...
    setProfile(newProfile);
    return true;
    
  } catch (err) {
    console.error('Unexpected error fetching profile:', err);
    setConnectionError('Connection error. Please try again.');
    return false;
  }
}, [previousRole, handleAccountDisabled]);

// Add retry function to context
const retryConnection = useCallback(async () => {
  if (!user?.id) return;
  
  setRetryCount(prev => prev + 1);
  setLoading(true);
  setConnectionError(null);
  
  const success = await fetchProfile(user.id);
  setLoading(false);
  
  if (!success && retryCount < 3) {
    // Auto-retry with delay
    setTimeout(() => retryConnection(), 2000 * (retryCount + 1));
  }
}, [user?.id, fetchProfile, retryCount]);

// Export connectionError and retryConnection in context value
```

### 2. Update App.tsx - ProtectedRoute

Replace the static "Loading profile..." with an interactive error state:

```typescript
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, connectionError, retryConnection, retryCount } = useAuth();
  
  // ... existing loading check ...
  
  // Handle connection error state
  if (!profile && connectionError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 max-w-md text-center px-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <div>
            <h2 className="text-lg font-semibold">Backend Unavailable</h2>
            <p className="text-muted-foreground mt-1">{connectionError}</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={retryConnection} disabled={loading}>
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </>
              )}
            </Button>
            <Button variant="outline" onClick={signOut}>
              Sign Out
            </Button>
          </div>
          {retryCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Attempt {retryCount + 1} - Auto-retrying...
            </p>
          )}
        </div>
      </div>
    );
  }

  // ... rest of existing logic ...
}
```

### 3. Add Initial Load Timeout

Add a timeout to the initial session check to prevent indefinite waiting:

```typescript
// In AuthContext useEffect
useEffect(() => {
  let timeoutId: NodeJS.Timeout;
  
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setTimeout(async () => {
          const success = await fetchProfile(session.user.id);
          setLoading(false);
          
          if (!success) {
            // Start auto-retry
            retryConnection();
          }
        }, 0);
      } else {
        setProfile(null);
        setLoading(false);
      }
    }
  );

  // Initial session check with timeout
  const sessionPromise = supabase.auth.getSession();
  
  // Set a 15-second timeout for initial load
  timeoutId = setTimeout(() => {
    setConnectionError('Connection timed out. Please check your network.');
    setLoading(false);
  }, 15000);
  
  sessionPromise.then(async ({ data: { session } }) => {
    clearTimeout(timeoutId);
    setSession(session);
    setUser(session?.user ?? null);
    
    if (session?.user) {
      const success = await fetchProfile(session.user.id);
      setLoading(false);
      if (!success) {
        retryConnection();
      }
    } else {
      setLoading(false);
    }
  }).catch((err) => {
    clearTimeout(timeoutId);
    console.error('Session check failed:', err);
    setConnectionError('Failed to check session. Please refresh.');
    setLoading(false);
  });

  return () => {
    subscription.unsubscribe();
    clearTimeout(timeoutId);
  };
}, [fetchProfile, retryConnection]);
```

---

## Updated AuthContextType Interface

```typescript
interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: ExtendedProfile | null;
  role: AppRole | null;
  loading: boolean;
  signingOut: boolean;
  roleChanged: boolean;
  connectionError: string | null;  // NEW
  retryCount: number;              // NEW
  dismissRoleChange: () => void;
  refreshProfile: () => Promise<void>;
  retryConnection: () => Promise<void>;  // NEW
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName: string, role: AppRole) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}
```

---

## User Experience Flow

```text
┌─────────────────────────────────────────────────────────────────┐
│ User opens app / refreshes                                       │
├─────────────────────────────────────────────────────────────────┤
│ 1. Show "Loading..." spinner                                     │
│ 2. Attempt to fetch session + profile                            │
│    ├─ Success → Navigate to dashboard                            │
│    └─ Failure (timeout/error) →                                  │
│       ├─ Show "Backend Unavailable" message                      │
│       ├─ Auto-retry up to 3 times with exponential backoff       │
│       └─ Show "Retry" + "Sign Out" buttons                       │
│                                                                   │
│ 3. After 15 seconds with no response → Force show error UI       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/contexts/AuthContext.tsx` | Add error state, retry logic, timeout handling |
| `src/App.tsx` | Update ProtectedRoute to show error UI with retry |

---

## Technical Notes

- The postgres logs show repeated "canceling statement due to statement timeout" errors, indicating the database is under heavy load or there are slow queries
- The `profiles` table RLS policy is simple (`FOR SELECT USING (true)`) so it shouldn't cause timeouts
- The issue is likely with database connection pool exhaustion or slow upstream queries
- This fix handles the symptom (stuck UI) while the underlying database performance issue may need separate investigation

---

## Testing Checklist

- [ ] User sees loading spinner initially
- [ ] If backend times out, error message appears within 15 seconds
- [ ] "Retry" button triggers new fetch attempt
- [ ] Auto-retry happens up to 3 times with increasing delays
- [ ] "Sign Out" button works even when backend is down
- [ ] When backend recovers, retry succeeds and app loads normally
