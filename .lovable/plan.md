

# Comprehensive Fix Plan: Manager Data Visibility & SKU Ownership

## Part 1: Fix Manager Data Visibility

### Problem Analysis
The `get_visible_owner_ids()` RPC and `useVisibleUserIds()` hook are correctly implemented, but they're not consistently applied across all data queries.

---

### 1.1 Create Manager Dashboard Stats Hook
**File:** `src/hooks/useDashboardStats.ts`

Create a new `useManagerStats()` function that uses team visibility:

```typescript
export function useManagerStats() {
  const { user } = useAuth();
  const { data: serverVisibleIds } = useServerVisibleIds();
  
  return useQuery({
    queryKey: ['dashboard-stats', 'manager', user?.id, serverVisibleIds],
    queryFn: async () => {
      // Fetch get_visible_owner_ids RPC
      const { data: visibleIds } = await supabase.rpc('get_visible_owner_ids');
      
      // Use visibleIds array in all queries with .in('salesperson_id', visibleIds)
      // ... count booking, ready, delivered, etc. for entire team
    },
  });
}
```

---

### 1.2 Create `useOrderOwnerProducts` Hook
**File:** `src/hooks/useProductsByOwner.ts`

This hook will filter products to a specific order owner:

```typescript
export function useOrderOwnerProducts(ownerUserId: string | null) {
  return useQuery({
    queryKey: ['products', 'order-owner', ownerUserId],
    queryFn: async () => {
      if (!ownerUserId) return [];
      
      const { data, error } = await supabase
        .from('products')
        .select('id, sku_code, sku_name')
        .eq('owner_user_id', ownerUserId)
        .eq('is_active', true)
        .order('sku_code', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!ownerUserId,
  });
}
```

---

### 1.3 Update Dashboard Page to Use Role-Specific Stats

**File:** `src/pages/Dashboard.tsx`

Add manager case to use `useManagerStats()` hook so dashboard counters reflect team data.

---

## Part 2: Fix SKU Ownership for Orders

### Problem Analysis
Currently:
- `OrderEditor.tsx` uses `useProducts()` which returns team-wide products for managers
- `ImportOrdersDialog.tsx` validates SKU ownership but against team-wide products
- No "Order Owner" selection exists for managers

---

### 2.1 Add `order_owner_id` Column to Orders Table

**Database Migration:**

```sql
-- The order owner for SKU validation purposes
-- For salesperson: always themselves
-- For manager: can be themselves OR a bound salesperson
ALTER TABLE orders 
ADD COLUMN order_owner_id uuid REFERENCES profiles(id);

-- Backfill existing orders: set order_owner_id = salesperson_id
UPDATE orders SET order_owner_id = salesperson_id WHERE order_owner_id IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE orders ALTER COLUMN order_owner_id SET NOT NULL;

-- Add index for performance
CREATE INDEX idx_orders_owner ON orders(order_owner_id);
```

---

### 2.2 Update OrderEditor Component

**File:** `src/components/orders/OrderEditor.tsx`

Add Order Owner selection for managers:

```typescript
interface OrderEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order?: Order | null;
  mode: 'create' | 'edit';
  defaultStatus?: 'BOOKING' | 'READY';
}

// Inside component:
const { profile, role } = useAuth();
const { data: teamMembers = [] } = useTeamMembers();
const isManager = role === 'manager';
const isAdmin = role === 'admin';

// Order owner state
const [orderOwnerId, setOrderOwnerId] = useState<string>(profile?.id || '');

// Determine available owners for selection
const ownerOptions = useMemo(() => {
  if (role === 'salesperson') return []; // No selection, auto-set to self
  if (role === 'manager') {
    return [
      { id: profile!.id, display_name: `${profile!.display_name} (My Order)` },
      ...teamMembers.map(m => ({ id: m.id, display_name: m.display_name })),
    ];
  }
  // Admin: would need to fetch all eligible users
  return [];
}, [role, profile, teamMembers]);

// Products filtered to selected order owner
const { data: ownerProducts = [] } = useOrderOwnerProducts(orderOwnerId);

// Use ownerProducts in the ProductCombobox instead of all products
```

Add UI for owner selection:
```tsx
{(isManager || isAdmin) && mode === 'create' && (
  <FormItem>
    <FormLabel>Order Owner *</FormLabel>
    <Select value={orderOwnerId} onValueChange={setOrderOwnerId}>
      <SelectTrigger>
        <SelectValue placeholder="Select order owner" />
      </SelectTrigger>
      <SelectContent>
        {ownerOptions.map(opt => (
          <SelectItem key={opt.id} value={opt.id}>
            {opt.display_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    <p className="text-xs text-muted-foreground">
      Products will be filtered to this owner's catalog
    </p>
  </FormItem>
)}
```

---

### 2.3 Update ImportOrdersDialog Component

**File:** `src/components/orders/ImportOrdersDialog.tsx`

Add Order Owner selection at the start of the import flow:

```typescript
// Add state for order owner selection
const [orderOwnerId, setOrderOwnerId] = useState<string>(profile?.id || '');
const { data: ownerProducts = [] } = useOrderOwnerProducts(orderOwnerId);

// Use ownerProducts for SKU validation instead of all products
const validateSkuOwnership = (
  validatedRows: ValidatedOrderLine[],
  products: typeof ownerProducts  // Only owner's products
): { valid: boolean; errors: string[] } => {
  // Same logic but against filtered products
};

// In handleImport, set order_owner_id on created orders:
const { data: order, error: orderError } = await supabase
  .from('orders')
  .insert([{
    order_code: orderRef,
    // ...other fields
    salesperson_id: profile.id,  // Who created the order
    order_owner_id: orderOwnerId,  // Whose products are being used
    status: defaultStatus,
  }])
  .select()
  .single();
```

Add owner selection UI before the upload step:
```tsx
{step === 'upload' && (isManager || isAdmin) && (
  <div className="mb-4 p-4 border rounded-lg bg-muted/50">
    <Label>Order Owner</Label>
    <Select value={orderOwnerId} onValueChange={setOrderOwnerId}>
      <SelectTrigger className="mt-2">
        <SelectValue placeholder="Select who owns these orders" />
      </SelectTrigger>
      <SelectContent>
        {ownerOptions.map(opt => (
          <SelectItem key={opt.id} value={opt.id}>{opt.display_name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    <p className="text-xs text-muted-foreground mt-1">
      Only SKUs belonging to this user will be matched during import
    </p>
  </div>
)}
```

---

### 2.4 Server-Side Enforcement (Database Trigger)

**Database Migration:**

```sql
-- Trigger to validate order_items use products owned by order_owner_id
CREATE OR REPLACE FUNCTION validate_order_item_product_ownership()
RETURNS TRIGGER AS $$
DECLARE
  v_order_owner_id uuid;
  v_product_owner_id uuid;
BEGIN
  -- Get order owner
  SELECT order_owner_id INTO v_order_owner_id
  FROM orders WHERE id = NEW.order_id;
  
  -- Get product owner
  SELECT owner_user_id INTO v_product_owner_id
  FROM products WHERE id = NEW.product_id;
  
  -- Validate ownership match
  IF v_order_owner_id IS NOT NULL 
     AND v_product_owner_id IS NOT NULL 
     AND v_order_owner_id != v_product_owner_id THEN
    RAISE EXCEPTION 
      'Product owner mismatch: Cannot use products owned by another user. Order owner: %, Product owner: %',
      v_order_owner_id, v_product_owner_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER check_order_item_product_ownership
  BEFORE INSERT OR UPDATE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION validate_order_item_product_ownership();
```

---

## Part 3: Ensure Consistent Visibility Across All Pages

### 3.1 Update Sales Pages

Apply `get_visible_owner_ids` filtering to:
- `src/pages/sales/BookingSales.tsx`
- `src/pages/sales/ReadySales.tsx`
- `src/pages/sales/CancelledSales.tsx`
- `src/pages/sales/SalespersonActionInbox.tsx`

Ensure all use `useTeamOrders()` or equivalent with visibility filtering.

---

### 3.2 Update Products Page

**File:** `src/pages/products/ProductsPage.tsx`

Ensure `useProducts()` hook is used correctly and add "My Products" vs "Team Products" tabs for managers (similar to Stock Balance page).

---

### 3.3 Verify Notification System Uses Same Scope

Check that `useNotifications()` and related hooks filter by visible owner IDs.

---

## Summary of Changes

| Component | Change |
|-----------|--------|
| `orders` table | Add `order_owner_id` column |
| `order_items` | Add validation trigger for ownership |
| `OrderEditor.tsx` | Add owner selector, filter products by owner |
| `ImportOrdersDialog.tsx` | Add owner selector, validate SKUs by owner |
| `useProductsByOwner.ts` | Add `useOrderOwnerProducts()` hook |
| `useDashboardStats.ts` | Add `useManagerStats()` for team metrics |
| Products page | Add My/Team tabs for managers |
| All sales pages | Verify using team visibility consistently |

---

## Acceptance Criteria Validation

| Criteria | Solution |
|----------|----------|
| Manager sees team products & stock after login | `get_visible_owner_ids()` + consistent hook usage |
| Dashboard numbers match team activity | New `useManagerStats()` hook |
| Product & stock pages never show empty if data exists | Fix hooks to use visibility, add tabs |
| Salesperson can only use own products | `order_owner_id` = self (auto) |
| Manager "My Order" uses only manager products | `order_owner_id` = manager.id |
| Manager "Team Order" uses selected salesperson products | `order_owner_id` = selected salesperson |
| Import no longer fails due to cross-owner SKU collisions | SKU lookup scoped to `order_owner_id` |

