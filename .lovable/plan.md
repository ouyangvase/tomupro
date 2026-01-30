
# Plan: Fix Delivered Orders Stats and Loading Issues

## Problem Summary

The "Delivered Orders" page displays incorrect statistics because it calculates them from a limited query result instead of using the existing optimized RPC function.

| Metric | Displayed | Actual (Database) | Issue |
|--------|-----------|-------------------|-------|
| Total Delivered | 1000 | 1056 | Truncated by query limit |
| Pending Claim | 258 | 258 | Coincidentally correct |
| Total Value | BND 62,780.00 | BND 66,067.00 | Sum of truncated dataset |

## Root Cause Analysis

1. **Stats calculated from limited query**: The page computes stats from `deliveredOrders.length` and `deliveredOrders.reduce()` which only contains ~1000 orders (Supabase default limit)

2. **Existing optimized hook not used**: The `useDeliveredSummary` hook exists in `src/hooks/useDeliveredOrders.ts` and calls the `get_delivered_summary` RPC function which returns accurate counts without limits - but the page doesn't use it

3. **Query limit mismatch**: The `useOrders` hook sets `limit: 2000` but Supabase's default `max-rows` setting may cap it at 1000

## Solution

Modify `RunnerDeliveredOrders.tsx` to:
1. Import and use `useDeliveredSummary` for accurate stats
2. Display loading states for stats separately from the order list
3. Keep using `useOrders` for the paginated order list display

### Changes Required

| File | Change |
|------|--------|
| `src/pages/runner/RunnerDeliveredOrders.tsx` | Import `useDeliveredSummary`, use for KPI cards, add loading states |

### Implementation Details

**1. Import the summary hook**

```typescript
import { useDeliveredSummary } from '@/hooks/useDeliveredOrders';
```

**2. Call the summary hook with appropriate filters**

```typescript
// Create params for summary based on role
const summaryParams = useMemo(() => {
  if (role === 'runner') {
    return { runnerId: user?.id };
  }
  if (role === 'salesperson') {
    return { salespersonId: user?.id };
  }
  if (role === 'manager' && salespersonIds?.length > 0) {
    return { salespersonIds };
  }
  return {}; // admin - get all
}, [role, user?.id, salespersonIds]);

const { data: summary, isLoading: summaryLoading } = useDeliveredSummary(summaryParams);
```

**3. Update the stats cards to use summary data**

```typescript
// Before (wrong - calculated from limited query)
<div className="text-2xl font-bold text-green-600">{deliveredOrders.length}</div>

// After (correct - from database RPC)
{summaryLoading ? (
  <Skeleton className="h-8 w-16" />
) : (
  <div className="text-2xl font-bold text-green-600">{summary?.total_delivered ?? 0}</div>
)}
```

**4. Apply same pattern to Pending Claim and Total Value**

```typescript
// Pending Claim
<div className="text-2xl font-bold">
  {summaryLoading ? <Skeleton className="h-8 w-16" /> : summary?.pending_claim ?? 0}
</div>

// Total Value
<div className="text-2xl font-bold">
  {summaryLoading ? <Skeleton className="h-8 w-24" /> : formatBND(summary?.total_amount ?? 0)}
</div>
```

## Expected Results After Fix

| Metric | Before | After |
|--------|--------|-------|
| Total Delivered | 1000 | 1056 |
| Pending Claim | 258 | 258 |
| Total Value | BND 62,780.00 | BND 66,067.00 |

## Loading State Improvements

- Stats cards show skeleton loaders while `useDeliveredSummary` loads
- Order list shows its own loading state via `isLoading` from `useOrders`
- Both queries run in parallel for faster perceived load time
- No infinite loading since both queries have proper completion states

## Technical Notes

- The `get_delivered_summary` RPC is a SECURITY DEFINER function that bypasses RLS for performance
- It correctly filters by runner_id, salesperson_id, or salesperson_ids array
- The existing `useOrders` continues to power the order list (limited to 2000 for performance)
- Stats are independent of the order list query, providing accurate totals even when paginated
