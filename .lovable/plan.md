
# Fix CSV Import Duplicate Order Error

## Problem Analysis
The import is failing because the CSV contains `order_ref` values (PO739, PO766, PO769, etc.) that already exist in the database. The current implementation attempts to insert all orders without checking for duplicates first, causing database constraint violations.

## Solution
Implement a **pre-flight duplicate check** that queries for existing order codes before attempting inserts, then **skips duplicates** and continues with new orders.

## Implementation

### File: `src/components/orders/ImportOrdersDialog.tsx`

**1. Add Pre-flight Duplicate Check Function** (new helper function around line 244)
```typescript
/**
 * Checks which order_refs already exist in the database
 * Uses exact match comparison (no normalization)
 */
const checkExistingOrders = async (orderRefs: string[]): Promise<Set<string>> => {
  const { data, error } = await supabase
    .from('orders')
    .select('order_code')
    .in('order_code', orderRefs);
  
  if (error) {
    console.error('[checkExistingOrders] Error:', error);
    return new Set();
  }
  
  return new Set(data?.map(o => o.order_code) || []);
};
```

**2. Modify `handleImport` Function** (around lines 253-436)

Before processing orders, add duplicate detection:
```typescript
// Extract all unique order_refs from validated rows
const allOrderRefs = [...new Set(validation.valid.map(row => row.order_ref.trim()))];

// Check for existing orders in database (exact match)
const existingOrderCodes = await checkExistingOrders(allOrderRefs);
const skippedDuplicates: string[] = [];

// Filter out duplicates
const newOrderRefs = allOrderRefs.filter(ref => {
  if (existingOrderCodes.has(ref)) {
    skippedDuplicates.push(ref);
    return false;
  }
  return true;
});

// If all orders are duplicates, show message and exit
if (newOrderRefs.length === 0) {
  setErrors([
    `All ${skippedDuplicates.length} order(s) already exist in the system.`,
    '',
    `Skipped: ${skippedDuplicates.slice(0, 10).join(', ')}${skippedDuplicates.length > 10 ? ` and ${skippedDuplicates.length - 10} more...` : ''}`
  ]);
  setImporting(false);
  return;
}
```

**3. Filter Order Groups to Exclude Duplicates**

When building `orderGroups`, only include orders whose `order_ref` is NOT in `existingOrderCodes`:
```typescript
for (const row of validation.valid) {
  const orderRef = row.order_ref.trim();
  
  // Skip if this order already exists in database
  if (existingOrderCodes.has(orderRef)) {
    continue;
  }
  
  // ... rest of grouping logic
}
```

**4. Show Skipped Duplicates in Summary**

After import completes, include skipped duplicates in the success message:
```typescript
if (skippedDuplicates.length > 0) {
  newErrors.push(`Skipped ${skippedDuplicates.length} existing order(s): ${skippedDuplicates.slice(0, 5).join(', ')}${skippedDuplicates.length > 5 ? '...' : ''}`);
}

// Update toast message to reflect skipped orders
toast({
  title: 'Import Complete',
  description: `Imported ${created} order(s)${skippedDuplicates.length > 0 ? `, skipped ${skippedDuplicates.length} existing` : ''}${newErrors.length > 0 ? ` with ${newErrors.length} note(s)` : ''}`,
});
```

## Summary of Changes

| Change | Location | Purpose |
|--------|----------|---------|
| Add `checkExistingOrders()` | Line ~244 | Query DB for existing order codes |
| Pre-flight duplicate check | `handleImport` start | Identify duplicates before insert |
| Filter order groups | Order grouping loop | Skip duplicates |
| Update success message | Toast + errors array | Show user what was skipped |

## Expected Behavior After Fix

| Scenario | Current | After Fix |
|----------|---------|-----------|
| All 34 orders exist | 34 errors, 0 imported | Message: "All 34 orders already exist", list of skipped |
| 10 exist, 24 new | 10 errors, 0 imported | 24 imported, "Skipped 10 existing orders: PO739, PO766..." |
| 0 duplicates | Works fine | Works fine (no change) |

## Technical Notes

- Uses **exact match** comparison for `order_code` (per user preference)
- Performs a single query upfront to check all order refs (efficient)
- Skipped duplicates are shown as **info messages** (not blocking errors)
- Import continues with valid new orders even when some are duplicates
