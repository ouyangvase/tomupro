
# Data Visibility Sharing System - Implementation Plan

## Overview

Building an Admin-only "Data Visibility Sharing" system that allows granting users (Viewers) permission to view and optionally operate on another user's (Subject) data across Orders, Products, Stock Balance, and Inbound modules.

---

## Current State Analysis

### Existing Infrastructure
- **`stock_visibility_overrides` table**: Already exists but only handles stock visibility (not orders/products)
- **`manager_groups` + `group_members` tables**: Used for manager team visibility
- **`get_visible_owner_ids()` RPC**: Server-side visibility resolver
- **`can_view_stock()` function**: Database function for stock visibility checks
- **`useVisibleUserIds()` hook**: Client-side visibility helper

### Gap Analysis
The current system lacks:
1. Granular scope control (Orders, Products, Stock, Inbound)
2. Operation permission (`can_operate` flag)
3. Admin management UI for data sharing
4. Viewer-side data scope selector
5. Audit logging for shared data access

---

## Database Schema

### Table: `user_data_shares`

```sql
CREATE TABLE public.user_data_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope_orders BOOLEAN NOT NULL DEFAULT true,
  scope_products BOOLEAN NOT NULL DEFAULT true,
  scope_stock_balance BOOLEAN NOT NULL DEFAULT true,
  scope_inbound BOOLEAN NOT NULL DEFAULT false,
  can_operate BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by_admin_id UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_viewer_subject UNIQUE (viewer_user_id, subject_user_id),
  CONSTRAINT no_self_share CHECK (viewer_user_id != subject_user_id)
);

-- Indexes for performance
CREATE INDEX idx_user_data_shares_viewer ON public.user_data_shares(viewer_user_id) WHERE active = true;
CREATE INDEX idx_user_data_shares_subject ON public.user_data_shares(subject_user_id) WHERE active = true;

-- Enable RLS
ALTER TABLE public.user_data_shares ENABLE ROW LEVEL SECURITY;

-- Only admins can manage shares
CREATE POLICY "Admins can manage all shares"
  ON public.user_data_shares
  FOR ALL
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- Users can view shares they're involved in
CREATE POLICY "Users can view their own shares"
  ON public.user_data_shares
  FOR SELECT
  TO authenticated
  USING (viewer_user_id = auth.uid() OR subject_user_id = auth.uid());
```

### Table: `access_audit_log`

```sql
CREATE TABLE public.access_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES public.profiles(id),
  subject_user_id UUID REFERENCES public.profiles(id),
  action_type TEXT NOT NULL, -- 'view', 'read', 'write', 'share_created', 'share_updated'
  resource_type TEXT NOT NULL, -- 'order', 'product', 'stock', 'inbound', 'share'
  resource_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying by actor and time
CREATE INDEX idx_access_audit_actor ON public.access_audit_log(actor_user_id, created_at DESC);
CREATE INDEX idx_access_audit_subject ON public.access_audit_log(subject_user_id, created_at DESC);

-- Enable RLS - only admins can view audit logs
ALTER TABLE public.access_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all audit logs"
  ON public.access_audit_log
  FOR SELECT
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- Anyone can insert (for logging purposes)
CREATE POLICY "Authenticated users can insert audit logs"
  ON public.access_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (actor_user_id = auth.uid());
```

### Updated RPC: `get_accessible_owner_ids`

```sql
CREATE OR REPLACE FUNCTION public.get_accessible_owner_ids(p_scope TEXT DEFAULT 'orders')
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role app_role;
  v_result uuid[];
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  SELECT role INTO v_role FROM profiles WHERE id = v_user_id;
  
  IF v_role = 'admin' THEN
    RETURN NULL; -- Admin sees all (null = no filter)
  END IF;
  
  -- Start with own ID
  v_result := ARRAY[v_user_id];
  
  -- Add team members (for managers)
  IF v_role = 'manager' THEN
    v_result := v_result || ARRAY(
      SELECT salesperson_id FROM manager_salesperson_bindings
      WHERE manager_id = v_user_id AND active = true
      UNION
      SELECT gm.member_user_id FROM manager_groups mg
      JOIN group_members gm ON gm.group_id = mg.id
      WHERE mg.manager_user_id = v_user_id
      UNION
      SELECT id FROM profiles
      WHERE manager_id = v_user_id AND is_active = true
    );
  END IF;
  
  -- Add shared subjects based on scope
  v_result := v_result || ARRAY(
    SELECT subject_user_id FROM user_data_shares
    WHERE viewer_user_id = v_user_id
      AND active = true
      AND CASE p_scope
        WHEN 'orders' THEN scope_orders
        WHEN 'products' THEN scope_products
        WHEN 'stock' THEN scope_stock_balance
        WHEN 'inbound' THEN scope_inbound
        ELSE scope_orders
      END = true
  );
  
  -- Return unique IDs
  RETURN ARRAY(SELECT DISTINCT unnest(v_result));
END;
$$;
```

---

## Files to Create

### 1. Type Definitions

**File: `src/types/data-sharing.ts`**
```typescript
export interface UserDataShare {
  id: string;
  viewer_user_id: string;
  subject_user_id: string;
  scope_orders: boolean;
  scope_products: boolean;
  scope_stock_balance: boolean;
  scope_inbound: boolean;
  can_operate: boolean;
  active: boolean;
  created_by_admin_id: string;
  created_at: string;
  updated_at: string;
  viewer?: { id: string; display_name: string; email: string; role: string };
  subject?: { id: string; display_name: string; email: string; role: string };
}

export interface AccessAuditLog {
  id: string;
  actor_user_id: string;
  subject_user_id: string | null;
  action_type: 'view' | 'read' | 'write' | 'share_created' | 'share_updated';
  resource_type: 'order' | 'product' | 'stock' | 'inbound' | 'share';
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export type DataScope = 'orders' | 'products' | 'stock' | 'inbound';
export type DataViewMode = 'my_data' | 'shared' | 'all_accessible';
```

### 2. Data Sharing Hook

**File: `src/hooks/useDataSharing.ts`**

Provides:
- `useDataShares()` - Fetch all shares (admin)
- `useMySharedAccess()` - Fetch shares where current user is viewer
- `useCreateDataShare()` - Create new share
- `useUpdateDataShare()` - Update existing share
- `useDeleteDataShare()` - Remove share
- `useAccessibleOwnerIds(scope)` - Get accessible owner IDs for a scope

### 3. Admin Management Page

**File: `src/pages/admin/DataSharingAdmin.tsx`**

Features:
- Create share form with Viewer/Subject selectors
- Scope toggles (Orders, Products, Stock, Inbound)
- Can Operate toggle
- Active toggle
- Share list table with edit/disable/delete actions
- Audit log viewer section

### 4. Data Scope Selector Component

**File: `src/components/data-sharing/DataScopeSelector.tsx`**

A dropdown component showing:
- "My Data" (default)
- "Shared Users" (if any shares exist)
- "All Accessible" (combined view)

Will be added to Orders, Products, Stock Balance, and Inbound pages.

---

## Files to Modify

### 1. Sidebar Navigation

**File: `src/components/layout/AppSidebar.tsx`**

Add new menu item under Settings:
```typescript
{
  title: "Data Sharing",
  url: "/admin/data-sharing",
  icon: Share2,
  roles: ['admin']
}
```

### 2. App Router

**File: `src/App.tsx`**

Add route:
```typescript
<Route path="/admin/data-sharing" element={<ProtectedRoute><DataSharingAdmin /></ProtectedRoute>} />
```

### 3. Team Visibility Hook

**File: `src/hooks/useTeamVisibility.ts`**

Update `useVisibleUserIds()` to:
- Accept optional `scope` parameter
- Include shared subject IDs from `user_data_shares`
- Return `dataViewMode` state and setter

### 4. Orders Hook

**File: `src/hooks/useOrders.ts` and `src/hooks/useTeamOrders.ts`**

Update to:
- Use scoped accessibility from `get_accessible_owner_ids('orders')`
- Support `DataViewMode` filtering
- Add "Owner" column to returned data

### 5. Products Hook

**File: `src/hooks/useProducts.ts`**

Update to:
- Use `get_accessible_owner_ids('products')` 
- Filter by `dataViewMode`

### 6. Inventory Hook

**File: `src/hooks/useInventory.ts`**

Update `useFilteredStockBalance()` to:
- Use `get_accessible_owner_ids('stock')`
- Respect data sharing scopes

### 7. Order Pages (Sales modules)

**Files:**
- `src/pages/sales/BookingSales.tsx`
- `src/pages/sales/ReadySales.tsx`
- `src/pages/sales/CancelledSales.tsx`

Add:
- DataScopeSelector at top
- Owner column/badge showing data owner
- Disable actions if `can_operate=false` on shared records

### 8. Products Page

**File: `src/pages/products/ProductsPage.tsx`**

Add:
- DataScopeSelector
- Owner badge on shared records
- Disable edit/delete on shared records if `can_operate=false`

### 9. Stock Balance Page

**File: `src/pages/InventoryBalance.tsx`**

Add:
- DataScopeSelector
- Owner column
- Filter by accessible owners

---

## Implementation Phases

### Phase 1: Database Schema (Migration)
1. Create `user_data_shares` table with constraints
2. Create `access_audit_log` table
3. Update/create `get_accessible_owner_ids()` RPC
4. Add necessary indexes

### Phase 2: Core Hooks & Types
1. Create `src/types/data-sharing.ts`
2. Create `src/hooks/useDataSharing.ts`
3. Update `src/hooks/useTeamVisibility.ts`

### Phase 3: Admin UI
1. Create `src/pages/admin/DataSharingAdmin.tsx`
2. Add route to `src/App.tsx`
3. Add sidebar navigation item

### Phase 4: Data Scope Selector
1. Create `src/components/data-sharing/DataScopeSelector.tsx`
2. Create context for data view mode state

### Phase 5: Update Data Hooks
1. Update `useProducts.ts`
2. Update `useOrders.ts` / `useTeamOrders.ts`
3. Update `useInventory.ts`

### Phase 6: Update UI Pages
1. Add DataScopeSelector to Order pages
2. Add DataScopeSelector to Products page
3. Add DataScopeSelector to Stock Balance page
4. Add Owner badges/columns
5. Implement `can_operate` restrictions

### Phase 7: Audit Logging
1. Add audit log inserts on share create/update
2. Add audit log inserts on shared data writes

---

## Technical Details

### RLS Policy Updates

The existing RLS policies use `get_visible_owner_ids()` which will be updated to internally call `get_accessible_owner_ids()` with the appropriate scope, ensuring database-level enforcement.

### Performance Considerations

- Indexes on `viewer_user_id` and `subject_user_id` with `WHERE active = true`
- Cache accessible owner IDs for 30 seconds (already implemented)
- Limit audit log queries with pagination

### Security Considerations

1. Only admins can create/modify shares
2. Users can only see shares they're involved in
3. `can_operate=false` prevents write operations on shared data
4. All shared data writes are audit logged
5. Cannot share admin user data

---

## Acceptance Criteria Mapping

| Requirement | Implementation |
|-------------|----------------|
| Admin can grant Manager->SP visibility | DataSharingAdmin page with scope toggles |
| Manager sees non-zero team data after share | Updated visibility hooks respect shares |
| Products/Orders/Stock don't leak | RLS uses `get_accessible_owner_ids()` |
| SKU selection respects accessible scope | OrderEditor filters products by accessible owners |
| UI fast with pagination | DataGrid with existing pagination |
| Audit logging | `access_audit_log` table with triggers |

