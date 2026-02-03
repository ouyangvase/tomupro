
# Cash Liability System Refactor: Driver-to-Runner Flow

## Understanding the Requirement

The cash liability system tracks cash collected by **drivers** that needs to be handed to their **runner**. This is a driver-runner internal settlement, not involving admin.

### Current Flow (Incorrect)
1. Driver marks delivered (no payment method selection)
2. Runner accepts delivery
3. Cash liability created with `runner_id` (wrong entity)
4. Runner "settles" with company (wrong relationship)

### Correct Flow (To Implement)
1. Driver marks delivered and **MUST select: Cash or Transfer**
2. If **Cash**: Create cash liability with `driver_id` 
3. Runner sees outstanding cash **from their drivers**
4. Runner confirms cash received **from specific driver**
5. No admin dashboard needed for this internal settlement

---

## Database Schema Changes

### Modify `cash_liabilities` table

Change the ownership model from runner-centric to driver-centric:

```sql
-- Add driver_id column, keep runner_id for tracking
ALTER TABLE public.cash_liabilities
ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES profiles(id);

-- Update RLS policies to allow drivers to create liabilities
-- and runners to view/settle liabilities from their drivers
```

### New Columns
| Column | Type | Description |
|--------|------|-------------|
| driver_id | uuid | The driver who collected the cash (NEW) |
| runner_id | uuid | The runner the driver reports to (EXISTING) |

---

## Implementation Details

### 1. Driver Inbox: Payment Method Selection on Delivery

**File: `src/pages/driver/DriverInbox.tsx`**

When driver clicks "Delivered":
- Show dialog with **mandatory** payment method selection
- Options: "Cash" or "Transfer"
- Display order amount prominently
- Only proceed after selection

```typescript
// Add state for payment method
const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER' | ''>('');

// Update delivered dialog to require payment method selection
// before confirming
```

### 2. Driver Mark Delivered with Payment Method

**File: `src/hooks/useDrivers.ts`**

Update `useDriverMarkDelivered` to:
1. Accept payment method parameter
2. Create cash liability immediately if CASH selected
3. Store the driver-reported payment method on the order

```typescript
export function useDriverMarkDelivered() {
  return useMutation({
    mutationFn: async ({ 
      orderId, 
      paymentMethod 
    }: { 
      orderId: string; 
      paymentMethod: 'CASH' | 'TRANSFER' 
    }) => {
      // Get current user (driver)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      // Get order details including runner_id
      const { data: order } = await supabase
        .from('orders')
        .select('runner_id, order_code, customer_name, total_amount')
        .eq('id', orderId)
        .single();
      
      // Update order with driver-reported payment method
      await supabase
        .from('orders')
        .update({
          driver_status: 'DRIVER_DELIVERED',
          driver_delivered_at: new Date().toISOString(),
          driver_payment_method: paymentMethod,
          runner_accept_status: 'PENDING',
        })
        .eq('id', orderId);
      
      // If CASH, create liability immediately
      if (paymentMethod === 'CASH' && order.runner_id) {
        await createDriverCashLiability({
          driverId: user.id,
          runnerId: order.runner_id,
          orderId,
          orderCode: order.order_code,
          customerName: order.customer_name,
          cashAmount: Number(order.total_amount),
        });
      }
    }
  });
}
```

### 3. Cash Liability Hook Updates

**File: `src/hooks/useCashLiabilities.ts`**

#### New function: `createDriverCashLiability`
Creates liability when driver reports cash collection

#### Update: `useRunnerCashLiabilities`
- Fetch liabilities where `runner_id = currentUser`
- Group by `driver_id` (show which driver owes what)
- Each entry shows: Driver Name, Order Code, Customer, Amount

#### New: `useSettleDriverCash`
- Settle liabilities for a specific driver or all drivers
- Create settlement batch
- Audit log the transaction

### 4. Runner Cash Settlement View (Refactored)

**File: `src/pages/runner/RunnerCashSettlement.tsx`**

Redesign to show cash **by driver**:

```
+--------------------------------+
| Cash to Collect from Drivers   |
+--------------------------------+
| Total Outstanding: BND 450.00  |
| From 2 drivers                 |
+--------------------------------+

+--------------------------------+
| 🚗 Driver: Ali                 |
|    BND 250.00 (3 orders)       |
+--------------------------------+
| Order #123 - Ahmad - BND 80    |
| Order #124 - Sara  - BND 120   |
| Order #125 - Lee   - BND 50    |
|                                |
| [Confirm Cash Received]        |
+--------------------------------+

+--------------------------------+
| 🚗 Driver: Yusof               |
|    BND 200.00 (2 orders)       |
+--------------------------------+
| Order #130 - Mei   - BND 100   |
| Order #131 - Raju  - BND 100   |
|                                |
| [Confirm Cash Received]        |
+--------------------------------+
```

### 5. Remove Admin Cash Liability Dashboard

**Files to remove from sidebar and routes:**
- Remove `/admin/cash-liabilities` route
- Remove admin menu item for Cash Liabilities
- Keep the hooks for potential future use (audit purposes)

### 6. Database Migration

```sql
-- Add driver_id column to cash_liabilities
ALTER TABLE public.cash_liabilities
ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES profiles(id);

-- Add driver_payment_method to orders (what driver reported)
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS driver_payment_method text;

-- Update RLS: Drivers can insert their own liabilities
DROP POLICY IF EXISTS "System creates liabilities" ON cash_liabilities;
CREATE POLICY "Drivers create own liabilities"
ON cash_liabilities FOR INSERT
WITH CHECK (driver_id = auth.uid());

-- Runners can view liabilities from their drivers
DROP POLICY IF EXISTS "Runners view own liabilities" ON cash_liabilities;
CREATE POLICY "Runners view driver liabilities"
ON cash_liabilities FOR SELECT
USING (
  runner_id = auth.uid() OR
  driver_id = auth.uid()
);

-- Runners can update (settle) liabilities from their drivers
DROP POLICY IF EXISTS "Runners settle own liabilities" ON cash_liabilities;
CREATE POLICY "Runners settle driver liabilities"
ON cash_liabilities FOR UPDATE
USING (runner_id = auth.uid() AND status = 'OPEN');
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/xxx_driver_cash_liabilities.sql` | Create | DB schema changes + RLS |
| `src/pages/driver/DriverInbox.tsx` | Modify | Add payment method selection dialog |
| `src/hooks/useDrivers.ts` | Modify | Accept payment method in mark delivered |
| `src/hooks/useCashLiabilities.ts` | Modify | Driver-centric liability creation, runner view by driver |
| `src/pages/runner/RunnerCashSettlement.tsx` | Modify | Group by driver, show orders per driver |
| `src/components/layout/AppSidebar.tsx` | Modify | Remove admin cash liability menu item |
| `src/App.tsx` | Modify | Remove admin cash liability route |
| `src/pages/admin/CashLiabilityAdmin.tsx` | Delete | Not needed for driver-runner flow |

---

## UI Flow Summary

### Driver View (My Deliveries)
1. Click "Delivered" button
2. Dialog appears with:
   - Order details (customer, amount)
   - **Mandatory** payment method: Cash / Transfer
3. Select "Cash" or "Transfer"
4. Click "Confirm"
5. If Cash: Liability created automatically

### Runner View (Cash Settlement)
1. See total outstanding grouped by driver
2. Expand driver to see individual orders
3. Click "Confirm Cash Received" for a driver
4. All orders for that driver marked as settled

---

## Acceptance Criteria

1. Driver MUST select Cash or Transfer when marking delivered
2. Cash selection creates liability with driver_id + runner_id
3. Runner sees cash grouped by which driver owes
4. Runner can confirm collection per driver
5. Each order shows in the driver's breakdown
6. Settlement is permanent and audited
7. No admin involvement in driver-runner cash flow
