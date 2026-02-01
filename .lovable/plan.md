

# Plan: Fix Admin View of Delivered Orders

## Problem Summary

The Admin user sees 0 delivered orders on the "Delivered Orders" page, while the data is correctly being returned from the backend (1,270+ delivered orders visible in network response).

## Root Cause Analysis

After thorough investigation, I identified these issues:

| Issue | Impact | Location |
|-------|--------|----------|
| **SKU filter is active** | Screenshot shows "SKU Analysis: TY01" which means only orders with that SKU should display | UI State |
| **Products hook uses visibility filtering** | `useProducts` uses `useVisibleUserIds('products')` which may not correctly return undefined for admin on first load | `src/hooks/useProducts.ts` lines 17-19 |
| **Server RPC loading race condition** | While `serverVisibleIds` is loading, fallback logic kicks in but may not handle admin correctly | `src/hooks/useTeamVisibility.ts` lines 115-138 |

### Detailed Technical Analysis

1. **The Admin IS receiving delivered orders** - Network requests show orders are returned with `runner_status=DELIVERED`

2. **SKU filter mismatch** - Both screenshots show "SKU Analysis: TY01" active. The SKU dropdown options come from `useProducts()` which applies visibility filtering via `visibleUserIds`. 

3. **Race condition in visibility hook** - In `useTeamVisibility.ts`:
   ```typescript
   // Line 119-121
   if (serverVisibleIds !== undefined) {
     if (serverVisibleIds === null) return undefined; // Admin path
   }
   ```
   The issue: While `serverVisibleIds` is loading (undefined), the hook falls through to client-side fallback. But the fallback for admin (line 138) returns `undefined` correctly:
   ```typescript
   if (role === 'admin') return undefined;
   ```

4. **The actual bug** - The `useProducts` hook on line 38-40:
   ```typescript
   if (visibleUserIds && visibleUserIds.length > 0) {
     query = query.in('owner_user_id', visibleUserIds);
   }
   ```
   This works correctly IF `visibleUserIds` is `undefined` (no filter). But there's a subtle issue: when `visibleUserIds` is an empty array `[]`, it still passes the `&&` check because `[] && [].length` is falsy. However, the issue is that during loading, `visibleUserIds` might be `[]` initially.

5. **The query key dependency problem** - In `useProducts`:
   ```typescript
   queryKey: ['products', includeInactive, role, user?.id, visibleUserIds, dataViewMode],
   ```
   When `visibleUserIds` changes from `[]` to `undefined` to server result, the query re-runs. But if the initial state incorrectly filters, the cached result is wrong.

## Solution

### Fix 1: Ensure products are not filtered while visibility is loading

Update `useProducts` to handle the loading state properly - wait for visibility to resolve before filtering.

### Fix 2: Clear SKU filter when no matching data

Add logic to detect when a filter yields zero results and prompt user to clear filters.

### Fix 3: Add "Clear All Filters" button for better UX

Add a visible "Clear Filters" action when filters are active but no results are shown.

## Implementation Changes

### File 1: `src/hooks/useProducts.ts`

**Change:** Add loading awareness and handle initial state correctly

```typescript
export function useProducts(includeInactive = false) {
  const { user, role } = useAuth();
  const { visibleUserIds, dataViewMode, isLoading: visibilityLoading } = useVisibleUserIds('products');
  
  return useQuery({
    queryKey: ['products', includeInactive, role, user?.id, visibleUserIds, dataViewMode],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select(`...`)
        .order('sku_name', { ascending: true });
      
      if (!includeInactive) {
        query = query.eq('is_active', true);
      }
      
      // ONLY filter if visibleUserIds is an array with items
      // undefined = admin (no filter), null or [] = don't filter yet
      if (Array.isArray(visibleUserIds) && visibleUserIds.length > 0) {
        query = query.in('owner_user_id', visibleUserIds);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    // Wait for visibility to resolve for non-admin users
    enabled: (!!user?.id || role === 'admin') && !visibilityLoading,
  });
}
```

### File 2: `src/pages/runner/RunnerDeliveredOrders.tsx`

**Change 1:** Add a "Clear Filters" button when no results are found

**Change 2:** Reset SKU filter to 'all' if it references a product not in the dropdown options

```typescript
// After line 296-297, add effect to validate SKU filter
useEffect(() => {
  // If SKU filter is set but not in available options, reset it
  if (skuFilter !== 'all' && skuOptions.length > 0) {
    const filterExists = skuOptions.some(opt => opt.value === skuFilter);
    if (!filterExists) {
      setSkuFilter('all');
    }
  }
}, [skuFilter, skuOptions]);
```

**Change 3:** Add clear filters button in empty state

```typescript
// In the empty state section (around line 820+)
{deliveredOrders.length === 0 && !isLoading && (
  <TableRow>
    <TableCell colSpan={99} className="text-center py-8 text-muted-foreground">
      <div className="flex flex-col items-center gap-2">
        <span>No delivered orders found</span>
        {hasActiveFilters && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              setSearchQuery('');
              setAreaFilter('all');
              setDriverFilter('all');
              setSalespersonFilter('all');
              setSkuFilter('all');
              setClaimStatusFilter('all');
            }}
          >
            Clear All Filters
          </Button>
        )}
      </div>
    </TableCell>
  </TableRow>
)}
```

### File 3: `src/hooks/useTeamVisibility.ts`

**Change:** Ensure loading state is properly exposed and admin check happens first

```typescript
const visibleUserIds = useMemo<string[] | undefined>(() => {
  if (!user?.id) return [];
  
  // Admin ALWAYS gets undefined (no filter) - don't wait for server
  if (role === 'admin') return undefined;

  // Use server-side RPC result if available
  if (serverVisibleIds !== undefined) {
    if (serverVisibleIds === null) return undefined;
    // ... rest of the logic
  }
  
  // Fallback while loading (will be replaced by server result)
  // ... existing fallback code
}, [...]);
```

## Testing Checklist

After implementation:

1. **Admin View**: Navigate to Delivered Orders as Admin - should see 1,270+ orders with no filters
2. **SKU Filter**: Select any SKU - should show matching orders only
3. **Clear Filters**: Click "Clear All Filters" when empty - should show all orders
4. **Filter Persistence**: Changing users should not carry over filter state
5. **Salesperson View**: Verify Salesperson still sees only their own orders

## Summary of Changes

| File | Change |
|------|--------|
| `src/hooks/useProducts.ts` | Wait for visibility loading, handle undefined correctly |
| `src/hooks/useTeamVisibility.ts` | Prioritize admin role check before server response |
| `src/pages/runner/RunnerDeliveredOrders.tsx` | Add filter validation and Clear Filters button |

