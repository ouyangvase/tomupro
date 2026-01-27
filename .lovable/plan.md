

# Fix Runner Inbox to Show All Active Orders

## Problem

The Runner Inbox shows only 383 orders but the database has 451 active orders (ASSIGNED + TAKEN):
- TAKEN: 419 orders
- ASSIGNED: 32 orders
- **Total: 451** (but UI shows 383)

**Root Cause**: The `useOrders` hook fetches only 500 most recent orders across ALL statuses. Since this runner has 793 total orders, older active orders are cut off by the limit. Client-side filtering then shows only the ASSIGNED/TAKEN orders that happen to be in the most recent 500.

## Solution

Apply the same fix used for Delivered Orders: add server-side filtering to fetch specifically active orders (ASSIGNED + TAKEN) with an increased limit.

---

## Implementation

### 1. Update `useOrders.ts` - Add "excludeDeliveredAndFailed" filter

Add a new filter option that fetches only active orders server-side:

```typescript
interface OrderFilters {
  status?: OrderStatus;
  salespersonId?: string;
  runnerId?: string;
  runnerStatus?: RunnerStatus;
  reconciliationStatus?: ReconciliationStatus;
  excludeDeliveredAndFailed?: boolean; // NEW
}
```

When this filter is true, exclude DELIVERED and FAILED_DELIVERY at the database level and increase the limit.

### 2. Update `RunnerInbox.tsx` - Use the new filter

Change the orders hook call to:
```typescript
const { data: orders, isLoading } = useOrders({ 
  runnerId: user?.id,
  excludeDeliveredAndFailed: true  // Server-side filter for active orders only
});
```

This ensures:
1. Only ASSIGNED, TAKEN, UNASSIGNED orders are fetched (not DELIVERED/FAILED_DELIVERY)
2. Limit is increased to 10,000 to accommodate high-volume runners
3. All 451 active orders will be shown instead of 383

---

## Technical Details

### Changes to `src/hooks/useOrders.ts`

```typescript
// Line 6-12: Add new filter option
interface OrderFilters {
  status?: OrderStatus;
  salespersonId?: string;
  runnerId?: string;
  runnerStatus?: RunnerStatus;
  reconciliationStatus?: ReconciliationStatus;
  excludeDeliveredAndFailed?: boolean; // For Runner Inbox
}

// Line 19-20: Increase limit for active orders filter
const queryLimit = (filters?.runnerStatus || filters?.excludeDeliveredAndFailed) ? 10000 : 500;

// After line 55: Add the exclusion filter
if (filters?.excludeDeliveredAndFailed) {
  query = query.neq('runner_status', 'DELIVERED');
  query = query.neq('runner_status', 'FAILED_DELIVERY');
}
```

### Changes to `src/pages/runner/RunnerInbox.tsx`

```typescript
// Line 67: Add server-side filter
const { data: orders, isLoading } = useOrders({ 
  runnerId: user?.id,
  excludeDeliveredAndFailed: true
});
```

The client-side `filteredOrders` logic can remain as a safety net, but the server-side filter does the heavy lifting.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useOrders.ts` | Add `excludeDeliveredAndFailed` filter option with server-side query |
| `src/pages/runner/RunnerInbox.tsx` | Use new filter to fetch all active orders |

---

## Expected Outcome

After implementation:
- Runner Inbox shows "Select All (451)" instead of "Select All (383)"
- All ASSIGNED and TAKEN orders are visible
- Pagination works correctly for high-volume runners
- No more missing orders due to limit truncation

