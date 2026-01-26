
# Fix Select All and Simplify Delivery Filter

## Problem Summary

| Issue | Current Behavior | Expected Behavior |
|-------|------------------|-------------------|
| Select All (Desktop) | Only selects current page (12) | Should select ALL filtered orders (560) |
| Select All (Mobile) | Only selects visible items | Should select ALL filtered orders |
| Delivery Filter | Shows 5 options (Unassigned, Assigned, Taken, Delivered, Failed) | Should show 3 options (Unassigned, Assigned, Taken) - "Assigned" includes "Taken" |

---

## Part 1: Fix Select All to Apply to ALL Filtered Orders

### File: `src/components/data-grid/DataGrid.tsx`

#### A) Fix Table Header Checkbox (Desktop)

**Current code (line 238-244):**
```typescript
const handleSelectAll = (checked: boolean) => {
  if (checked) {
    onSelectionChange?.(displayData.map((item) => String(item[keyField])));
  } else {
    onSelectionChange?.([]);
  }
};
```

**Fix:** Change `displayData` to `filteredData` to select ALL filtered items across all pages:
```typescript
const handleSelectAll = (checked: boolean) => {
  if (checked) {
    onSelectionChange?.(filteredData.map((item) => String(item[keyField])));
  } else {
    onSelectionChange?.([]);
  }
};
```

#### B) Fix `isAllSelected` Check (line 275-276)

**Current:**
```typescript
const isAllSelected = displayData.length > 0 && 
  displayData.every((item) => selectedRows.includes(String(item[keyField])));
```

**Fix:** Check against `filteredData`:
```typescript
const isAllSelected = filteredData.length > 0 && 
  filteredData.every((item) => selectedRows.includes(String(item[keyField])));
```

#### C) Fix Mobile Select All (line 446-449)

**Current:**
```typescript
<span className="text-sm font-medium">Select all ({displayData.length})</span>
```

**Fix:** Show total filtered count:
```typescript
<span className="text-sm font-medium">Select all ({filteredData.length})</span>
```

---

## Part 2: Simplify Delivery Status Filter Options

### File: `src/components/filters/OrderFiltersPanel.tsx`

**Current (line 86-92):**
```typescript
const runnerStatusOptions: FilterOption[] = [
  { label: 'Unassigned', value: 'UNASSIGNED' },
  { label: 'Assigned', value: 'ASSIGNED' },
  { label: 'Taken', value: 'TAKEN' },
  { label: 'Delivered', value: 'DELIVERED' },
  { label: 'Failed Delivery', value: 'FAILED_DELIVERY' },
];
```

**Change to simplified options:**
```typescript
const runnerStatusOptions: FilterOption[] = [
  { label: 'Unassigned', value: 'UNASSIGNED' },
  { label: 'Assigned', value: 'ASSIGNED' },  // Will include TAKEN
  { label: 'Taken', value: 'TAKEN' },
];
```

### File: `src/components/filters/OrderFiltersPanel.tsx` - `applyOrderFilters` function

Update the filter logic so "Assigned" filter includes TAKEN orders:

**Current logic (around line 530-540):**
```typescript
if (filters.runnerStatus) {
  result = result.filter((o) => o.runner_status === filters.runnerStatus);
}
```

**Updated logic:**
```typescript
if (filters.runnerStatus) {
  if (filters.runnerStatus === 'ASSIGNED') {
    // "Assigned" includes both ASSIGNED and TAKEN statuses
    result = result.filter((o) => 
      o.runner_status === 'ASSIGNED' || o.runner_status === 'TAKEN'
    );
  } else {
    result = result.filter((o) => o.runner_status === filters.runnerStatus);
  }
}
```

### Update DataGrid Column Filter Options

For pages that define their own filter options (like ReadySales.tsx, AdminRunnerInbox.tsx), we need to update those too:

**Files to update:**
- `src/pages/sales/ReadySales.tsx` (line 312-318)
- `src/pages/admin/AdminRunnerInbox.tsx` (line 43-49)
- `src/pages/runner/RunnerInbox.tsx` (line 50-55)

Change the column filter options from 5 options to 3:
```typescript
filterOptions: [
  { label: 'Unassigned', value: 'UNASSIGNED' },
  { label: 'Assigned', value: 'ASSIGNED' },
  { label: 'Taken', value: 'TAKEN' },
],
```

---

## Summary of Changes

| File | Change | Purpose |
|------|--------|---------|
| `src/components/data-grid/DataGrid.tsx` | Change `handleSelectAll` to use `filteredData` | Select all 560 orders, not just current page |
| `src/components/data-grid/DataGrid.tsx` | Change `isAllSelected` to check `filteredData` | Correct checkbox state |
| `src/components/data-grid/DataGrid.tsx` | Update mobile select all count | Show total (560) not page count (12) |
| `src/components/filters/OrderFiltersPanel.tsx` | Remove Delivered/Failed from options | Simplify to 3 delivery statuses |
| `src/components/filters/OrderFiltersPanel.tsx` | Update filter logic for "Assigned" | Include TAKEN when filtering by Assigned |
| `src/pages/sales/ReadySales.tsx` | Update column filter options | Match simplified options |
| `src/pages/admin/AdminRunnerInbox.tsx` | Update column filter options | Match simplified options |
| `src/pages/runner/RunnerInbox.tsx` | Update column filter options | Match simplified options |

---

## Expected Results

| Before | After |
|--------|-------|
| Select All shows (12) and selects 12 | Select All shows (560) and selects 560 |
| Delivery filter shows 5 options | Delivery filter shows 3 options |
| "Assigned" filter shows only ASSIGNED | "Assigned" filter shows ASSIGNED + TAKEN |
| Bulk actions apply to 12 rows max | Bulk actions can apply to all 560 rows |
