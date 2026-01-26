
# Fix Runner Inbox to Show All Assigned Orders

## Problem Summary

| Metric | Expected | Actual | Gap |
|--------|----------|--------|-----|
| Runner Inbox orders | 530 | 200 | Missing 330 orders |
| Display | All assigned orders | Limited subset | 62% of data hidden |

The Runner Inbox currently has a hard limit of `200` orders in the `useOrders` hook call, which was added to prevent database timeouts. However, this causes over 60% of assigned orders to be hidden from the runner.

## Root Cause

In `src/pages/runner/RunnerInbox.tsx` (lines 68-72):
```typescript
const { data: orders, isLoading } = useOrders({ 
  runnerId: user?.id,
  excludeDeliveredAndFailed: true,
  limit: 200  // <-- This limits to only 200 orders
});
```

The limit was added for performance reasons, but it's too restrictive for runners with 500+ active orders.

---

## Solution: Remove Limit + Add Pagination

### Step 1: Increase or Remove the Limit

**File: `src/pages/runner/RunnerInbox.tsx`**

Change the limit from 200 to 1000 (or remove it to use the default 500):

```typescript
const { data: orders, isLoading } = useOrders({ 
  runnerId: user?.id,
  excludeDeliveredAndFailed: true,
  limit: 1000  // Increase to accommodate all active orders
});
```

Since the `excludeDeliveredAndFailed` filter is already reducing the dataset significantly (530 vs 699 total), and database indexes were added in the previous fix, a higher limit is now safe.

### Step 2: Add Pagination (Optional but Recommended)

For large datasets, add pagination using `useResponsivePagination`:

```typescript
import { useResponsivePagination } from '@/hooks/useResponsivePagination';

// After filteredOrders is calculated:
const {
  currentPage,
  setCurrentPage,
  totalPages,
  paginatedData,
  pageSize,
} = useResponsivePagination({
  totalItems: filteredOrders.length,
  headerHeight: 350,
  footerHeight: 80,
});

const paginatedOrders = paginatedData(filteredOrders);
```

### Step 3: Update DataGrid to Use Paginated Data

Pass `paginatedOrders` to the DataGrid instead of `filteredOrders`:

```typescript
<DataGrid
  data={paginatedOrders}  // Changed from filteredOrders
  columns={columns}
  ...
/>
```

### Step 4: Add Pagination Controls

Add pagination UI after the DataGrid:

```typescript
{filteredOrders.length > 0 && totalPages > 1 && (
  <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
    <div className="text-sm text-muted-foreground">
      Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filteredOrders.length)} of {filteredOrders.length} orders
    </div>
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setCurrentPage(currentPage - 1)}
        disabled={currentPage === 1}
      >
        Previous
      </Button>
      <span className="text-sm">
        Page {currentPage} of {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setCurrentPage(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        Next
      </Button>
    </div>
  </div>
)}
```

---

## Summary of Changes

| File | Change | Purpose |
|------|--------|---------|
| `src/pages/runner/RunnerInbox.tsx` | Change `limit: 200` to `limit: 1000` | Fetch all active orders |
| `src/pages/runner/RunnerInbox.tsx` | Add `useResponsivePagination` hook | Handle large data display |
| `src/pages/runner/RunnerInbox.tsx` | Add pagination controls UI | Navigate through pages |

---

## Expected Results

| Metric | Before | After |
|--------|--------|-------|
| Select All count | 200 | 530 (all active orders) |
| Data visibility | 38% | 100% |
| Page load time | Fast (small data) | Fast (optimized with pagination) |
| User experience | Missing orders | All orders visible with pagination |

---

## Technical Notes

The database optimizations from the previous fix (indexes on `order_items.product_id` and `orders.runner_id + created_at`, plus the optimized RLS policy) make it safe to increase the limit. The `excludeDeliveredAndFailed` server-side filter also reduces the query workload significantly.
