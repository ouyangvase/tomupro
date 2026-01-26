
# Admin "View As / Operate As" Access Control System

## Architecture Overview

This feature uses a **client-side impersonation context** that wraps the AuthContext, allowing admins to temporarily assume another user's data visibility and permissions without affecting the actual authentication or database ownership.

```
┌─────────────────────────────────────────────────────┐
│                   AuthProvider                      │
│  (Real user: Admin, real session, real auth)       │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │         ImpersonationProvider                 │  │
│  │                                               │  │
│  │  • impersonatedUser (target profile)         │  │
│  │  • effectiveRole (target's role)             │  │
│  │  • effectiveUserId (target's ID)             │  │
│  │  • isImpersonating (boolean flag)            │  │
│  │  • startImpersonation() / stopImpersonation()│  │
│  │                                               │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## Phase 1: Database Schema

### 1.1 Create Impersonation Sessions Table

```sql
-- Table to track admin impersonation sessions for audit
CREATE TABLE admin_impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES profiles(id) NOT NULL,
  target_user_id uuid REFERENCES profiles(id) NOT NULL,
  target_role app_role NOT NULL,
  started_at timestamptz DEFAULT now() NOT NULL,
  ended_at timestamptz,
  actions_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX idx_impersonation_admin ON admin_impersonation_sessions(admin_id);
CREATE INDEX idx_impersonation_active ON admin_impersonation_sessions(admin_id) WHERE ended_at IS NULL;

-- RLS: Only admins can read/write
ALTER TABLE admin_impersonation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage impersonation sessions"
  ON admin_impersonation_sessions
  FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');
```

### 1.2 Add Impersonation Fields to Audit Logs

Extend the audit_logs table to track when actions are performed during impersonation:

```sql
ALTER TABLE audit_logs
ADD COLUMN impersonated_user_id uuid REFERENCES profiles(id),
ADD COLUMN impersonation_session_id uuid REFERENCES admin_impersonation_sessions(id);

COMMENT ON COLUMN audit_logs.impersonated_user_id IS 'If set, admin was viewing as this user when action was performed';
COMMENT ON COLUMN audit_logs.impersonation_session_id IS 'Links to the impersonation session record';
```

---

## Phase 2: Impersonation Context

### 2.1 Create ImpersonationContext

**File:** `src/contexts/ImpersonationContext.tsx`

```typescript
interface ImpersonatedUser {
  id: string;
  display_name: string;
  email: string;
  role: AppRole;
  status: string;
}

interface ImpersonationContextType {
  // State
  isImpersonating: boolean;
  impersonatedUser: ImpersonatedUser | null;
  sessionId: string | null;
  
  // Effective values (use these instead of real auth)
  effectiveUserId: string | null;
  effectiveRole: AppRole | null;
  effectiveProfile: Profile | null;
  
  // Actions
  startImpersonation: (userId: string) => Promise<void>;
  stopImpersonation: () => Promise<void>;
  
  // Audit helper
  logImpersonatedAction: (action: string, details?: Record<string, unknown>) => Promise<void>;
}
```

Key behaviors:
- When NOT impersonating: returns real admin values
- When impersonating: returns target user's values for `effectiveUserId`, `effectiveRole`
- Stores session in `admin_impersonation_sessions` table
- Persists state in sessionStorage (survives page refresh, clears on tab close)

### 2.2 Create `useEffectiveAuth` Hook

**File:** `src/hooks/useEffectiveAuth.ts`

This hook replaces `useAuth()` in all data-fetching hooks:

```typescript
export function useEffectiveAuth() {
  const auth = useAuth();
  const impersonation = useImpersonation();
  
  // If impersonating, return target user's context
  if (impersonation.isImpersonating && impersonation.impersonatedUser) {
    return {
      user: { id: impersonation.effectiveUserId },
      profile: impersonation.effectiveProfile,
      role: impersonation.effectiveRole,
      // Keep session for actual auth
      session: auth.session,
      // Flags
      isImpersonating: true,
      realAdminId: auth.user?.id,
    };
  }
  
  return { ...auth, isImpersonating: false, realAdminId: null };
}
```

---

## Phase 3: UI Components

### 3.1 Admin View Mode Toggle (Sidebar)

**File:** `src/components/admin/AdminViewModeToggle.tsx`

Only visible when `role === 'admin'`:
- Switch labeled "Admin View Mode"
- When toggled ON, shows user selector dropdown
- Searchable by name/email/role
- Excludes other admins from the list

### 3.2 User Selector Dropdown

**File:** `src/components/admin/ImpersonationUserSelect.tsx`

- Fetches all non-admin users from `profiles`
- Searchable combobox with:
  - Display name
  - Email
  - Role badge (Manager/Salesperson/Runner/Driver)
  - Status indicator (active/disabled/resigned)
- Disabled users are shown but marked
- On selection: calls `startImpersonation(userId)`

### 3.3 Impersonation Banner

**File:** `src/components/admin/ImpersonationBanner.tsx`

Persistent banner shown on ALL pages when impersonating:

```tsx
<div className="fixed top-0 left-0 right-0 z-50 bg-orange-500 text-white py-2 px-4 flex items-center justify-between">
  <div className="flex items-center gap-2">
    <Eye className="h-4 w-4" />
    <span>Viewing as: <strong>{impersonatedUser.display_name}</strong> ({impersonatedUser.role})</span>
  </div>
  <Button variant="ghost" size="sm" onClick={stopImpersonation}>
    <X className="h-4 w-4 mr-1" />
    Exit View Mode
  </Button>
</div>
```

### 3.4 Update AppLayout

**File:** `src/components/layout/AppLayout.tsx`

- Wrap with `ImpersonationProvider`
- Add `ImpersonationBanner` that shows when active
- Adjust main content padding when banner is visible

---

## Phase 4: Hook Updates (Critical)

All data-fetching hooks must use `useEffectiveAuth()` instead of `useAuth()`:

| Hook | Change Required |
|------|-----------------|
| `useTeamVisibility.ts` | Use `effectiveUserId` and `effectiveRole` |
| `useDashboardStats.ts` | Use effective user for all queries |
| `useOrders.ts` | No direct auth, but RLS applies via RPC |
| `useProducts.ts` | Filter by effective owner_id |
| `useInventory.ts` | Use effective warehouse visibility |
| `useTeamMembers.ts` | Use effective manager_id for bindings |
| `useNotifications.ts` | Show target user's notifications |

### 4.1 Server-Side RPC Override

For hooks that use `get_visible_owner_ids()` RPC, we need a new approach:

**Option A:** Create `get_visible_owner_ids_for_user(p_user_id uuid)` RPC that takes an explicit user ID:

```sql
CREATE OR REPLACE FUNCTION get_visible_owner_ids_for_user(p_user_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role app_role;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;
  
  IF v_role = 'admin' THEN
    RETURN NULL; -- Admin sees all
  ELSIF v_role = 'manager' THEN
    -- Return manager + team
    RETURN ARRAY(
      SELECT salesperson_id FROM manager_salesperson_bindings
      WHERE manager_id = p_user_id AND active = true
    ) || p_user_id;
  ELSE
    RETURN ARRAY[p_user_id];
  END IF;
END;
$$;
```

**Option B:** Pass effectiveUserId as filter parameter to existing queries (client-side filtering).

We'll use **Option B** for simpler implementation - hooks accept an optional `asUserId` parameter.

---

## Phase 5: Write Operations

### 5.1 Action Attribution

When impersonating and performing write operations:

1. **Ownership stays with target user** - e.g., creating an order sets `salesperson_id = targetUserId`
2. **Actor tracking** - audit logs capture both:
   - `actor_id = realAdminId` (who actually clicked)
   - `impersonated_user_id = targetUserId` (who they were viewing as)

### 5.2 Blocked Operations

During impersonation, block these actions with clear error:

| Action | Reason |
|--------|--------|
| Change user role | Security - could elevate privileges |
| Change user password | Security - account takeover |
| Disable/enable user | Should be done as admin directly |
| Transfer stock ownership | Data integrity |
| Impersonate another user | Prevent nested impersonation |
| Access admin-only pages | `/admin/*` routes should exit impersonation first |

### 5.3 Mutation Wrapper

Create a wrapper for mutations that:
1. Checks if operation is allowed during impersonation
2. Automatically adds audit fields
3. Increments `actions_count` on the session

```typescript
function useImpersonationAwareMutation<T, V>(
  mutationFn: (variables: V) => Promise<T>,
  options?: {
    blockedDuringImpersonation?: boolean;
    actionName?: string;
  }
) {
  const { isImpersonating, logImpersonatedAction, realAdminId, effectiveUserId } = useImpersonation();
  
  return useMutation({
    mutationFn: async (variables: V) => {
      if (options?.blockedDuringImpersonation && isImpersonating) {
        throw new Error('This action cannot be performed while viewing as another user.');
      }
      
      const result = await mutationFn(variables);
      
      if (isImpersonating && options?.actionName) {
        await logImpersonatedAction(options.actionName, { variables });
      }
      
      return result;
    },
  });
}
```

---

## Phase 6: Navigation & Routing

### 6.1 Sidebar Behavior

When impersonating:
- Sidebar shows menu items for the **impersonated role**, not admin
- This helps admin see exactly what the user sees
- Admin-only items are hidden (with tooltip "Exit view mode to access")

### 6.2 Route Guards

Add checks to admin-only routes:

```typescript
// In admin routes (e.g., /admin/*)
function AdminRoute({ children }) {
  const { role } = useAuth(); // Real role, not effective
  const { isImpersonating } = useImpersonation();
  
  if (role !== 'admin') return <Navigate to="/" />;
  
  if (isImpersonating) {
    // Auto-exit impersonation when accessing admin pages
    stopImpersonation();
    return <Navigate to="/" />;
  }
  
  return children;
}
```

---

## Phase 7: Security Hardening

### 7.1 Prevent Admin-to-Admin Impersonation

```typescript
const startImpersonation = async (userId: string) => {
  const { data: target } = await supabase
    .from('profiles')
    .select('id, role, display_name, email, status')
    .eq('id', userId)
    .single();
  
  if (target.role === 'admin') {
    toast.error('Cannot impersonate another admin');
    return;
  }
  
  // Continue with impersonation...
};
```

### 7.2 Session Timeout

Impersonation sessions auto-expire after 30 minutes of inactivity:
- Track last activity timestamp
- Check on each action
- Show warning at 25 minutes

### 7.3 Audit Everything

All impersonation events are logged:
- Session start (admin_id, target_user_id, target_role)
- Session end (duration, actions_count)
- Each significant action during session

---

## Implementation Order

| Step | Component | Priority |
|------|-----------|----------|
| 1 | Database migration (sessions table, audit columns) | P0 |
| 2 | ImpersonationContext + Provider | P0 |
| 3 | useEffectiveAuth hook | P0 |
| 4 | ImpersonationBanner component | P0 |
| 5 | AdminViewModeToggle + UserSelector | P0 |
| 6 | Update AppLayout with provider + banner | P0 |
| 7 | Update useTeamVisibility to use effective auth | P1 |
| 8 | Update useDashboardStats | P1 |
| 9 | Update sidebar to show effective role menus | P1 |
| 10 | Add blocked operation checks | P1 |
| 11 | Session timeout logic | P2 |
| 12 | Admin impersonation history page | P2 |

---

## Expected Behavior Summary

| Scenario | Behavior |
|----------|----------|
| Admin logs in | Normal admin view, "Admin View Mode" toggle visible |
| Admin enables View Mode | User selector appears, admin must pick a user |
| Admin selects "Sarah (salesperson)" | Banner appears, sidebar shows salesperson menus, data filtered to Sarah's scope |
| Admin views Orders page | Shows only Sarah's orders (as if Sarah was logged in) |
| Admin creates an order | Order created with `salesperson_id = Sarah.id`, audit shows admin performed action |
| Admin tries to access /admin/* | Auto-exits impersonation, returns to admin view |
| Admin clicks "Exit View Mode" | Banner disappears, full admin access restored |

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/migrations/xxx_impersonation.sql` | CREATE |
| `src/contexts/ImpersonationContext.tsx` | CREATE |
| `src/hooks/useEffectiveAuth.ts` | CREATE |
| `src/components/admin/AdminViewModeToggle.tsx` | CREATE |
| `src/components/admin/ImpersonationUserSelect.tsx` | CREATE |
| `src/components/admin/ImpersonationBanner.tsx` | CREATE |
| `src/components/layout/AppLayout.tsx` | MODIFY |
| `src/components/layout/AppSidebar.tsx` | MODIFY |
| `src/hooks/useTeamVisibility.ts` | MODIFY |
| `src/hooks/useDashboardStats.ts` | MODIFY |
| `src/App.tsx` | MODIFY (wrap with provider) |
