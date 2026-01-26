
# Fix Delivered Orders Page - Show All Data with Pagination

## Problem Summary

The Delivered Orders page shows only 101 orders while the dashboard correctly shows 207 delivered orders. This happens because:

1. **Server-side limit**: The `useOrders` hook fetches only 500 most recent orders (by `created_at`), then filters for delivered orders on the client side
2. **Client-side filtering**: Many of those 500 orders aren't delivered, leaving only 101 out of 207 actual delivered orders
3. **No pagination**: All orders are rendered at once without page navigation

---

## Solution

### 1. Add Server-Side Filter for Delivered Orders

**File:** `src/pages/runner/RunnerDeliveredOrders.tsx`

Change the orders query to include `runnerStatus: 'DELIVERED'` in the filter, so the database returns only delivered orders (not all orders filtered client-side).

**Current (around line 90-104):**
```typescript
const ordersFilter = useMemo(() => {
  if (role === 'runner') {
    return { runnerId: user?.id };
  }
  // ...
}, [role, user?.id, salespersonIds]);

const { data: orders, isLoading } = useOrders(ordersFilter as any);
```

**Change to:**
```typescript
const ordersFilter = useMemo(() => {
  const baseFilter = { runnerStatus: 'DELIVERED' as const };
  
  if (role === 'runner') {
    return { ...baseFilter, runnerId: user?.id };
  }
  if (role === 'salesperson') {
    return { ...baseFilter, salespersonId: user?.id };
  }
  if (role === 'manager' && salespersonIds && salespersonIds.length > 0) {
    return { ...baseFilter, salespersonIds };
  }
  return baseFilter; // admin - all delivered orders
}, [role, user?.id, salespersonIds]);
```

This ensures the database only returns delivered orders, making the 500 limit apply to delivered orders only.

---

### 2. Remove Client-Side "DELIVERED" Filter

Since we're now filtering server-side, update `deliveredOrders` memo to skip redundant filtering:

**Current (around line 141-146):**
```typescript
const deliveredOrders = useMemo(() => {
  if (!orders) return [];
  
  let filtered = orders.filter(order => 
    order.runner_status === 'DELIVERED' && order.status !== 'CANCELLED'
  );
  // ... other filters
```

**Change to:**
```typescript
const deliveredOrders = useMemo(() => {
  if (!orders) return [];
  
  // Server-side already filters for DELIVERED, just exclude cancelled
  let filtered = orders.filter(order => order.status !== 'CANCELLED');
  // ... rest of filters remain the same
```

---

### 3. Add Pagination

Import and use the existing `useResponsivePagination` hook:

**Add import (around line 1):**
```typescript
import { useResponsivePagination } from '@/hooks/useResponsivePagination';
```

**Add pagination hook after filters state (around line 123):**
```typescript
// Pagination
const {
  currentPage,
  setCurrentPage,
  totalPages,
  paginatedData,
} = useResponsivePagination({
  totalItems: deliveredOrders.length,
  headerHeight: 380, // Account for header + stats + filters
  footerHeight: 80,
});

// Paginated orders for display
const paginatedOrders = paginatedData(deliveredOrders);
```

---

### 4. Update Table/Card Rendering to Use Paginated Data

**Desktop table (around line 782):**
```typescript
// Change: deliveredOrders.map(...)
// To: paginatedOrders.map(...)
```

**Mobile cards (around line 639):**
```typescript
// Change: deliveredOrders.map(...)
// To: paginatedOrders.map(...)
```

---

### 5. Add Pagination Controls UI

Add pagination controls after the table/cards section (around line 921):

```typescript
{/* Pagination Controls */}
{deliveredOrders.length > 0 && totalPages > 1 && (
  <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
    <div className="text-sm text-muted-foreground">
      Showing {((currentPage - 1) * paginatedOrders.length) + 1} - {Math.min(currentPage * paginatedOrders.length, deliveredOrders.length)} of {deliveredOrders.length} orders
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

### 6. Update Export "Select All" Behavior

Update `toggleExportSelectAll` to only select visible/paginated orders or clarify it selects all filtered:

**Add info text to Export dropdown (around line 451):**
```typescript
<DropdownMenuItem onClick={handleExportAll}>
  Export All Filtered ({deliveredOrders.length})
</DropdownMenuItem>
```

---

## Summary of Changes

| File | Change | Purpose |
|------|--------|---------|
| `src/pages/runner/RunnerDeliveredOrders.tsx` | Add `runnerStatus: 'DELIVERED'` to filter | Server-side filtering |
| `src/pages/runner/RunnerDeliveredOrders.tsx` | Import and use `useResponsivePagination` | Enable pagination |
| `src/pages/runner/RunnerDeliveredOrders.tsx` | Add pagination controls UI | User can navigate pages |
| `src/pages/runner/RunnerDeliveredOrders.tsx` | Use `paginatedOrders` in map | Display current page only |

---

## Expected Result

| Metric | Before | After |
|--------|--------|-------|
| Total Delivered shown | 101 | 207 (matches dashboard) |
| Pagination | None | Yes, with Previous/Next |
| Query efficiency | Fetches 500 orders, filters client | Fetches only delivered orders |
| Filter: All | Works | Works |
| Stats accuracy | Accurate after filtering | Accurate |
