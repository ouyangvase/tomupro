

# Plan: Add Pagination and Filter-Aware Summary for Delivered Orders

## Problem Summary

Two issues with the Delivered Orders page:

| Issue | Current Behavior | Expected Behavior |
|-------|-----------------|-------------------|
| **Performance (lag)** | Loads up to 2000 orders at once, causing UI lag | Load 30 orders per page, fetch on-demand |
| **Summary cards don't respect filters** | KPI cards show global totals even when filters are active | KPI cards should show totals for filtered data only |

## Solution Overview

### 1. Client-Side Pagination (30 per page)
- Paginate the already-fetched `deliveredOrders` array client-side
- Show only 30 orders at a time in the table/card list
- Provide Previous/Next buttons and page numbers
- Filters continue to work across the full dataset before pagination

### 2. Filter-Aware Summary Cards
- When filters are active (search, area, SKU, salesperson, etc.), calculate summaries from the filtered client-side data
- When no filters are active, use the server-side `useDeliveredSummary` hook for accurate global totals
- This ensures KPI cards always reflect what the user is looking at

## Implementation Details

### Changes Required

| File | Change |
|------|--------|
| `src/pages/runner/RunnerDeliveredOrders.tsx` | Add pagination state, filter detection, and conditional summary logic |

### Technical Implementation

**1. Add Pagination State**

```typescript
// Pagination constants and state
const PAGE_SIZE = 30;
const [currentPage, setCurrentPage] = useState(1);

// Reset to page 1 when filters change
useEffect(() => {
  setCurrentPage(1);
}, [searchQuery, areaFilter, driverFilter, salespersonFilter, skuFilter, claimStatusFilter]);
```

**2. Calculate Paginated Data**

```typescript
// Calculate pagination values
const totalPages = Math.ceil(deliveredOrders.length / PAGE_SIZE);
const startIndex = (currentPage - 1) * PAGE_SIZE;
const endIndex = startIndex + PAGE_SIZE;
const paginatedOrders = deliveredOrders.slice(startIndex, endIndex);
```

**3. Detect Active Filters**

```typescript
const hasActiveFilters = useMemo(() => {
  return (
    searchQuery.trim() !== '' ||
    areaFilter !== 'all' ||
    driverFilter !== 'all' ||
    salespersonFilter !== 'all' ||
    skuFilter !== 'all' ||
    claimStatusFilter !== 'all'
  );
}, [searchQuery, areaFilter, driverFilter, salespersonFilter, skuFilter, claimStatusFilter]);
```

**4. Calculate Filtered Summary (Client-Side)**

```typescript
const filteredSummary = useMemo(() => {
  if (!hasActiveFilters) return null;
  
  const total_delivered = deliveredOrders.length;
  const pending_claim = deliveredOrders.filter(o => o.reconciliation_status === 'NOT_CLAIMED').length;
  const total_amount = deliveredOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  
  return { total_delivered, pending_claim, total_amount };
}, [hasActiveFilters, deliveredOrders]);
```

**5. Use Appropriate Summary in KPI Cards**

```typescript
// Use filtered summary when filters active, otherwise use server summary
const displaySummary = hasActiveFilters ? filteredSummary : summary;
const displaySummaryLoading = hasActiveFilters ? false : summaryLoading;
```

**6. Add Pagination Controls UI**

```typescript
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';

// Render after the table
{totalPages > 1 && (
  <Card className="mt-4">
    <CardContent className="py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {startIndex + 1}-{Math.min(endIndex, deliveredOrders.length)} of {deliveredOrders.length} orders
        </p>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {/* Page numbers with ellipsis logic */}
            {getPageNumbers(currentPage, totalPages).map((page, i) => (
              page === '...' ? (
                <PaginationItem key={`ellipsis-${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={page}>
                  <PaginationLink
                    onClick={() => setCurrentPage(page as number)}
                    isActive={currentPage === page}
                    className="cursor-pointer"
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              )
            ))}
            <PaginationItem>
              <PaginationNext
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </CardContent>
  </Card>
)}
```

**7. Helper for Page Number Display**

```typescript
function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  
  if (current <= 3) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  
  if (current >= total - 2) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  
  return [1, '...', current - 1, current, current + 1, '...', total];
}
```

**8. Update Table/Card List to Use Paginated Data**

```typescript
// Mobile view - use paginatedOrders instead of deliveredOrders
{paginatedOrders.map((order) => { ... })}

// Desktop table - use paginatedOrders instead of deliveredOrders
{paginatedOrders.map((order) => { ... })}
```

**9. Update Select All Logic**

The "Select All" checkbox should still select from the full filtered dataset, not just the current page:

```typescript
// Select all claimable orders (across all pages of filtered data)
const toggleSelectAll = useCallback(() => {
  if (selectedIds.size === claimableOrders.length) {
    setSelectedIds(new Set());
  } else {
    setSelectedIds(new Set(claimableOrders.map(o => o.id)));
  }
}, [claimableOrders, selectedIds.size]);
```

**10. Update Export to Use Full Filtered Data**

Export handlers continue to use `deliveredOrders` (not paginated) so exports include all filtered records.

## Visual Changes

### Before (Single Long Page)
- All 1000+ orders rendered at once
- Summary cards always show global totals
- Page becomes laggy with large datasets

### After (Paginated with Filter-Aware Summary)
- Only 30 orders rendered at a time
- Pagination controls at bottom: "Showing 1-30 of 1056 orders" with Previous/Next
- When Area="KB" selected: Summary cards update to show "Total Delivered: 127" instead of "1056"
- Smooth, responsive UI

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| No filters active | Use server-side summary for accurate global totals |
| Filters active | Calculate summary from filtered client data |
| Filter changes | Reset to page 1 automatically |
| Page beyond range | Clamp to valid page number |
| Empty results | Show "No delivered orders found" message |
| Export while paginated | Exports all filtered orders, not just current page |
| Select All | Selects all claimable orders across all pages |

## Summary

| Feature | Implementation |
|---------|---------------|
| **Pagination** | Client-side, 30 per page, with Previous/Next/Page numbers |
| **Filter-aware summaries** | Conditional: server-side when no filters, client-side when filters active |
| **Performance** | Only 30 DOM rows rendered at once, reducing lag |
| **Data integrity** | Full filtered dataset preserved for export and bulk actions |

