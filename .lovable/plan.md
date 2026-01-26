
# Admin-Only Data Visibility Sharing System

## Overview

This feature allows Admins to grant users (Viewers) permission to view and optionally operate on another user's (Subject) data. This is NOT impersonation - the Viewer remains themselves but gains access to the Subject's Orders, Products, Stock Balance, and related dashboards.

The system builds on the existing `stock_visibility_overrides` pattern but extends it with granular scope controls and operation permissions.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                     user_data_shares                            │
│                                                                 │
│  viewer_user_id ─────► Subject's data becomes visible           │
│  subject_user_id                                                │
│                                                                 │
│  Scopes:                                                        │
│  ├─ scope_orders        (boolean)                               │
│  ├─ scope_products      (boolean)                               │
│  ├─ scope_stock_balance (boolean)                               │
│  └─ scope_inbound       (boolean)                               │
│                                                                 │
│  can_operate = true ──► Viewer can perform actions              │
│  can_operate = false ─► Read-only access                        │
└─────────────────────────────────────────────────────────────────┘

             ┌──────────────────────────────────────┐
             │     Visibility Computation Flow      │
             └──────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────────┐
        │  get_accessible_user_ids(current_user_id)   │
        │                                             │
        │  1. Start with [current_user_id]            │
        │  2. Add team members (if manager)           │
        │  3. Add shared subjects from user_data_shares│
        │                                             │
        │  Return: unique array of accessible IDs     │
        └─────────────────────────────────────────────┘
```

---

## Phase 1: Database Schema

### 1.1 Create `user_data_shares` Table

```sql
-- Core sharing permissions table
CREATE TABLE user_data_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who can see
  viewer_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Whose data is shared
  subject_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Granular scope toggles
  scope_orders boolean DEFAULT true NOT NULL,
  scope_products boolean DEFAULT true NOT NULL,
  scope_stock_balance boolean DEFAULT true NOT NULL,
  scope_inbound boolean DEFAULT false NOT NULL,
  
  -- Operation permission
  can_operate boolean DEFAULT false NOT NULL,
  
  -- Status
  active boolean DEFAULT true NOT NULL,
  
  -- Audit
  created_by_admin_id uuid REFERENCES profiles(id) NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  
  -- Constraints
  CONSTRAINT unique_viewer_subject UNIQUE (viewer_user_id, subject_user_id),
  CONSTRAINT no_self_share CHECK (viewer_user_id != subject_user_id)
);

-- Indexes for fast lookups
CREATE INDEX idx_shares_viewer ON user_data_shares(viewer_user_id) WHERE active = true;
CREATE INDEX idx_shares_subject ON user_data_shares(subject_user_id) WHERE active = true;

-- RLS: Admin only
ALTER TABLE user_data_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage data shares"
  ON user_data_shares
  FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

-- Read policy for viewers to see their own shares
CREATE POLICY "Users can view their own shares"
  ON user_data_shares
  FOR SELECT
  USING (viewer_user_id = auth.uid());
```

### 1.2 Create Access Audit Log Table

```sql
-- Audit log for shared data access
CREATE TABLE access_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES profiles(id) NOT NULL,
  subject_user_id uuid REFERENCES profiles(id) NOT NULL,
  action_type text NOT NULL, -- 'view', 'read', 'write'
  resource_type text NOT NULL, -- 'order', 'product', 'stock', 'inbound'
  resource_id uuid,
  share_id uuid REFERENCES user_data_shares(id),
  metadata jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_audit_actor ON access_audit_log(actor_user_id);
CREATE INDEX idx_audit_subject ON access_audit_log(subject_user_id);
CREATE INDEX idx_audit_timestamp ON access_audit_log(created_at DESC);

-- RLS: Admin read-only, write via trigger/function
ALTER TABLE access_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit logs"
  ON access_audit_log
  FOR SELECT
  USING (public.get_user_role(auth.uid()) = 'admin');
```

### 1.3 Create Helper RPC Function

```sql
-- Get all accessible user IDs for a given user (including shares)
CREATE OR REPLACE FUNCTION get_accessible_user_ids(p_user_id uuid DEFAULT NULL)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role app_role;
  v_result uuid[];
  v_shared_subjects uuid[];
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  
  IF v_user_id IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;
  
  v_role := public.get_user_role(v_user_id);
  
  -- Admin can see all - return NULL to indicate no filter
  IF v_role = 'admin' THEN
    RETURN NULL;
  END IF;
  
  -- Start with base visibility from get_visible_owner_ids
  v_result := public.get_visible_owner_ids_for_user(v_user_id);
  IF v_result IS NULL THEN
    -- Shouldn't happen for non-admin, but fallback
    v_result := ARRAY[v_user_id];
  END IF;
  
  -- Add shared subjects
  SELECT ARRAY_AGG(DISTINCT subject_user_id)
  INTO v_shared_subjects
  FROM user_data_shares
  WHERE viewer_user_id = v_user_id
    AND active = true;
  
  IF v_shared_subjects IS NOT NULL THEN
    v_result := v_result || v_shared_subjects;
  END IF;
  
  -- Return unique IDs
  RETURN ARRAY(SELECT DISTINCT unnest(v_result));
END;
$$;

-- Helper to check if user can operate on subject's data
CREATE OR REPLACE FUNCTION can_operate_on_user(p_viewer_id uuid, p_subject_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_data_shares
    WHERE viewer_user_id = p_viewer_id
      AND subject_user_id = p_subject_id
      AND can_operate = true
      AND active = true
  )
  OR p_viewer_id = p_subject_id  -- Can always operate on own data
  OR get_user_role(p_viewer_id) = 'admin';  -- Admin can operate on all
$$;

-- Helper to get share scopes for a viewer-subject pair
CREATE OR REPLACE FUNCTION get_share_scopes(p_viewer_id uuid, p_subject_id uuid)
RETURNS TABLE(
  has_access boolean,
  scope_orders boolean,
  scope_products boolean,
  scope_stock_balance boolean,
  scope_inbound boolean,
  can_operate boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    true AS has_access,
    scope_orders,
    scope_products,
    scope_stock_balance,
    scope_inbound,
    can_operate
  FROM user_data_shares
  WHERE viewer_user_id = p_viewer_id
    AND subject_user_id = p_subject_id
    AND active = true
  LIMIT 1;
$$;
```

---

## Phase 2: React Hooks

### 2.1 Create `useAccessibleUserIds` Hook

**File:** `src/hooks/useAccessibleUserIds.ts`

```typescript
// Extends useVisibleUserIds to include data shares
export function useAccessibleUserIds() {
  const { user, role } = useAuth();
  const { visibleUserIds: teamVisibleIds } = useVisibleUserIds();
  
  // Fetch active shares for current user
  const { data: shares = [] } = useDataShares();
  
  const accessibleUserIds = useMemo(() => {
    if (!user?.id) return [];
    if (role === 'admin') return undefined; // Admin sees all
    
    // Combine team visibility + shared subjects
    const teamIds = teamVisibleIds || [user.id];
    const sharedSubjectIds = shares
      .filter(s => s.active)
      .map(s => s.subject_user_id);
    
    return [...new Set([...teamIds, ...sharedSubjectIds])];
  }, [user?.id, role, teamVisibleIds, shares]);
  
  return { accessibleUserIds };
}
```

### 2.2 Create `useDataShares` Hook

**File:** `src/hooks/useDataShares.ts`

```typescript
// Hook for fetching shares where current user is the viewer
export function useDataShares() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['data-shares', 'viewer', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_data_shares')
        .select(`
          *,
          subject:profiles!subject_user_id(id, display_name, email, role)
        `)
        .eq('viewer_user_id', user?.id)
        .eq('active', true);
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
}

// Admin hook for all shares
export function useAllDataShares() {
  const { role } = useAuth();
  
  return useQuery({
    queryKey: ['data-shares', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_data_shares')
        .select(`
          *,
          viewer:profiles!viewer_user_id(id, display_name, email, role),
          subject:profiles!subject_user_id(id, display_name, email, role),
          created_by:profiles!created_by_admin_id(id, display_name)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: role === 'admin',
  });
}
```

### 2.3 Create Share Management Mutations

**File:** `src/hooks/useDataShareMutations.ts`

```typescript
export function useCreateDataShare() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (data: {
      viewer_user_id: string;
      subject_user_id: string;
      scope_orders?: boolean;
      scope_products?: boolean;
      scope_stock_balance?: boolean;
      scope_inbound?: boolean;
      can_operate?: boolean;
    }) => {
      const { data: result, error } = await supabase
        .from('user_data_shares')
        .insert({
          ...data,
          created_by_admin_id: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-shares'] });
      toast.success('Data share created');
    },
  });
}

export function useUpdateDataShare() { /* ... */ }
export function useDeleteDataShare() { /* ... */ }
```

---

## Phase 3: Admin UI

### 3.1 Create Admin Data Sharing Page

**File:** `src/pages/admin/DataSharingAdmin.tsx`

**Features:**
- Table listing all active shares with columns:
  - Viewer (name, email, role badge)
  - Subject (name, email, role badge)
  - Scopes (badges for each enabled scope)
  - Can Operate (toggle)
  - Active (toggle)
  - Created At
  - Actions (Edit, Disable, Delete)

- "Create Share" dialog:
  - Viewer selector (searchable, excludes admins)
  - Subject selector (searchable, excludes admins)
  - Scope toggles (Orders, Products, Stock Balance, Inbound)
  - Can Operate toggle
  - Active toggle (default ON)
  - Save button

### 3.2 Add to Sidebar

**File:** `src/components/layout/AppSidebar.tsx`

Add to Settings items:
```typescript
{
  title: "Data Sharing",
  url: "/admin/data-sharing",
  icon: Share2,
  roles: ['admin']
}
```

---

## Phase 4: Viewer-Side Data Scope Selector

### 4.1 Create Data Scope Selector Component

**File:** `src/components/filters/DataScopeSelector.tsx`

```typescript
interface DataScopeSelectorProps {
  value: 'my' | 'shared' | 'all';
  onChange: (value: 'my' | 'shared' | 'all') => void;
  shares: DataShare[];
}

export function DataScopeSelector({ value, onChange, shares }: DataScopeSelectorProps) {
  if (shares.length === 0) return null; // No shares, no selector
  
  return (
    <Tabs value={value} onValueChange={onChange}>
      <TabsList>
        <TabsTrigger value="my">My Data</TabsTrigger>
        <TabsTrigger value="shared">Shared Users ({shares.length})</TabsTrigger>
        <TabsTrigger value="all">All Accessible</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
```

### 4.2 Add Owner Column to Data Tables

Update `OrdersTableFixed`, `MobileOrderCard`, `MobileStockCard` to show owner badge when viewing shared data.

---

## Phase 5: Update Data Queries

### 5.1 Update `useTeamOrders`

Add `dataScope` parameter:
- `'my'` = filter to current user only
- `'shared'` = filter to shared subject IDs only
- `'all'` = use full `accessibleUserIds`

### 5.2 Update `useProducts`

Same pattern - accept `dataScope` and filter accordingly.

### 5.3 Update `useFilteredStockBalance`

Same pattern - integrate with shares.

---

## Phase 6: Operation Guards

### 6.1 Create `useCanOperate` Hook

```typescript
export function useCanOperate(subjectUserId: string) {
  const { user, role } = useAuth();
  const { data: shares = [] } = useDataShares();
  
  return useMemo(() => {
    if (!user?.id) return false;
    if (user.id === subjectUserId) return true; // Own data
    if (role === 'admin') return true; // Admin can operate on all
    
    const share = shares.find(s => 
      s.subject_user_id === subjectUserId && s.active
    );
    
    return share?.can_operate ?? false;
  }, [user?.id, subjectUserId, role, shares]);
}
```

### 6.2 Apply Guards to Actions

In order detail dialogs and action buttons:
```typescript
const canOperate = useCanOperate(order.salesperson_id);

<Button 
  disabled={!canOperate}
  onClick={handleDelivered}
>
  Mark Delivered
</Button>

{!canOperate && (
  <Tooltip content="You have read-only access to this user's data">
    <Lock className="h-4 w-4 text-muted-foreground" />
  </Tooltip>
)}
```

---

## Phase 7: Audit Logging

### 7.1 Create Audit Logging Helper

```typescript
async function logSharedDataAccess(params: {
  subjectUserId: string;
  actionType: 'view' | 'read' | 'write';
  resourceType: 'order' | 'product' | 'stock' | 'inbound';
  resourceId?: string;
  shareId?: string;
}) {
  // Only log for shared data access, not own data
  if (params.subjectUserId === currentUserId) return;
  
  await supabase.from('access_audit_log').insert({
    actor_user_id: currentUserId,
    ...params,
  });
}
```

### 7.2 Log Write Operations

In mutations that modify shared data, add audit logging.

---

## Summary of Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/xxx_data_sharing.sql` | CREATE | Tables + RPC functions |
| `src/hooks/useDataShares.ts` | CREATE | Share fetching hooks |
| `src/hooks/useDataShareMutations.ts` | CREATE | CRUD mutations |
| `src/hooks/useAccessibleUserIds.ts` | CREATE | Combined visibility hook |
| `src/hooks/useCanOperate.ts` | CREATE | Operation permission check |
| `src/pages/admin/DataSharingAdmin.tsx` | CREATE | Admin management page |
| `src/components/filters/DataScopeSelector.tsx` | CREATE | Viewer-side scope toggle |
| `src/components/layout/AppSidebar.tsx` | MODIFY | Add admin menu item |
| `src/App.tsx` | MODIFY | Add route |
| `src/hooks/useTeamOrders.ts` | MODIFY | Integrate data scope |
| `src/hooks/useProducts.ts` | MODIFY | Integrate data scope |
| `src/hooks/useStockVisibility.ts` | MODIFY | Integrate data scope |
| `src/pages/sales/ReadySales.tsx` | MODIFY | Add scope selector |
| `src/pages/sales/BookingSales.tsx` | MODIFY | Add scope selector |
| `src/pages/InventoryBalance.tsx` | MODIFY | Add scope selector |
| `src/pages/products/ProductsPage.tsx` | MODIFY | Add scope selector |

---

## Acceptance Criteria Validation

| Criteria | Implementation |
|----------|----------------|
| Admin can grant Manager visibility to Salesperson data | `user_data_shares` table with admin-only management |
| Manager sees non-zero team data after share enabled | `get_accessible_user_ids()` includes shared subjects |
| Products/Orders/Stock never leak outside accessible scope | All queries use `accessibleUserIds` filter |
| Import validates SKUs within accessible scope | `useOrderOwnerProducts` respects scope |
| UI shows owner column for shared data | Owner badge added to cards/tables |
| Read-only vs operate permissions enforced | `can_operate` flag checked before actions |
| All shared access is audited | `access_audit_log` table with triggers |
| Fast UI with pagination, no horizontal scroll | DataGrid patterns maintained |
