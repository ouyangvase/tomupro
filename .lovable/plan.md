

# Fix Order Items Display and Strengthen Import Validation

## Problem Summary

| Issue | Root Cause | Solution |
|-------|------------|----------|
| 1. Orders show "No items" when managers view team orders | RLS policy blocks managers from seeing salesperson's products in embedded joins | Add RLS policy for managers to view team products |
| 2. 23 existing orders have 0 items | Historical data issue - orders imported without items | Data fix + prevent future occurrences |
| 3. Import should reject invalid SKUs before import | Validation happens, but UI flow could be clearer | Move SKU validation to preview step + block import button |

---

## Part 1: Fix RLS Policy for Products (Database)

The core issue is that when managers view orders from their team members, the nested `product:products(...)` join in the query returns null because the products RLS policy doesn't grant managers visibility to team member's products through embedded joins.

**Current RLS Policies on products table:**
- "Manager can view team products" - uses `is_in_manager_team(created_by, auth.uid())` but this checks `created_by`, not `owner_user_id`
- "Manager can view group products" - checks manager_groups but may not be configured for all managers

**Fix:** Add/update RLS policy to allow managers to see products owned by their team members:

```sql
-- Drop existing policy that uses created_by
DROP POLICY IF EXISTS "Manager can view team products" ON products;

-- Create corrected policy that uses owner_user_id
CREATE POLICY "Manager can view team products" ON products
  FOR SELECT
  TO public
  USING (
    (get_user_role(auth.uid()) = 'manager'::app_role) 
    AND (
      (owner_user_id = auth.uid())  -- Own products
      OR is_in_manager_team(owner_user_id, auth.uid())  -- Team products
    )
  );
```

---

## Part 2: Strengthen Import Validation (Frontend)

### File: `src/components/orders/ImportOrdersDialog.tsx`

**Current Flow:**
1. Upload CSV
2. Map columns
3. Preview (validation errors shown here)
4. User clicks Import (validation runs again, rejects if errors)

**Problem:** User can see "Import" button even when there are validation errors. They're confused when import is rejected.

**Fix:** Run SKU validation when moving to Preview step, not during import. Disable import button when errors exist.

### Changes to `handleProceedToPreview`:

```typescript
const handleProceedToPreview = () => {
  if (!rawData || !areRequiredFieldsMapped(columnMapping)) {
    toast({ variant: 'destructive', title: 'Missing required fields', description: 'Please map all required fields' });
    return;
  }

  // Apply mapping and validate basic schema
  const mappedRows = applyColumnMapping(rawData.rows, columnMapping);
  const validation = validateOrderLines(mappedRows);
  
  if (validation.errors.length > 0) {
    setErrors(validation.errors.map(e => `Row ${e.row}: ${e.message}`));
    setStep('preview');
    return;
  }
  
  // NEW: Validate SKU ownership at preview step (fail-fast)
  const skuValidation = validateSkuOwnership(validation.valid, ownerProducts);
  if (!skuValidation.valid) {
    setErrors([
      'Invalid SKUs found in your file. Please fix and re-upload:',
      '',
      ...skuValidation.errors
    ]);
    setStep('preview');
    return;
  }
  
  // No errors - clear and proceed
  setErrors([]);
  setStep('preview');
};
```

### Clearer Error Messages:

Update error messages to be more specific about what row and which SKU failed:

```typescript
// In validateSkuOwnership:
skuErrors.push(
  `Row ${csvRowNum}: SKU "${skuValue}" not found in your product catalog. ` +
  `Please add this product first or correct the SKU code.`
);
```

---

## Part 3: Handle Existing Orders with 0 Items

For the 23 ALLEN orders with 0 items, these are historical data issues. Two approaches:

**Option A: Hide orders with 0 items in UI (not recommended)**

**Option B: Mark orders with 0 items for review (recommended)**

Add a warning indicator in the data grid for orders with no items:

```typescript
// In formatOrderItemsDisplay:
if (!orderItems || orderItems.length === 0) {
  return {
    displayText: 'No items',
    fullText: 'No items - order may need repair',
    hasError: true,  // Changed from false to true
    errorMessage: 'This order has no items. Please edit and add items.',
  };
}
```

---

## Summary of Changes

| File | Change | Purpose |
|------|--------|---------|
| **Database Migration** | Fix RLS policy for products table | Allow managers to see team products in embedded joins |
| `src/components/orders/ImportOrdersDialog.tsx` | Move SKU validation to preview step | Fail-fast validation before import |
| `src/components/orders/ImportOrdersDialog.tsx` | Improve error messages with row numbers | Clear indication of which rows failed |
| `src/lib/orderItemsDisplay.ts` | Mark "No items" as error condition | Visual indicator for orders needing repair |

---

## Expected Results

| Before | After |
|--------|-------|
| Manager sees "No items" for team orders | Manager sees "TLS001/TURMERIC LEMON SOAP x 2" |
| Invalid SKU allows clicking Import, then fails | Invalid SKU shows error at Preview step, Import button disabled |
| Orders with 0 items show no warning | Orders with 0 items show warning indicator |

