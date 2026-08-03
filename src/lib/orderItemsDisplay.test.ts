import { describe, expect, it } from 'vitest';
import type { OrderItem } from '@/types/database';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';

function makeOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'item-1',
    order_id: 'order-1',
    product_id: 'product-1',
    sku_label: 'MDTOX',
    qty: 3,
    price: 0,
    line_total: 0,
    notes: null,
    created_at: '2026-08-03T00:00:00.000Z',
    product: {
      id: 'product-1',
      sku_code: 'MD01',
      sku_name: 'MDTOX',
    },
    ...overrides,
  } as OrderItem;
}

describe('formatOrderItemsDisplay', () => {
  it('shows the SKU, product name, and quantity returned with a Runner Inbox order', () => {
    expect(formatOrderItemsDisplay([makeOrderItem()]).displayText).toBe('MD01/MDTOX x 3');
  });

  it('falls back to the saved SKU label when the product relation is unavailable', () => {
    const display = formatOrderItemsDisplay([
      makeOrderItem({ product: undefined, product_id: null }),
    ]);

    expect(display.displayText).toBe('MDTOX x 3');
    expect(display.hasError).toBe(false);
  });

  it('keeps every item visible in a multi-item order', () => {
    const display = formatOrderItemsDisplay([
      makeOrderItem(),
      makeOrderItem({
        id: 'item-2',
        sku_label: 'AKO02',
        qty: 2,
        product: {
          id: 'product-2',
          sku_code: 'AKO02',
          sku_name: 'KRILL OIL',
        },
      }),
    ]);

    expect(display.displayText).toBe('MD01/MDTOX x 3, AKO02/KRILL OIL x 2');
  });
});
