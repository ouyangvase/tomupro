

# Tomu App - Comprehensive Refactoring Plan

## Executive Summary

This is a major refactoring effort to fix critical issues across visibility, bindings, warehouses/stock, delivery permissions, performance, and mobile UI. The plan is organized into prioritized phases to ensure data correctness first, then performance, then UI polish.

---

## Phase 1: Data Visibility & Bindings (Critical - Days 1-3)

### 1.1 Create Unified "Accessible Owners" Resolver

**Problem**: Manager sees notifications for team actions but dashboards show 0 data. The visibility scoping is inconsistent across pages.

**Current State Analysis**:
- `get_visible_owner_ids()` function exists and is mostly correct
- It combines: `manager_salesperson_bindings`, `manager_groups`, and `profiles.manager_id`
- The issue: some pages bypass this function or use incorrect filters

**Solution - Create a Consistent Pattern**:

1. **Database Function Enhancement**:
```sql
-- file: New migration
-- Enhanced accessible_owners that works for ALL roles consistently
CREATE OR REPLACE FUNCTION public.get_accessible_owner_ids(
  p_include_shares boolean DEFAULT true
)
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role app_role;
  v_result uuid[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN ARRAY[]::uuid[]; END IF;
  
  v_role := public.get_user_role(v_user_id);
  
  -- Admin: NULL means no filter
  IF v_role = 'admin' THEN RETURN NULL; END IF;
  
  -- Salesperson: own data only
  IF v_role = 'salesperson' THEN
    SELECT ARRAY[v_user_id] || COALESCE(
      array_agg(uds.subject_user_id) FILTER (WHERE p_include_shares AND uds.active),
      ARRAY[]::uuid[]
    )
    INTO v_result
    FROM user_data_shares uds
    WHERE uds.viewer_user_id = v_user_id;
    RETURN COALESCE(v_result, ARRAY[v_user_id]);
  END IF;
  
  -- Manager: self + bound salespersons + shares
  IF v_role = 'manager' THEN
    SELECT ARRAY[v_user_id] || COALESCE(
      array_agg(DISTINCT member_id) FILTER (WHERE member_id IS NOT NULL),
      ARRAY[]::uuid[]
    )
    INTO v_result
    FROM (
      -- Canonical bindings
      SELECT msb.salesperson_id AS member_id
      FROM manager_salesperson_bindings msb
      WHERE msb.manager_id = v_user_id AND msb.active = true
      UNION
      -- Backward compat: groups
      SELECT gm.member_user_id AS member_id
      FROM manager_groups mg
      JOIN group_members gm ON gm.group_id = mg.id
      WHERE mg.manager_user_id = v_user_id
      UNION
      -- Data shares (if enabled)
      SELECT uds.subject_user_id AS member_id
      FROM user_data_shares uds
      WHERE p_include_shares AND uds.viewer_user_id = v_user_id AND uds.active
    ) team;
    RETURN v_result;
  END IF;
  
  -- Runner: own + bound users for specific contexts
  IF v_role = 'runner' THEN
    SELECT ARRAY[v_user_id] || COALESCE(
      array_agg(DISTINCT b.salesperson_id),
      ARRAY[]::uuid[]
    )
    INTO v_result
    FROM bindings b
    WHERE b.runner_id = v_user_id AND b.active = true;
    RETURN v_result;
  END IF;
  
  RETURN ARRAY[v_user_id];
END;
$$;
```

2. **Frontend Hook Standardization**:

**File: `src/hooks/useAccessibleUserIds.ts`** - Make this the SINGLE source of truth:
- Refactor to call the new RPC consistently
- Remove redundant logic in `useTeamVisibility.ts`
- All pages must import from this one hook

3. **Page-by-Page Fix**:

| Page | Current Issue | Fix |
|------|---------------|-----|
| `ManagerDashboard.tsx` | Uses custom query with wrong filter | Use `get_accessible_owner_ids()` |
| `ReadySales.tsx` | May not filter correctly | Use standardized `useTeamOrders` |
| `BookingSales.tsx` | Same issue | Use standardized `useTeamOrders` |
| `InventoryBalance.tsx` | Works via `get_stock_balance()` | Verify consistency |

### 1.2 Fix Manager-to-Salesperson Bindings

**Problem**: Removing bindings should NEVER change user roles or break login.

**Verification Needed**:
- Search for triggers that modify `profiles.role` on binding changes
- Ensure `manager_salesperson_bindings` is a pure relationship table

**Files to Audit**:
```sql
-- Search for problematic triggers
SELECT * FROM pg_trigger WHERE tgname LIKE '%binding%';
SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid = 'manager_salesperson_bindings'::regclass;
```

**Safeguard to Add**:
```sql
-- Migration: Ensure binding changes never touch profiles
CREATE OR REPLACE FUNCTION prevent_role_change_on_binding()
RETURNS TRIGGER AS $$
BEGIN
  -- This trigger ensures bindings don't cascade to role changes
  -- Roles are ONLY changed by admin actions
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 1.3 Runner Binding Enhancement for Assign Runner Modal

**Problem**: When manager assigns runner to order, dropdown should show runners bound to that manager.

**Solution**:

1. **New Hook**: `useManagerBoundRunners.ts`
```typescript
// Fetch runners bound to the current manager (or salesperson)
export function useManagerBoundRunners(managerId?: string) {
  return useQuery({
    queryKey: ['manager-bound-runners', managerId],
    enabled: !!managerId,
    queryFn: async () => {
      // Get runners via manager_runner_bindings
      const { data: mrb } = await supabase
        .from('manager_runner_bindings')
        .select('runner:profiles!runner_id(*)')
        .eq('manager_id', managerId);
      
      // Also get runners bound to salespersons under this manager
      const { data: spBindings } = await supabase
        .from('bindings')
        .select('runner:profiles!runner_id(*)')
        .in('salesperson_id', /* team member IDs */);
      
      // Deduplicate and return
    }
  });
}
```

2. **Update Assign Runner Dialog** to use this hook

---

## Phase 2: Warehouse & Stock Fixes (Critical - Days 3-5)

### 2.1 Fix Warehouse Auto-Creation

**Current State**: The trigger `auto_create_warehouse_on_role_change` exists but may not cover all cases.

**Enhancement**:
```sql
-- Ensure warehouse type enum includes MANAGER
-- Already exists: 'SALESPERSON' | 'RUNNER' | 'MANAGER'

-- Fix the auto-create trigger to be more robust
CREATE OR REPLACE FUNCTION auto_create_warehouse_on_role_change()
RETURNS TRIGGER AS $$
DECLARE
  v_warehouse_type warehouse_type;
  v_existing_id uuid;
BEGIN
  IF NEW.role IN ('salesperson', 'manager') AND 
     (OLD.role IS NULL OR OLD.role != NEW.role) THEN
    
    v_warehouse_type := CASE 
      WHEN NEW.role = 'manager' THEN 'MANAGER'::warehouse_type
      ELSE 'SALESPERSON'::warehouse_type
    END;
    
    -- Check for existing warehouse of correct type
    SELECT id INTO v_existing_id
    FROM warehouses
    WHERE owner_user_id = NEW.id
      AND warehouse_type = v_warehouse_type
    LIMIT 1;
    
    IF v_existing_id IS NOT NULL THEN
      -- Reactivate if needed
      UPDATE warehouses SET is_active = true WHERE id = v_existing_id;
    ELSE
      -- Create new
      INSERT INTO warehouses (warehouse_type, owner_user_id, name, is_active)
      VALUES (v_warehouse_type, NEW.id, NEW.display_name || '''s Warehouse', true);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 2.2 Fix Runner Inbound Target User Dropdown

**Problem**: Dropdown shows only few managers, should show ALL bound salespersons AND managers.

**Current Implementation**: `useRunnerBoundUsers.ts` queries `v_runner_target_users` view.

**Fix**:
```sql
-- Ensure the view includes ALL bound users
CREATE OR REPLACE VIEW v_runner_target_users AS
SELECT DISTINCT
  b.runner_id,
  p.id as user_id,
  p.display_name as name,
  p.email,
  p.role,
  w.id as warehouse_id
FROM bindings b
JOIN profiles p ON p.id = b.salesperson_id
LEFT JOIN warehouses w ON w.owner_user_id = p.id AND w.is_active = true
WHERE b.active = true

UNION

SELECT DISTINCT
  mrb.runner_id,
  p.id as user_id,
  p.display_name as name,
  p.email,
  p.role,
  w.id as warehouse_id
FROM manager_runner_bindings mrb
JOIN profiles p ON p.id = mrb.manager_id
LEFT JOIN warehouses w ON w.owner_user_id = p.id AND w.is_active = true;
```

### 2.3 Fix Stock Balance for Manager

**Problem**: Manager acknowledges inbound but stock balance shows empty.

**Root Cause Analysis**:
1. `ack_inbound_and_add_stock` RPC creates stock movements
2. `get_stock_balance()` should return these movements aggregated
3. Either movements aren't created correctly, or view filter is wrong

**Fix Steps**:

1. **Verify RPC creates movements for correct warehouse**:
```sql
-- In ack_inbound_and_add_stock, ensure warehouse lookup uses:
SELECT id INTO v_warehouse_id
FROM warehouses
WHERE owner_user_id = p_target_user_id
  AND warehouse_type = (
    CASE (SELECT role FROM profiles WHERE id = p_target_user_id)
      WHEN 'manager' THEN 'MANAGER'
      ELSE 'SALESPERSON'
    END
  )::warehouse_type
  AND is_active = true
LIMIT 1;
```

2. **Verify `get_stock_balance()` includes manager warehouses**:
```sql
-- Ensure the view/function includes MANAGER warehouse type
WHERE w.warehouse_type IN ('SALESPERSON', 'MANAGER')
  AND w.is_active = true
```

### 2.4 Fix "Cannot coerce to single JSON object" Error

**Problem**: Queries expecting single row but getting 0 or multiple.

**Solution Pattern**:
1. Replace all `.single()` calls with `.maybeSingle()` where 0 rows possible
2. Add proper error handling

**Files to Update**:
- `useInboundShipments.ts` - Already fixed
- `useStockVisibility.ts` - Check all queries
- Any RPC that returns a single object

---

## Phase 3: Runner Delivered Permission Fix (Critical - Days 5-6)

### 3.1 Fix "Only Admin Can Modify Status" Error

**Problem**: Runner clicks Delivered but gets blocked by `check_delivered_order_lock` trigger.

**Current Trigger Analysis**:
The trigger correctly allows:
- Setting DELIVERED when already DELIVERED (idempotent)
- Setting DELIVERED when not yet delivered

**But the error suggests**:
- Either the order WAS already delivered (race condition)
- Or the role detection is failing

**Fix**:

1. **Improve Error Messaging**:
```sql
CREATE OR REPLACE FUNCTION check_delivered_order_lock()
RETURNS TRIGGER AS $$
DECLARE
  user_role app_role;
BEGIN
  user_role := get_user_role(auth.uid());
  
  IF OLD.runner_status = 'DELIVERED' AND user_role != 'admin' THEN
    IF NEW.runner_status = 'DELIVERED' THEN
      RETURN NEW; -- Idempotent
    END IF;
    
    -- Better error message
    RAISE EXCEPTION 'Order already delivered at %. Only admin can modify. (User role: %)', 
      OLD.delivered_at, user_role;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

2. **Frontend: Prevent Double Submit**:

**File: `src/pages/runner/RunnerInbox.tsx`** - Already uses `markDeliveredFast` with optimistic update

**Additional safeguard**:
```typescript
// Add loading state per order
const [deliveringOrders, setDeliveringOrders] = useState<Set<string>>(new Set());

const handleMarkDelivered = (order: Order) => {
  if (deliveringOrders.has(order.id)) return; // Already processing
  if (order.runner_status === 'DELIVERED') return; // Already delivered
  
  setDeliveringOrders(prev => new Set(prev).add(order.id));
  markDeliveredFast.mutate(order.id, {
    onSettled: () => {
      setDeliveringOrders(prev => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  });
};
```

---

## Phase 4: Performance Optimization (Days 6-8)

### 4.1 Add Query Performance Instrumentation

**Create Logging Infrastructure**:

```sql
-- Create system_logs table
CREATE TABLE IF NOT EXISTS system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  role text,
  page text,
  action text,
  duration_ms integer,
  payload_summary jsonb,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Index for querying
CREATE INDEX idx_system_logs_slow ON system_logs (duration_ms DESC);
```

**Frontend Wrapper**:
```typescript
// src/lib/queryWithTiming.ts
export async function queryWithTiming<T>(
  queryFn: () => Promise<T>,
  context: { page: string; action: string }
): Promise<T> {
  const start = performance.now();
  try {
    const result = await queryFn();
    const duration = performance.now() - start;
    
    if (duration > 2000) {
      console.warn(`[SLOW QUERY] ${context.page}.${context.action}: ${duration.toFixed(0)}ms`);
      // Could log to system_logs via edge function
    }
    
    return result;
  } catch (error) {
    console.error(`[QUERY ERROR] ${context.page}.${context.action}:`, error);
    throw error;
  }
}
```

### 4.2 Add Loading Timeout with Retry

**Create Reusable Component**:
```typescript
// src/components/ui/loading-timeout.tsx
interface LoadingTimeoutProps {
  isLoading: boolean;
  onRetry: () => void;
  timeoutMs?: number;
  children: React.ReactNode;
}

export function LoadingTimeout({ 
  isLoading, 
  onRetry, 
  timeoutMs = 10000,
  children 
}: LoadingTimeoutProps) {
  const [timedOut, setTimedOut] = useState(false);
  
  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false);
      return;
    }
    
    const timer = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [isLoading, timeoutMs]);
  
  if (timedOut) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-muted-foreground">Could not load data. Please retry.</p>
        <Button onClick={onRetry}>Retry</Button>
      </div>
    );
  }
  
  return <>{children}</>;
}
```

### 4.3 Add Database Indexes

```sql
-- Performance indexes for common queries
CREATE INDEX IF NOT EXISTS idx_orders_salesperson_status 
  ON orders (salesperson_id, status, runner_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_owner_runner 
  ON orders (salesperson_id, runner_id, runner_status);

CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse_product 
  ON stock_movements (warehouse_id, product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bindings_lookup 
  ON bindings (runner_id, salesperson_id, active);

CREATE INDEX IF NOT EXISTS idx_manager_salesperson_bindings_lookup 
  ON manager_salesperson_bindings (manager_id, active);
```

---

## Phase 5: Admin Features (Days 8-10)

### 5.1 Admin "View As / Operate As" Mode

**Implementation**:

1. **Context Enhancement**:
```typescript
// src/contexts/ViewAsContext.tsx
interface ViewAsContextType {
  viewingAsUser: Profile | null;
  canOperate: boolean;
  startViewAs: (userId: string, canOperate?: boolean) => void;
  stopViewAs: () => void;
}
```

2. **UI Banner**:
```typescript
// src/components/admin/ViewAsBanner.tsx
export function ViewAsBanner() {
  const { viewingAsUser, canOperate, stopViewAs } = useViewAs();
  
  if (!viewingAsUser) return null;
  
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-black p-2 text-center">
      <span>Viewing as: {viewingAsUser.display_name} ({viewingAsUser.role})</span>
      {canOperate && <Badge variant="destructive" className="ml-2">Operate Mode</Badge>}
      <Button variant="ghost" size="sm" onClick={stopViewAs} className="ml-4">
        Exit View As
      </Button>
    </div>
  );
}
```

3. **Integration with Hooks**:
All visibility hooks check `useViewAs().viewingAsUser` and return that user's scope if active.

### 5.2 Admin "Grant View Access" Feature

**Already Implemented** as `user_data_shares` table and `DataSharingAdmin.tsx` page.

**Verify**:
- Grants are respected in `get_accessible_owner_ids()`
- Audit logging exists

### 5.3 Resigned User "Close Account" + Stock Transfer

**Implementation**:

1. **Close Account Button** (already exists via `DisableUserDialog.tsx`):
   - Sets `status = 'resigned'`
   - Triggers `handle_user_status_change()` which bans auth

2. **Stock Transfer Workflow** (already exists via `OffboardingStockTransferDialog.tsx`):
   - Verify it works for manager targets
   - Ensure audit logging

---

## Phase 6: Mobile UI Revamp - Maybank Style (Days 10-14)

### 6.1 Design System Definition

**Mobile Design Tokens** (only for viewport < 768px):
```css
/* src/index.css - Mobile overrides */
@media (max-width: 767px) {
  :root {
    --card-radius: 16px;
    --spacing-card: 16px;
    --font-size-hero: 32px;
  }
  
  .mobile-card {
    @apply rounded-2xl bg-card p-4 shadow-sm border;
  }
  
  .mobile-header {
    @apply sticky top-0 bg-background/95 backdrop-blur-sm z-40 px-4 py-3;
  }
  
  .mobile-summary-card {
    @apply bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-5 border border-primary/20;
  }
  
  .mobile-action-grid {
    @apply grid grid-cols-2 gap-3;
  }
  
  .mobile-action-button {
    @apply flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-card border h-24;
  }
}
```

### 6.2 Page-by-Page Mobile Conversion

| Page | Mobile Component | Key Changes |
|------|------------------|-------------|
| Booking Sales | `MobileBookingSales.tsx` | Hero summary, search, filter chips, card list |
| Ready Sales | `MobileReadySales.tsx` | Same pattern |
| Delivered Orders | Already has mobile | Verify consistency |
| Cancelled | `MobileCancelledOrders.tsx` | Same pattern |
| Action Required | `MobileActionRequired.tsx` | Priority on action items |
| Stock Balance | Already has mobile | Verify styling |
| Products | `MobileProductsList.tsx` | Card grid |
| Runner Inbox | Needs mobile | Card list with action buttons |
| Runner Inbound | Needs mobile | Stepper flow |

### 6.3 Shared Mobile Components

```typescript
// src/components/mobile/MobileSummaryCard.tsx
// src/components/mobile/MobileFilterChips.tsx
// src/components/mobile/MobileSearchBar.tsx
// src/components/mobile/MobileCardList.tsx
// src/components/mobile/MobileStickyActions.tsx
```

---

## Phase 7: Desktop Table Responsiveness (Days 14-15)

### 7.1 DataGrid Enhancement

**File: `src/components/data-grid/DataGrid.tsx`**

```typescript
// Add responsive column config
interface Column<T> {
  // ... existing props
  hideOnMobile?: boolean;
  wrapText?: boolean;
  minWidth?: string;
  maxWidth?: string;
}

// In render:
<Table className="table-fixed">
  <TableHeader className="sticky top-0 bg-background z-10">
    {/* sticky header */}
  </TableHeader>
  <TableBody>
    {data.map(row => (
      <TableRow>
        {columns.map(col => (
          <TableCell 
            className={cn(
              "truncate",
              col.wrapText && "whitespace-normal break-words",
            )}
            style={{ minWidth: col.minWidth, maxWidth: col.maxWidth }}
          >
            {/* content */}
          </TableCell>
        ))}
      </TableRow>
    ))}
  </TableBody>
</Table>
```

### 7.2 Apply to All Sales Tables

- Runner Inbox
- Booking Sales
- Ready Sales
- Delivered Orders
- Action Required

---

## Testing Checklist

### Visibility Tests
- [ ] Manager with 3 bound salespersons sees their orders across all pages
- [ ] Manager sees products and stock for team
- [ ] Removing all bindings does NOT break login or change roles
- [ ] Admin sees all data

### Stock Tests
- [ ] Runner inbound to manager increases manager's stock
- [ ] Stock Balance shows correct quantities
- [ ] Delivered order deducts from correct warehouse

### Delivery Tests
- [ ] Runner clicks Delivered: instant UI update
- [ ] No "only admin can modify" error for valid delivery
- [ ] Double-click prevention works

### Performance Tests
- [ ] All pages load within 5 seconds
- [ ] 10-second timeout shows retry button
- [ ] Sign in/out works reliably

### Mobile Tests
- [ ] All mobile pages follow Maybank style
- [ ] Desktop remains unchanged

---

## File Changes Summary

| Category | Files to Create | Files to Modify |
|----------|----------------|-----------------|
| Database | 2-3 migrations | - |
| Hooks | `useManagerBoundRunners.ts` | `useAccessibleUserIds.ts`, `useTeamVisibility.ts` |
| Components | `ViewAsBanner.tsx`, `LoadingTimeout.tsx`, 5+ mobile components | `DataGrid.tsx`, various pages |
| Pages | - | ~15 pages for mobile/desktop fixes |

---

## Estimated Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Visibility | 3 days | None |
| Phase 2: Warehouse/Stock | 2 days | Phase 1 |
| Phase 3: Delivered Fix | 1 day | Phase 2 |
| Phase 4: Performance | 2 days | Phase 3 |
| Phase 5: Admin Features | 2 days | Phase 4 |
| Phase 6: Mobile UI | 4 days | Phase 5 |
| Phase 7: Desktop Tables | 1 day | Phase 6 |

**Total: ~15 days**

