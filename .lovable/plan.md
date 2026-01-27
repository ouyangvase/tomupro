
# Fix: Show All Delivered Orders

## Problem

The Dashboard shows "Delivered Today: 43" but the Delivered Orders page shows only "Total Delivered: 62" instead of all 280 delivered orders.

**Root Cause**: The `useOrders` hook has a `.limit(500)` and fetches orders sorted by `created_at DESC`. When the Delivered Orders page fetches all orders for a runner, only 65 of the 280 delivered orders fall within the most recent 500 orders.

## Data Analysis

| Metric | Database Truth | UI Display |
|--------|----------------|------------|
| Total Delivered (Yc) | 280 | 62 |
| Delivered Today | 36 | 43* |
| In Progress | 501 (TAKEN+ASSIGNED) | 504 |

*The dashboard may count slightly differently or cache is stale

## Solution

### Option A: Add runnerStatus Filter to Query (Recommended)

Modify `RunnerDeliveredOrders.tsx` to pass `runnerStatus: 'DELIVERED'` to the `useOrders` hook. This filters at the database level and returns all delivered orders.

**Changes to `src/pages/runner/RunnerDeliveredOrders.tsx`**:
```typescript
// Line 90-102 - Add runnerStatus to filter
const ordersFilter = useMemo(() => {
  const baseFilter: any = { runnerStatus: 'DELIVERED' };
  
  if (role === 'runner') {
    return { ...baseFilter, runnerId: user?.id };
  }
  if (role === 'salesperson') {
    return { ...baseFilter, salespersonId: user?.id };
  }
  if (role === 'manager' && salespersonIds && salespersonIds.length > 0) {
    return { ...baseFilter, salespersonIds };
  }
  return baseFilter; // admin - all delivered
}, [role, user?.id, salespersonIds]);
```

### Option B: Increase Limit for Delivered Orders

Modify `useOrders` hook to increase or remove the limit when specifically filtering for delivered orders.

**Changes to `src/hooks/useOrders.ts`**:
```typescript
// Line 29 - Increase limit for delivered filter
.limit(filters?.runnerStatus === 'DELIVERED' ? 10000 : 500);
```

## Recommended Approach: Combine Both

1. **RunnerDeliveredOrders.tsx**: Add `runnerStatus: 'DELIVERED'` to the filter
2. **useOrders.ts**: Increase limit when filtering for specific runnerStatus

This ensures:
- Database does the heavy filtering (returns only DELIVERED)
- More records are fetched when needed
- Performance remains good for other pages

## Implementation Files

| File | Change |
|------|--------|
| `src/pages/runner/RunnerDeliveredOrders.tsx` | Add `runnerStatus: 'DELIVERED'` to ordersFilter |
| `src/hooks/useOrders.ts` | Increase limit to 10000 when runnerStatus is specified |

## Expected Outcome

After fix:
- Dashboard: "Delivered Today: 36" (from today's deliveries)
- Delivered Orders page: "Total Delivered: 280" (all delivered orders)
- All historical delivered orders visible and exportable
