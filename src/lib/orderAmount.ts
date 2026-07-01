// Central helper for computing the amount to display in ANY order list.
//
// Business rule (TOMUPRO):
//   - `qty` is only for stock/packing/logistics.
//   - The value the salesperson keys into each line's "price" field IS the
//     final line amount for that item (NOT a unit price).
//   - Therefore an order's amount = SUM(order_items.price).
//   - Quantity must NEVER multiply price anywhere in the app.
//
// This mirrors the logic used in OrderEditor's `calculateOrderTotals`
// so the list amount always matches the order-detail bottom Total.

type MaybeItem = {
  price?: number | string | null;
  line_total?: number | string | null;
};

type MaybeOrder = {
  total_amount?: number | string | null;
  order_total?: number | string | null;
  order_items?: MaybeItem[] | null;
};

const toNum = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Returns the correct display amount for an order in any list view.
 *
 * Priority:
 *   1. If the order has items loaded → sum of item.price (the stored final
 *      line amount). This guarantees the list matches the detail bottom Total
 *      even for legacy rows whose `total_amount` was persisted incorrectly
 *      as qty * price.
 *   2. Else fall back to `order_total` if present.
 *   3. Else fall back to stored `total_amount`.
 *
 * NEVER multiplies by quantity.
 */
export function getOrderDisplayAmount(order: MaybeOrder | null | undefined): number {
  if (!order) return 0;

  const items = order.order_items;
  if (Array.isArray(items) && items.length > 0) {
    return items.reduce((sum, it) => sum + toNum(it?.price ?? it?.line_total), 0);
  }

  if (order.order_total != null) return toNum(order.order_total);
  return toNum(order.total_amount);
}
