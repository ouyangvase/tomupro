
# Cash Driver - Today's Deliveries Excel-Style Tracker

## Overview

Create a new page called "Cash Driver" for runners to see a detailed Excel-style list of today's deliveries by driver, showing both cash and transfer orders with clear columns.

## Data Source Understanding

From exploring the codebase:
- Orders have `driver_payment_method` column ('CASH' or 'TRANSFER') set when driver marks delivered
- Orders have `driver_delivered_at` timestamp when driver marks delivered
- `driver_id` links to the driver who delivered the order
- Current `RunnerCashSettlement.tsx` only shows OPEN cash liabilities, not all deliveries

## What We're Building

A new page that shows **all driver deliveries for today** in an Excel-like table:

```
+-------+-------+------------+-----------+----------+----------+------------+
| Driver| Order | Customer   | Delivered | Total    | Payment  | Cash       |
|       | Code  |            | Time      | Amount   | Method   | to Collect |
+-------+-------+------------+-----------+----------+----------+------------+
| Ali   | JC123 | Ahmad      | 09:15     | BND 99   | CASH     | 99.00      |
| Ali   | JC124 | Sara       | 10:30     | BND 150  | TRANSFER | 0.00       |
| Ali   | JC125 | Lee        | 11:45     | BND 78   | CASH     | 78.00      |
| Yusof | KD001 | Mei        | 09:00     | BND 120  | TRANSFER | 0.00       |
| Yusof | KD002 | Raju       | 12:15     | BND 45   | CASH     | 45.00      |
+-------+-------+------------+-----------+----------+----------+------------+
| TOTAL |       |            |           | BND 492  |          | 222.00     |
+-------+-------+------------+-----------+----------+----------+------------+
```

## Implementation Details

### 1. New Hook: `useDriverDeliveriesToday`

Create a new hook in `useCashLiabilities.ts` to fetch today's deliveries:

```typescript
// Get today's driver deliveries for runner (all payment methods)
export function useDriverDeliveriesToday(driverFilter?: string) {
  return useQuery({
    queryKey: ['driver-deliveries-today', driverFilter],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const today = format(new Date(), 'yyyy-MM-dd');
      
      let query = supabase
        .from('orders')
        .select(`
          id,
          order_code,
          customer_name,
          total_amount,
          driver_id,
          driver_payment_method,
          driver_delivered_at,
          driver:profiles!orders_driver_id_fkey(display_name)
        `)
        .eq('runner_id', user.id)
        .eq('driver_status', 'DRIVER_DELIVERED')
        .gte('driver_delivered_at', today)
        .order('driver_delivered_at', { ascending: false });
      
      if (driverFilter && driverFilter !== 'all') {
        query = query.eq('driver_id', driverFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}
```

### 2. New Page: `RunnerCashDriver.tsx`

Create `/runner/cash-driver` page with:

**Header Section:**
- Title: "Cash Driver" with subtitle "Today's deliveries by driver"
- Driver filter dropdown
- Summary cards:
  - Total Deliveries Count
  - Total Cash to Collect
  - Total Transfer Amount

**Table Section:**
- Excel-style table with sticky header
- Columns:
  - Driver Name
  - Order Code
  - Customer
  - Delivered Time
  - Total Amount
  - Payment Method (badge: CASH/TRANSFER)
  - Cash to Collect (amount if CASH, "0.00" if TRANSFER)
- Footer row with totals

**Visual Design:**
- CASH rows: subtle yellow/amber background
- TRANSFER rows: normal background
- Cash column: CASH shows amount, TRANSFER shows "0.00" in muted style

### 3. Navigation Update

Add new sidebar item under Runner section:
```typescript
{
  title: "Cash Driver",
  url: "/runner/cash-driver",
  icon: Car, // or Truck
  roles: ['runner']
}
```

Place it near "Cash Settlement" for logical grouping.

### 4. Route Registration

Add route in `App.tsx`:
```typescript
import RunnerCashDriver from "./pages/runner/RunnerCashDriver";

<Route path="/runner/cash-driver" element={<RunnerCashDriver />} />
```

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useCashLiabilities.ts` | Modify | Add `useDriverDeliveriesToday` hook |
| `src/pages/runner/RunnerCashDriver.tsx` | Create | New Excel-style deliveries page |
| `src/components/layout/AppSidebar.tsx` | Modify | Add "Cash Driver" nav item |
| `src/App.tsx` | Modify | Add route for `/runner/cash-driver` |

## UI Specifications

### Summary Cards (Top)
- Card 1: "Total Orders" - count of all deliveries today
- Card 2: "Cash to Collect" - sum of CASH order amounts (highlighted)
- Card 3: "Transfer Orders" - sum of TRANSFER order amounts

### Table Design
- Horizontal scroll on mobile
- Sticky first column (Driver) on mobile
- Row highlighting:
  - CASH orders: light amber background
  - TRANSFER orders: default background
- Cash column formatting:
  - CASH: bold, primary color (e.g., "99.00")
  - TRANSFER: muted text "0.00"

### Footer Row
- Shows totals for Amount and Cash columns
- Sticky at bottom if many rows

## Technical Notes

1. **Query filters today's date only** using `driver_delivered_at >= today`
2. **Shows both CASH and TRANSFER** - per user request "also need show transfer order"
3. **Cash column shows 0 for transfers** - per user request "if transfer in cash need to column show 0 only"
4. **Driver filter** - optional dropdown to filter by specific driver
5. **Real-time updates** - subscribe to order changes for live updates
