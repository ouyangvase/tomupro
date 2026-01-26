
# Fix Auth Race Condition - Role Shows as Salesperson

## Root Cause Identified

The issue is **NOT** caused by binding removal affecting roles. The database is intact with all roles correctly stored.

The actual bug is a **race condition** in the authentication flow:

```
Current Flow (BROKEN):
┌─────────────────────────────────────────────────────────────────┐
│ 1. User logs in                                                 │
│ 2. Auth state changes → setLoading(false) ← TOO EARLY!         │
│ 3. Profile fetch is DEFERRED via setTimeout()                   │
│ 4. App renders with user=✓ but profile=null, role=null         │
│ 5. Dashboard switch(role) hits default: → SalespersonDashboard │
└─────────────────────────────────────────────────────────────────┘
```

The `loading` flag becomes `false` before the profile is actually loaded, causing the dashboard to render with `role === null`, which triggers the `default:` case in the switch statement.

---

## Solution Overview

| Component | Issue | Fix |
|-----------|-------|-----|
| AuthContext.tsx | `loading` set to false before profile loads | Keep `loading = true` until profile is fetched |
| Dashboard.tsx | `default:` case falls through to Salesperson | Add explicit null handling / loading state |
| MobileDashboard.tsx | Same default case issue | Add explicit null handling / loading state |
| ProtectedRoute | Doesn't wait for profile | Add profile loading check |

---

## Part 1: Fix AuthContext Loading State

**File: `src/contexts/AuthContext.tsx`**

The `loading` state must remain `true` until the profile is actually loaded.

### Current Code (Lines 118-150):
```typescript
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setTimeout(() => {
          fetchProfile(session.user.id);
        }, 0);
      } else {
        setProfile(null);
        setPreviousRole(null);
        setRoleChanged(false);
      }
      setLoading(false);  // ❌ PROBLEM: Loading false before profile loads!
    }
  );
  // ...
}, [fetchProfile]);
```

### Fixed Code:
```typescript
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Keep loading = true until profile loads
        setTimeout(async () => {
          await fetchProfile(session.user.id);
          setLoading(false);  // ✅ Only set loading false AFTER profile loads
        }, 0);
      } else {
        setProfile(null);
        setPreviousRole(null);
        setRoleChanged(false);
        setLoading(false);  // No user = no profile needed, safe to stop loading
      }
    }
  );

  supabase.auth.getSession().then(async ({ data: { session } }) => {
    setSession(session);
    setUser(session?.user ?? null);
    if (session?.user) {
      await fetchProfile(session.user.id);
    }
    setLoading(false);  // ✅ Only after profile fetch completes
  });

  return () => subscription.unsubscribe();
}, [fetchProfile]);
```

Also update `fetchProfile` to properly handle async:
```typescript
const fetchProfile = useCallback(async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  
  if (error) {
    console.error('Error fetching profile:', error);
    return;  // Don't clear profile on error
  }
  
  if (!data) {
    console.error('No profile found for user:', userId);
    // Profile doesn't exist - this is a critical error
    // Could show a blocking screen here
    return;
  }
  
  const newProfile = data as ExtendedProfile;
  
  // Check if account is disabled or resigned
  if (newProfile.status && newProfile.status !== 'active') {
    await handleAccountDisabled(
      newProfile.status === 'resigned' 
        ? 'Your account has been marked as resigned. Please contact admin.'
        : 'Your account has been disabled. Please contact admin.'
    );
    return;
  }
  
  // Check if role changed while session is active
  if (previousRole && previousRole !== newProfile.role) {
    setRoleChanged(true);
  }
  
  setPreviousRole(newProfile.role);
  setProfile(newProfile);
}, [previousRole, handleAccountDisabled]);
```

---

## Part 2: Fix Dashboard Default Case

**File: `src/pages/Dashboard.tsx`** (Lines 1336-1349)

### Current Code:
```typescript
const renderDashboard = () => {
  switch (role) {
    case 'driver':
      return <DriverDashboard />;
    case 'runner':
      return <RunnerDashboard />;
    case 'admin':
      return <AdminDashboard />;
    case 'manager':
      return <ManagerDashboard />;
    case 'salesperson':
    default:  // ❌ PROBLEM: null falls into default!
      return <SalespersonDashboard />;
  }
};
```

### Fixed Code:
```typescript
const renderDashboard = () => {
  // Handle null/undefined role explicitly
  if (!role) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Loading profile...</span>
        </div>
      </div>
    );
  }
  
  switch (role) {
    case 'driver':
      return <DriverDashboard />;
    case 'runner':
      return <RunnerDashboard />;
    case 'admin':
      return <AdminDashboard />;
    case 'manager':
      return <ManagerDashboard />;
    case 'salesperson':
      return <SalespersonDashboard />;
    default:
      // Unknown role - show error state
      return (
        <div className="text-center py-8">
          <p className="text-destructive">Unknown role: {role}</p>
          <p className="text-muted-foreground">Please contact admin.</p>
        </div>
      );
  }
};
```

---

## Part 3: Fix MobileDashboard Default Case

**File: `src/pages/dashboard/MobileDashboard.tsx`** (Lines 451-464)

Same fix as Dashboard.tsx:

```typescript
const renderDashboard = () => {
  if (!role) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }
  
  switch (role) {
    case 'driver':
      return <DriverMobileDashboard />;
    case 'runner':
      return <RunnerMobileDashboard />;
    case 'admin':
      return <AdminMobileDashboard />;
    case 'manager':
      return <ManagerMobileDashboard />;
    case 'salesperson':
      return <SalespersonMobileDashboard />;
    default:
      return (
        <div className="text-center py-8">
          <p className="text-destructive">Unknown role: {role}</p>
        </div>
      );
  }
};
```

---

## Part 4: Add Profile Loading Check to ProtectedRoute (Optional Safety)

**File: `src/App.tsx`** (ProtectedRoute function)

Add a secondary check to ensure profile is loaded:

```typescript
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const { needsOnboarding, checkingLink } = useDriverOnboarding();
  
  // Show loading while auth is initializing
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }
  
  // Redirect to auth if not logged in
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  // Safety: Wait for profile to load if user exists but profile doesn't
  // This shouldn't happen with the AuthContext fix, but is a safety net
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Loading profile...</span>
        </div>
      </div>
    );
  }

  // ... rest of the function remains the same
}
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/contexts/AuthContext.tsx` | Keep `loading = true` until profile fetch completes |
| `src/pages/Dashboard.tsx` | Handle null role explicitly before switch statement |
| `src/pages/dashboard/MobileDashboard.tsx` | Handle null role explicitly before switch statement |
| `src/App.tsx` | Add profile null check in ProtectedRoute as safety net |

---

## Why This Fixes the Issue

1. **AuthContext** now keeps `loading = true` until the profile is actually fetched
2. **ProtectedRoute** shows loading spinner while `loading = true`
3. **Dashboard** explicitly handles null role with loading indicator
4. No more race condition where role is null but app tries to render dashboard

---

## Verification

After implementing:
- Admin (admin@gmail.com) will see AdminDashboard
- Manager (tse.93@hotmail.com) will see ManagerDashboard
- Salesperson will see SalespersonDashboard
- No user will incorrectly see SalespersonDashboard due to null role

The binding tables remain untouched - they are pure relationship tables with no side effects on user roles.
