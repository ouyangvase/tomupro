
# Comprehensive Fix: Data Visibility and Query Limits

## Problem Summary

The user reports three main issues:

1. **User login shows wrong role and orders data missing** - This is likely related to query limits truncating data before visibility filtering is applied
2. **Delivered orders must tally with stock balance** - Stock balance visibility needs to match order visibility  
3. **All orders/sales pages must show data according to role visibility** - Multiple pages have hardcoded `.limit(500)` which truncates data for high-volume users

## Root Cause Analysis

### Issue 1: Query Limit Truncation
All the main data-fetching hooks have low query limits:

| File | Current Limit | Issue |
|------|---------------|-------|
| `useOrders.ts` | Conditional 500/10000 | Still truncates for very high-volume users |
| `useTeamOrders.ts` | 500 | Severely limits team data visibility |
| `useTeamOrdersServer.ts` | 500 (default param) | Limits server-side fetching |

When a query returns 500 records ordered by `created_at DESC`, older records in specific statuses (READY, BOOKING, etc.) may be cut off before client-side filtering occurs.

### Issue 2: Visibility Enforcement
The `get_visible_owner_ids()` RPC function was recently updated to include `user_data_shares`, but the frontend hooks need to consistently use this function and apply proper limits.

### Issue 3: Dashboard Stats Sync
Dashboard stats use direct queries that should match the same visibility rules used by the list pages.

---

## Solution

### Part 1: Increase Query Limits to 1,000,000

Update all order-fetching hooks to use a consistent high limit to prevent data truncation.

**Files to modify:**

#### 1. `src/hooks/useOrders.ts`
- Line 21: Change from conditional `10000/500` to constant `1000000`

```typescript
// Current
const queryLimit = (filters?.runnerStatus || filters?.excludeDeliveredAndFailed) ? 10000 : 500;

// Change to
const queryLimit = 1000000;
```

#### 2. `src/hooks/useTeamOrders.ts`
- Line 49: Change from `.limit(500)` to `.limit(1000000)`

```typescript
// Current
.limit(500);

// Change to
.limit(1000000);
```

#### 3. `src/hooks/useTeamOrdersServer.ts`
- Line 59: Change default limit from `500` to `1000000`
- Line 118: Change default limit from `500` to `1000000`

```typescript
// Line 59 - Current
const { status, runnerStatus, reconciliationStatus, limit = 500, offset = 0 } = params;

// Change to
const { status, runnerStatus, reconciliationStatus, limit = 1000000, offset = 0 } = params;

// Line 118 - Current
const { limit = 500, offset = 0 } = params;

// Change to
const { limit = 1000000, offset = 0 } = params;
```

---

### Part 2: Ensure Consistent Visibility Across All Pages

Each page needs to properly use the visibility-aware hooks. Here's the current state and fixes needed:

| Page | Current Hook | Visibility Correct? |
|------|--------------|---------------------|
| Ready Sales | `useTeamOrders` | ✅ Yes (with limit fix) |
| Booking Sales | `useTeamOrders` | ✅ Yes (with limit fix) |
| Cancelled Sales | `useTeamOrders` | ✅ Yes (with limit fix) |
| Action Required | `useOrders` (no visibility) | ❌ Needs fix |
| Delivered Orders | `useOrders` | ✅ Uses explicit filters |
| Products | `useProducts` + `useVisibleUserIds` | ✅ Yes |
| Stock Balance | `useFilteredStockBalance` | ✅ Yes |

#### Fix: `src/pages/sales/SalespersonActionInbox.tsx`
The Action Required page uses `useOrders()` without visibility filtering, then does client-side filtering. This needs to use server-side visibility.

- Line 97: Change from `useOrders()` to use visibility-aware filtering
- Add `get_visible_owner_ids()` call and filter by visible salesperson IDs

```typescript
// Line 97 - Current
const { data: allOrders = [], isLoading, refetch } = useOrders();

// Change to fetch with proper visibility
const { data: visibleIds } = useServerVisibleIds('orders');
const { data: allOrders = [], isLoading, refetch } = useOrders();

// Then in actionRequiredOrders memo (line 118+):
// Add visibility check at the start
let filtered = allOrders.filter(order => {
  // Only include orders from visible salespersons
  if (visibleIds !== null && Array.isArray(visibleIds) && !visibleIds.includes(order.salesperson_id)) {
    return false;
  }
  return needsSalespersonAction(order);
});
```

---

### Part 3: Data Consistency Checks

#### Dashboard Stats Hooks
The dashboard stats hooks in `useDashboardStats.ts` already use `get_visible_owner_ids()` for manager stats (line 112). No changes needed there - the fix to the RPC function we made earlier will propagate automatically.

#### Stock Balance
The `useFilteredStockBalance` hook already respects visibility through the `stock_balance_view` and RLS policies. No changes needed.

---

## Summary of File Changes

| File | Line(s) | Change |
|------|---------|--------|
| `src/hooks/useOrders.ts` | 21 | Change limit to `1000000` |
| `src/hooks/useTeamOrders.ts` | 49 | Change `.limit(500)` to `.limit(1000000)` |
| `src/hooks/useTeamOrdersServer.ts` | 59, 118 | Change default limit to `1000000` |
| `src/pages/sales/SalespersonActionInbox.tsx` | 97, 118+ | Add visibility filtering using `useServerVisibleIds` |

---

## Expected Outcome

After implementation:

1. **All roles see complete data** - No more truncation due to query limits
2. **Visibility rules enforced** - Data is filtered based on role:
   - **Admin**: Sees all data
   - **Manager**: Sees own + bound team members + shared subjects
   - **Salesperson**: Sees own data + shared subjects
   - **Runner**: Sees orders assigned to them
3. **Dashboard stats sync** - Stats will match the actual visible data in list pages
4. **Stock balance alignment** - Uses same visibility rules as orders

---

## Performance Considerations

Increasing limits to 1,000,000 records may seem aggressive, but:

1. **RLS filters first** - Supabase RLS policies filter data before it reaches the client
2. **Server-side visibility** - The `get_visible_owner_ids()` RPC limits the scope of queries
3. **Indexed queries** - The `salesperson_id` and `status` columns are indexed
4. **Pagination available** - For truly large datasets, pagination can be added later

The current database has ~950 total orders, so performance impact will be minimal. The limit is set high to future-proof the application.
