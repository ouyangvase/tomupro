

# Plan: Fix Missing Orders in Runner Delivered Orders Page

## Problem Identified
XiaoLi has **47 delivered orders** in the database, but only **9 orders** are showing in the Runner Delivered Orders page when filtering by XiaoLi. The "Total Delivered: 9" count and "Total Value: BND 522.00" exactly matches the sum of the first 9 most recent orders.

## Root Cause Analysis

The runner Yc has **1,056 delivered orders** in total. The current query fetches:
- All orders with `runner_id = Yc` AND `runner_status = 'DELIVERED'`
- With nested `order_items(*, product(id, sku_code, sku_name))`
- Limited to 2,000 rows

**The Problem**: With 1,056 orders and nested order items with product details, the API response becomes extremely large (potentially 6-10MB+ of JSON). The Supabase response is being truncated due to size limits, resulting in only partial data being returned to the frontend.

XiaoLi's orders are at positions 613-1056 in the result set (sorted by `created_at DESC`). After truncation, only the first ~612 rows are returned, and when filtered by XiaoLi's salesperson_id on the frontend, only 9 orders (the most recent ones before truncation) remain visible.

## Solution

Increase the query efficiency and reduce payload size to ensure all orders are returned.

### Option A: Remove Nested Order Items from Main Query (Recommended)

Fetch orders without the heavy nested relationships, then lazy-load order items only when needed (e.g., when expanding a row).

### Option B: Increase Query Limit and Reduce Payload

Keep the existing structure but:
1. Reduce nested data (only fetch essential product fields)
2. Consider pagination for very large datasets

### Option C: Use Server-Side Filtering

Pass the salesperson filter to the server instead of filtering client-side. This reduces the result set before it hits size limits.

## Recommended Implementation

Implement **server-side salesperson filtering** for the delivered orders query. When a user selects a salesperson filter, pass that ID to the query instead of fetching all orders and filtering client-side.

### Changes Required

| File | Change |
|------|--------|
| `src/hooks/useOrders.ts` | Add `salespersonIds` (array) parameter support for filtering |
| `src/pages/runner/RunnerDeliveredOrders.tsx` | Pass salesperson filter to the query instead of client-side filtering |

### Implementation Details

**1. Update `useOrders` to support salesperson array filter:**

```typescript
interface OrderFilters {
  // ... existing fields
  salespersonIds?: string[];  // NEW: Support filtering by multiple salesperson IDs
}

// In queryFn:
if (filters?.salespersonIds && filters.salespersonIds.length > 0) {
  query = query.in('salesperson_id', filters.salespersonIds);
}
```

**2. Update RunnerDeliveredOrders to pass filter to query:**

Currently, the salesperson filter is applied client-side after fetching all orders. Change it to pass the filter to the query:

```typescript
const ordersFilter = useMemo(() => {
  const baseFilter = { runnerStatus: 'DELIVERED' as const };
  
  if (role === 'runner') {
    const filter = { ...baseFilter, runnerId: user?.id };
    // Apply salesperson filter server-side if selected
    if (salespersonFilter !== 'all') {
      return { ...filter, salespersonIds: [salespersonFilter] };
    }
    return filter;
  }
  // ... rest of logic
}, [role, user?.id, salespersonFilter]);
```

**3. Remove client-side salesperson filter:**

In the `deliveredOrders` memo, remove the salesperson filtering since it's now done server-side.

## Expected Outcome

| Current Behavior | After Fix |
|------------------|-----------|
| Query fetches all 1,056 orders | Query fetches only orders for selected salesperson |
| Response truncated due to size | Smaller response that fits within limits |
| Only 9/47 orders visible | All 47 orders visible |
| Client-side filtering causes data loss | Server-side filtering ensures complete data |

## Technical Notes

- The fix moves filtering from client-side (unreliable when data is truncated) to server-side (reliable)
- This also improves performance by reducing data transfer
- The change is backward-compatible - when "All Users" is selected, no salesperson filter is applied

