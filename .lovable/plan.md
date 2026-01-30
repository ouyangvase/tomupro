

# Plan: Simplify Delivered Orders Export

## Overview

Update the delivered orders export to include only the specific columns requested, with delivery charges looked up based on runner + area combination.

## Requested Export Columns

| Column | Source |
|--------|--------|
| order_ref | `order.order_code` |
| customer_name | `order.customer_name` |
| phone | `order.phone` |
| address | `order.address` |
| area | `order.area` |
| salesperson_name | `order.salesperson?.display_name` |
| delivered_timestamp | `order.delivered_at` or `order.driver_delivered_at` |
| sku_name | `order_item.product?.sku_name` |
| qty | `order_item.qty` |
| total_amount | `order.total_amount` |
| delivery_charges | Looked up from `delivery_charges` table by runner_id + area |

## Implementation

### Changes Required

| File | Change |
|------|--------|
| `src/lib/csv.ts` | Add new `exportDeliveredOrderLines` function with simplified columns + delivery charge lookup |
| `src/pages/runner/RunnerDeliveredOrders.tsx` | Update export handlers to use the new function |

### Technical Details

**1. New Export Interface (csv.ts)**

```typescript
export interface DeliveredOrderLineExport {
  order_ref: string;
  customer_name: string;
  phone: string;
  address: string;
  area: string;
  salesperson_name: string;
  delivered_timestamp: string;
  sku_name: string;
  qty: number;
  total_amount: number;
  delivery_charges: number;
}
```

**2. New Export Function (csv.ts)**

```typescript
export async function exportDeliveredOrderLines(
  orders: any[],
  deliveryChargesMap: Map<string, number>, // key: "runnerId:area" -> charge
  filename: string
) {
  const lines: DeliveredOrderLineExport[] = [];
  
  for (const order of orders) {
    const orderItems = order.order_items || [];
    const chargeKey = `${order.runner_id}:${order.area || ''}`;
    const deliveryCharge = deliveryChargesMap.get(chargeKey) || 0;
    
    if (orderItems.length === 0) {
      lines.push({
        order_ref: order.order_code || '',
        customer_name: order.customer_name || '',
        phone: order.phone || '',
        address: order.address || '',
        area: order.area || '',
        salesperson_name: order.salesperson?.display_name || '',
        delivered_timestamp: order.delivered_at || order.driver_delivered_at || '',
        sku_name: '',
        qty: 0,
        total_amount: Number(order.total_amount) || 0,
        delivery_charges: deliveryCharge,
      });
    } else {
      for (const item of orderItems) {
        lines.push({
          order_ref: order.order_code || '',
          customer_name: order.customer_name || '',
          phone: order.phone || '',
          address: order.address || '',
          area: order.area || '',
          salesperson_name: order.salesperson?.display_name || '',
          delivered_timestamp: order.delivered_at || order.driver_delivered_at || '',
          sku_name: item.product?.sku_name || item.sku_label || '',
          qty: item.qty || 0,
          total_amount: Number(order.total_amount) || 0,
          delivery_charges: deliveryCharge,
        });
      }
    }
  }

  const columns = [
    { key: 'order_ref', header: 'order_ref' },
    { key: 'customer_name', header: 'customer_name' },
    { key: 'phone', header: 'phone' },
    { key: 'address', header: 'address' },
    { key: 'area', header: 'area' },
    { key: 'salesperson_name', header: 'salesperson_name' },
    { key: 'delivered_timestamp', header: 'delivered_timestamp' },
    { key: 'sku_name', header: 'sku_name' },
    { key: 'qty', header: 'qty' },
    { key: 'total_amount', header: 'total_amount' },
    { key: 'delivery_charges', header: 'delivery_charges' },
  ];

  exportToCSV(lines as any, columns, filename);
}
```

**3. Update RunnerDeliveredOrders.tsx**

- Import `useActiveDeliveryCharges` hook
- Build a delivery charges map from the active charges
- Update export handlers to pass the map to the new export function

```typescript
// Fetch active delivery charges for the runner
const { data: activeCharges = [] } = useActiveDeliveryCharges(
  role === 'runner' ? user?.id : undefined
);

// Build lookup map: "runnerId:area" -> charge_amount
const deliveryChargesMap = useMemo(() => {
  const map = new Map<string, number>();
  for (const charge of activeCharges) {
    map.set(`${charge.runner_id}:${charge.area}`, charge.charge_amount);
  }
  return map;
}, [activeCharges]);

// Updated export handlers
const handleExportSelected = useCallback(() => {
  if (exportSelectedIds.size === 0) {
    toast.error('No orders selected for export');
    return;
  }
  const selectedOrders = deliveredOrders.filter(o => exportSelectedIds.has(o.id));
  exportDeliveredOrderLines(selectedOrders, deliveryChargesMap, 'delivered_orders_selected');
  toast.success(`Exported ${exportSelectedIds.size} order(s)`);
}, [deliveredOrders, exportSelectedIds, deliveryChargesMap]);

const handleExportAll = useCallback(() => {
  if (deliveredOrders.length === 0) {
    toast.error('No orders to export');
    return;
  }
  exportDeliveredOrderLines(deliveredOrders, deliveryChargesMap, 'delivered_orders_all');
  toast.success(`Exported ${deliveredOrders.length} order(s)`);
}, [deliveredOrders, deliveryChargesMap]);
```

## Export Output Example

```text
order_ref,customer_name,phone,address,area,salesperson_name,delivered_timestamp,sku_name,qty,total_amount,delivery_charges
"ORD-001","John Doe","555-1234","123 Main St","Downtown","Alice","2024-01-15T10:30:00","Widget A",2,59.98,5.00
"ORD-001","John Doe","555-1234","123 Main St","Downtown","Alice","2024-01-15T10:30:00","Widget B",1,59.98,5.00
"ORD-002","Jane Smith","555-5678","456 Oak Ave","Uptown","Bob","2024-01-15T11:00:00","Premium Pack",1,99.99,8.00
```

## Notes

- The `total_amount` is the order total (same for all line items in an order)
- The `delivery_charges` is looked up by runner_id + area from active approved charges
- If no delivery charge is configured for the area, it defaults to 0
- Each order item gets its own row with qty for that specific SKU

