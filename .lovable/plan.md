
# Plan: Add Import Timestamp and Delivered Timestamp Features

## Overview
This plan addresses two related requirements:
1. **Import Timestamp**: Track when orders are first imported and display this in the DATE column
2. **Delivered Timestamp**: Track when orders are marked as delivered and add a dedicated column for this

## Current State Analysis

### Database Schema
- `order_date` - date when order was placed (from CSV import)
- `created_at` - auto-generated timestamp when row is inserted (this IS the import time!)
- `delivered_at` - timestamp when marked delivered (already exists)
- `driver_delivered_at` - timestamp when driver marks delivered (already exists)

**Key Finding**: The `created_at` field already serves as the "imported_at" timestamp. We don't need a new field - we just need to use `created_at` instead of `order_date` in the display.

### Current Import Behavior
- Orders are imported via `ImportOrdersDialog.tsx`
- `created_at` is auto-set by database default `now()`
- Duplicate `order_code` causes an error (unique constraint) - not an upsert

### Delivered Marking Flow
- `process-delivery` edge function sets `delivered_at = now()` automatically
- `useRunnerReviewOrder` hook also sets `delivered_at = now()` when confirming delivery
- Users cannot currently choose a custom delivery time

---

## Implementation Plan

### Phase 1: Database Migration (Optional - for clarity)

**Option A**: Use existing `created_at` as import timestamp (recommended - no migration needed)

**Option B**: Add explicit `imported_at` column (if user insists on separate field):
```sql
ALTER TABLE orders ADD COLUMN imported_at timestamptz DEFAULT now();
-- Backfill from created_at
UPDATE orders SET imported_at = created_at WHERE imported_at IS NULL;
```

**Recommendation**: Use `created_at` - it already captures the import time.

### Phase 2: UI Changes - Date Column Display

| File | Change |
|------|--------|
| `src/pages/sales/ReadySales.tsx` | Change DATE column to display `created_at` formatted as "MMM DD HH:mm", default sort by `created_at` DESC |
| `src/pages/sales/BookingSales.tsx` | Same change |
| `src/pages/sales/CancelledSales.tsx` | Same change |
| `src/pages/runner/RunnerDeliveredOrders.tsx` | Keep using `created_at` for DATE, add separate "Delivered" column showing `delivered_at` |
| `src/pages/runner/RunnerInbox.tsx` | Same pattern |
| `src/components/mobile/MobileOrderCard.tsx` | Update date display to use `created_at` |

**Display Format Examples**:
- Import date: "Jan 29, 14:32" (MMM DD, HH:mm)
- Delivered timestamp: "Jan 29, 15:45" or full ISO for export

### Phase 3: Delivered Orders - Add Delivered Timestamp Column

**Desktop Table**:
```typescript
{
  key: 'delivered_at',
  header: 'Delivered',
  sortable: true,
  render: (o) => o.delivered_at 
    ? format(new Date(o.delivered_at), 'MMM dd, HH:mm')
    : '-'
}
```

**Mobile Card**: Add delivered timestamp below the status badge.

### Phase 4: Export Updates

| File | Change |
|------|--------|
| `src/lib/csv.ts` | Add `imported_at` column (using `created_at`), ensure `delivered_at` is included |

**Updated Export Columns for Delivered Orders**:
```typescript
{
  imported_timestamp: order.created_at, // When order was imported
  delivered_timestamp: order.delivered_at, // When marked delivered
}
```

### Phase 5: Delivered Time Selection (Optional Enhancement)

If the user wants to allow selecting a custom delivered time when marking delivered:

| File | Change |
|------|--------|
| `src/components/runner/RunnerReviewModal.tsx` | Add date-time picker when selecting "Confirm Delivered" |
| `supabase/functions/process-delivery/index.ts` | Accept optional `deliveredAt` parameter |

**Modal Update**:
```typescript
// When outcome === 'CONFIRM_DELIVERED', show time picker
<div className="space-y-2">
  <Label>Delivered Time</Label>
  <Input 
    type="datetime-local" 
    value={deliveredTime} 
    onChange={(e) => setDeliveredTime(e.target.value)}
    defaultValue={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
  />
</div>
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/sales/ReadySales.tsx` | Update DATE column to use `created_at` with time, adjust sort |
| `src/pages/sales/BookingSales.tsx` | Same pattern |
| `src/pages/sales/CancelledSales.tsx` | Same pattern |
| `src/pages/runner/RunnerDeliveredOrders.tsx` | Use `created_at` for DATE, add Delivered column |
| `src/components/mobile/MobileOrderCard.tsx` | Update date display |
| `src/lib/csv.ts` | Add `imported_timestamp` and `delivered_timestamp` columns |
| `src/hooks/useOrders.ts` | Ensure `created_at` is included in query (already is) |

---

## Technical Details

### Date Column Rendering (Before/After)

**Before (ReadySales.tsx line 207-213)**:
```typescript
{ 
  key: 'order_date', 
  header: 'Date', 
  sortable: true, 
  width: '100px',
  render: (o) => format(new Date(o.order_date), 'MMM dd') 
}
```

**After**:
```typescript
{ 
  key: 'created_at', 
  header: 'Imported', 
  sortable: true, 
  width: '120px',
  render: (o) => format(new Date(o.created_at), 'MMM dd, HH:mm') 
}
```

### Export Updates (csv.ts)

**Add to OrderLineExport interface**:
```typescript
imported_timestamp: string;  // order.created_at
delivered_timestamp: string; // order.delivered_at
```

**Update export columns**:
```typescript
{ key: 'imported_timestamp', header: 'imported_timestamp' },
{ key: 'delivered_timestamp', header: 'delivered_timestamp' },
```

---

## Summary of Changes

1. **No database migration needed** - `created_at` already tracks import time
2. **UI updates** - Change "Date" column from `order_date` to `created_at` with time
3. **New column** - Add "Delivered" column to Delivered Orders page
4. **Export enhancement** - Include both import and delivery timestamps
5. **Optional** - Allow users to select custom delivery time when marking delivered

## Expected Outcome

| Page | DATE Column Shows | Additional Column |
|------|-------------------|-------------------|
| Booking Sales | Import time (created_at) | - |
| Ready Sales | Import time (created_at) | - |
| Cancelled Sales | Import time (created_at) | - |
| Delivered Orders | Import time (created_at) | Delivered timestamp |
| Exports | imported_timestamp + delivered_timestamp columns | - |
