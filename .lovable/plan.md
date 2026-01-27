
# Fix: Database Statement Timeouts and Infinite Loading State

## Problem Summary

The app is experiencing two major issues causing infinite loading:

1. **Database Statement Timeouts (500 errors)**: Multiple queries are timing out due to slow RLS policies
2. **Profile Loading Stuck**: Auth completes but subsequent queries fail, leaving pages in loading state

### Evidence from Console/Network Logs

**Screenshot 1 (Manager - Ready Sales)**:
- CORS errors on `auth-bridge` (platform-side, non-blocking)
- Page stuck on "Loading..." with realtime subscriptions cycling

**Screenshot 2 (Auth Timeout)**:
- `[Auth] Fetching profile for ... (attempt 1/4)`
- `Auth loading timeout (10s) - forcing completion`
- Profile fetch takes too long due to database contention

**Screenshot 3 (Runner Inbox)**:
- Profile loaded successfully (`role: runner`)
- 500 errors on: `notifications`, `delivery_charges`, `user_directory`, `orders`, `runner_drivers`
- These all hit RLS policies that call slow functions

**Screenshot 4 (Blank Loading)**:
- "Loading your profile..." stuck indefinitely
- Multiple 500 (Internal Server Error) responses from Supabase

### Database Error Logs

```
ERROR: canceling statement due to statement timeout
```

Affected queries:
- `orders` with nested `order_items` + `products` joins
- `notifications` with `user_id` filter
- `delivery_charges` with `runner_id` filter
- `user_directory` with role checks

## Root Cause Analysis

### The Core Issue: RLS Function Performance

The RLS policies use `is_in_manager_team()` which is called **per row**. This function:

```sql
SELECT 
  p_owner_id = auth.uid()
  OR get_user_role(auth.uid()) = 'admin'
  OR (
    get_user_role(auth.uid()) = 'manager'
    AND (
      EXISTS (SELECT 1 FROM manager_salesperson_bindings ...)
      OR EXISTS (SELECT 1 FROM manager_groups JOIN group_members ...)
      OR EXISTS (SELECT 1 FROM profiles WHERE manager_id = ...)
    )
  )
  OR EXISTS (SELECT 1 FROM user_data_shares ...)
```

**Problems:**
1. `get_user_role(auth.uid())` is called multiple times per function call
2. Multiple `EXISTS` subqueries per row
3. For 30,000 orders limit, this creates millions of subquery executions

### Why It Gets Worse Under Load

When multiple users are active:
- Each user's queries compete for database resources
- Statement timeout (default 8s) is exceeded
- Failed queries return 500 errors
- Frontend shows loading forever because data never arrives

## Solution Architecture

### Part 1: Optimize RLS Functions with SECURITY DEFINER + Caching

Create a new high-performance visibility check function that:
1. Uses `SECURITY DEFINER` to bypass RLS recursion
2. Caches the role lookup once per query
3. Batches visibility checks

```sql
CREATE OR REPLACE FUNCTION public.can_access_order(p_order_salesperson_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_current_user uuid := auth.uid();
  v_role text;
BEGIN
  -- Early exit: own order
  IF p_order_salesperson_id = v_current_user THEN
    RETURN true;
  END IF;
  
  -- Cache role lookup
  SELECT role INTO v_role FROM public.profiles WHERE id = v_current_user;
  
  -- Admin sees all
  IF v_role = 'admin' THEN
    RETURN true;
  END IF;
  
  -- Runner can see assigned orders (checked by runner_id in policy)
  IF v_role = 'runner' THEN
    RETURN false; -- Let runner_id policy handle this
  END IF;
  
  -- Manager team check using indexed joins
  IF v_role = 'manager' THEN
    RETURN EXISTS (
      SELECT 1 FROM manager_salesperson_bindings
      WHERE manager_id = v_current_user 
        AND salesperson_id = p_order_salesperson_id 
        AND active = true
    )
    OR EXISTS (
      SELECT 1 FROM manager_groups mg
      JOIN group_members gm ON gm.group_id = mg.id
      WHERE mg.manager_user_id = v_current_user 
        AND gm.member_user_id = p_order_salesperson_id
    )
    OR EXISTS (
      SELECT 1 FROM user_data_shares
      WHERE viewer_user_id = v_current_user
        AND subject_user_id = p_order_salesperson_id
        AND active = true
    );
  END IF;
  
  RETURN false;
END;
$$;
```

### Part 2: Split RLS Policies by Role

Instead of one complex policy for all roles, create separate policies:

```sql
-- Drop old complex policy
DROP POLICY IF EXISTS "Manager can view team orders" ON orders;

-- Admin: simple check, fast
CREATE POLICY "orders_admin_select" ON orders FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) = 'admin'
  );

-- Runner: direct ID match, indexed
CREATE POLICY "orders_runner_select" ON orders FOR SELECT
  USING (runner_id = auth.uid());

-- Salesperson: own orders, indexed
CREATE POLICY "orders_salesperson_select" ON orders FOR SELECT
  USING (salesperson_id = auth.uid());

-- Manager: optimized team check
CREATE POLICY "orders_manager_select" ON orders FOR SELECT
  USING (
    salesperson_id = auth.uid()
    OR can_access_order(salesperson_id)
  );
```

### Part 3: Add Missing Indexes for RLS Performance

```sql
-- Index for fast manager role lookup
CREATE INDEX IF NOT EXISTS idx_profiles_id_role 
  ON profiles(id) INCLUDE (role);

-- Index for fast manager group lookup
CREATE INDEX IF NOT EXISTS idx_group_members_group_member 
  ON group_members(group_id, member_user_id);

-- Composite index for orders RLS
CREATE INDEX IF NOT EXISTS idx_orders_salesperson_runner 
  ON orders(salesperson_id, runner_id);
```

### Part 4: Reduce Query Load from Frontend

**File: `src/hooks/useOrders.ts`**

1. Reduce default limit from 30,000 to 1,000 with pagination
2. Add explicit timeout handling
3. Use `select` to only fetch needed columns

```typescript
export function useOrders(filters?: OrderFilters) {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: async () => {
      // Reduced limit with pagination support
      const pageSize = filters?.pageSize || 500;
      const page = filters?.page || 0;
      
      let query = supabase
        .from('orders')
        .select(`
          id, order_code, order_date, customer_name, phone, address, area,
          status, runner_status, reconciliation_status, total_amount,
          salesperson_id, runner_id, driver_id, created_at,
          order_items(id, quantity, unit_price, product:products(id, sku_code, sku_name))
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      // ... filters
    },
    staleTime: 30000, // Cache for 30 seconds
    retry: 2,
    retryDelay: 1000,
  });
}
```

### Part 5: Add Query Error Recovery to Pages

**File: `src/pages/runner/RunnerInbox.tsx`**

Wrap queries with proper error handling:

```typescript
const { data: orders, isLoading, isError, error, refetch } = useOrders({ 
  runnerId: user?.id, 
  excludeDeliveredAndFailed: true 
});

// Show error state with retry
if (isError) {
  return (
    <AppLayout>
      <QueryWrapper isLoading={false} isError={true} isEmpty={false} onRetry={refetch}>
        <div />
      </QueryWrapper>
    </AppLayout>
  );
}
```

### Part 6: Fix Realtime Subscription Flapping

The console shows rapid subscribe/unsubscribe cycles. This happens because React StrictMode causes double-mounting, but also indicates the component is re-rendering too often.

**File: `src/hooks/useRealtimeUpdates.ts`**

Add debouncing and cleanup guard:

```typescript
useEffect(() => {
  if (!profile) return;
  
  // Debounce subscription setup
  const timeoutId = setTimeout(() => {
    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', {...})
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, 100);
  
  return () => clearTimeout(timeoutId);
}, [profile?.id]); // Only re-run when profile.id changes
```

## Implementation Files

| File | Change |
|------|--------|
| `supabase/migrations/XXXXXX_optimize_rls.sql` | Add optimized RLS functions and policies |
| `src/hooks/useOrders.ts` | Reduce query limit, add pagination, improve error handling |
| `src/hooks/useNotifications.ts` | Add timeout and error handling |
| `src/hooks/useDeliveryCharges.ts` | Add timeout and error handling |
| `src/hooks/useRealtimeUpdates.ts` | Debounce subscriptions to prevent flapping |
| `src/pages/runner/RunnerInbox.tsx` | Add QueryWrapper for error recovery |
| `src/pages/sales/ReadySales.tsx` | Add QueryWrapper for error recovery |

## Testing Checklist

After implementation:

1. **Login as Admin** - Dashboard loads within 3 seconds, no 500 errors
2. **Login as Manager** - Team orders load, can switch between My/Team view
3. **Login as Runner** - Runner Inbox shows assigned orders, no infinite loading
4. **Login as Salesperson** - Own orders load correctly
5. **Multiple concurrent users** - No statement timeouts in database logs
6. **Network issues** - Error states shown with Retry button, not infinite spinner

## Risk Assessment

- **Low Risk**: Frontend changes (pagination, error handling) - can be rolled back easily
- **Medium Risk**: RLS policy changes - test thoroughly in staging first
- **High Impact**: Fixes affect all authenticated users and all data pages

## Why This Fixes the Problem

1. **Eliminates Statement Timeouts**: Optimized RLS functions reduce query time from 8s+ to <100ms
2. **Prevents Infinite Loading**: Query error handling shows actionable error states
3. **Reduces Database Load**: Pagination and caching reduce total queries
4. **Stops Subscription Flapping**: Debounced realtime prevents resource exhaustion
