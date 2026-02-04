

# Fix Stock Integrity Rebuild Error: Column Name Mismatch

## Problem Identified

The "Apply Full Rebuild" button fails with error: **"column w.owner_id does not exist"**

**Root Cause**: Migration `20260204105833` contains incorrect column names:
- Line 25: `p.owner_id` should be `p.owner_user_id` (products table)
- Line 30: `w.owner_id` should be `w.owner_user_id` (warehouses table)

These incorrect column references are in the `repair_missing_stock_deductions` function which is called by `apply_full_stock_rebuild`.

## Solution

Create a new SQL migration to fix the column references in the `repair_missing_stock_deductions` function.

### Changes Required

**New Migration**: Fix the `repair_missing_stock_deductions` function with correct column names

```sql
CREATE OR REPLACE FUNCTION repair_missing_stock_deductions(p_dry_run boolean DEFAULT true)
-- Change line 25: p.owner_id → p.owner_user_id
-- Change line 30: w.owner_id → w.owner_user_id  
```

**Key fixes**:
1. `p.owner_id as product_owner_id` → `p.owner_user_id as product_owner_id`
2. `w.owner_id = p.owner_id` → `w.owner_user_id = p.owner_user_id`

### Technical Details

The corrected function will:
- Find DELIVERED orders missing stock deductions
- Match products to warehouses using `owner_user_id` (the correct column)
- Insert missing SALE_DEDUCT movements with ON CONFLICT handling for idempotency
- Clear stale delivery queue items

### Files to Modify

| File | Change |
|------|--------|
| New migration | Fix column references in `repair_missing_stock_deductions` function |

### Expected Outcome

After applying this fix:
- "Apply Full Rebuild" button will work correctly
- Missing stock deductions will be created
- Negative balances (as noted, these are acceptable) will remain but no more errors

