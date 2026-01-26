
# Fix Import Validation and Clean Up Invalid Orders

## Summary

| Issue | Current Status | Action Required |
|-------|---------------|-----------------|
| 1. Import should reject entire file if SKU doesn't exist | Already implemented, but UI message could be clearer | Improve error messaging |
| 2. Orders with 0 items exist | 23 orders without items (all ALLEN's) | Delete via database migration |

---

## Part 1: Strengthen Import Rejection UI

The current implementation already:
- Validates SKUs at preview step (lines 177-186)
- Disables Import button when errors exist (line 744: `disabled={importing || errors.length > 0}`)
- Shows clear error messages

**Improvement**: Make rejection messaging more explicit that the entire file is rejected:

### File: `src/components/orders/ImportOrdersDialog.tsx`

**Current error message (line 179-183):**
```typescript
setErrors([
  'Invalid SKUs found. Please fix and re-upload:',
  '',
  ...skuValidation.errors
]);
```

**Change to:**
```typescript
setErrors([
  'IMPORT REJECTED - Invalid SKUs found in your file.',
  'Please fix the following errors and re-upload the entire file:',
  '',
  ...skuValidation.errors
]);
```

**Also update the error display area (line 688-713)** to show a more prominent rejection banner when errors are SKU-related.

---

## Part 2: Delete 23 Orders Without Items

### Database Migration

Delete the following 23 orders that have 0 items (all from user ALLEN):

```
Order Codes to Delete:
AL1126, AL1241, AL1338, AL1339, AL1343, AL1345, AL1349, AL1385,
AL1452, AL1458, AL1459, AL1464, AL1483, AL1489, AL1502, AL1503,
AL1504, AL1516, AL1518, AL1520, AL643, AL651, AL653
```

**SQL Migration:**
```sql
-- Delete 23 orders with no items (historical import errors)
-- All from salesperson ALLEN, created on 2026-01-14

DELETE FROM orders
WHERE id IN (
  '519fe4f3-66c5-42be-9116-543d88e4f5e3',
  '4d75fb7d-ae98-4f5c-afb9-6cdfee2a32b3',
  'c068c462-a73a-41a5-8000-8a742fea5ade',
  'e63b1927-0167-460c-a805-511deba39619',
  '72665416-5fc2-4420-b739-559a2b340c8f',
  'a2bc92db-de5c-4f74-aa3b-364f61bbcfef',
  '92468bb4-afaa-4f60-888e-59f802b825c4',
  '5149af37-d065-4b51-9357-752e1b42b166',
  'fbda8499-432a-40e8-b095-34d9e9ea9f4a',
  '845fcdec-a905-4852-9d1d-c5a048e0fb8a',
  '2d08d54c-64e2-4911-9338-0b947dda24d4',
  'a8c0601f-cdfd-4d88-b0d5-7029e476927a',
  '108c8d4c-ee7d-4e9b-b6da-dbc730fd6f8c',
  '9e28f4c6-9fe6-4702-86a9-5fb627626c7e',
  '66d8c461-cb6b-4eb4-831b-e20c338e8ffe',
  '9e1ad772-5824-4443-9e63-fa2b7eaae768',
  '15b15f87-9755-49be-a3b9-ba965abde908',
  '036965bf-74bf-4898-b0b1-fc4eeabe6bd6',
  '64f33305-eda1-46b0-bf08-50ac1519fc3a',
  '4fc3fdba-527e-4efd-85a1-1d6d579fff9b',
  '4a879db3-9b37-4741-b2fc-31594c9402cf',
  '93037384-8387-44a7-945d-38148a53d62a',
  '9d7ad938-3f97-466d-9dc3-3032f440462e'
);
```

---

## Part 3: Prevent Future Invalid Orders

### Add Database Trigger (Optional but Recommended)

Create a trigger that prevents orders from being committed if they have no items after a brief grace period:

```sql
-- This trigger runs on INSERT to orders
-- It doesn't block immediately (items may be added in separate transaction)
-- But the frontend already handles this validation
```

The current frontend validation is sufficient since:
1. SKU validation happens before import
2. Import button is disabled when errors exist
3. Each order line must have a valid SKU

---

## Summary of Changes

| File/Component | Change | Purpose |
|----------------|--------|---------|
| `src/components/orders/ImportOrdersDialog.tsx` | Clearer rejection messaging | Make it obvious entire file is rejected |
| **Database Migration** | Delete 23 orphaned orders | Clean up invalid historical data |

---

## Technical Notes

### Orders to Delete (All from ALLEN)

| # | Order Code | Order ID |
|---|------------|----------|
| 1 | AL1126 | 519fe4f3-66c5-42be-9116-543d88e4f5e3 |
| 2 | AL1241 | 4d75fb7d-ae98-4f5c-afb9-6cdfee2a32b3 |
| 3 | AL1338 | c068c462-a73a-41a5-8000-8a742fea5ade |
| 4 | AL1339 | e63b1927-0167-460c-a805-511deba39619 |
| 5 | AL1343 | 72665416-5fc2-4420-b739-559a2b340c8f |
| 6 | AL1345 | a2bc92db-de5c-4f74-aa3b-364f61bbcfef |
| 7 | AL1349 | 92468bb4-afaa-4f60-888e-59f802b825c4 |
| 8 | AL1385 | 5149af37-d065-4b51-9357-752e1b42b166 |
| 9 | AL1452 | fbda8499-432a-40e8-b095-34d9e9ea9f4a |
| 10 | AL1458 | 845fcdec-a905-4852-9d1d-c5a048e0fb8a |
| 11 | AL1459 | 2d08d54c-64e2-4911-9338-0b947dda24d4 |
| 12 | AL1464 | a8c0601f-cdfd-4d88-b0d5-7029e476927a |
| 13 | AL1483 | 108c8d4c-ee7d-4e9b-b6da-dbc730fd6f8c |
| 14 | AL1489 | 9e28f4c6-9fe6-4702-86a9-5fb627626c7e |
| 15 | AL1502 | 66d8c461-cb6b-4eb4-831b-e20c338e8ffe |
| 16 | AL1503 | 9e1ad772-5824-4443-9e63-fa2b7eaae768 |
| 17 | AL1504 | 15b15f87-9755-49be-a3b9-ba965abde908 |
| 18 | AL1516 | 036965bf-74bf-4898-b0b1-fc4eeabe6bd6 |
| 19 | AL1518 | 64f33305-eda1-46b0-bf08-50ac1519fc3a |
| 20 | AL1520 | 4fc3fdba-527e-4efd-85a1-1d6d579fff9b |
| 21 | AL643 | 4a879db3-9b37-4741-b2fc-31594c9402cf |
| 22 | AL651 | 93037384-8387-44a7-945d-38148a53d62a |
| 23 | AL653 | 9d7ad938-3f97-466d-9dc3-3032f440462e |

### Validation Already in Place
- Import button disabled when errors exist: `disabled={importing || errors.length > 0}`
- SKU validation at preview step (fail-fast)
- SKU validation again at import step (double-check)
- Error messages show specific rows with issues
