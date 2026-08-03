import { describe, expect, it } from 'vitest';
import type { OrderItem } from '@/types/database';
import { orderItemsQueryKey, resolveOrderItemsForEditor } from '@/lib/orderItemsQuery';

const item = { id: 'item-1', order_id: 'order-1' } as OrderItem;

describe('order item query isolation', () => {
  it('keeps cached order items separate for each signed-in user', () => {
    expect(orderItemsQueryKey('runner-yc2', 'order-1')).not.toEqual(
      orderItemsQueryKey('runner-other', 'order-1'),
    );
  });

  it('does not initialize an empty editor while a fresh query is running', () => {
    expect(resolveOrderItemsForEditor({
      queriedItems: [],
      nestedItems: [],
      querySucceeded: true,
      queryFetching: true,
      queryFailed: false,
    })).toEqual({ ready: false, items: [] });
  });

  it('uses the freshly authorized item rows after the query completes', () => {
    expect(resolveOrderItemsForEditor({
      queriedItems: [item],
      nestedItems: [],
      querySucceeded: true,
      queryFetching: false,
      queryFailed: false,
    })).toEqual({ ready: true, items: [item] });
  });

  it('falls back to embedded item rows only when the direct query fails', () => {
    expect(resolveOrderItemsForEditor({
      queriedItems: [],
      nestedItems: [item],
      querySucceeded: false,
      queryFetching: false,
      queryFailed: true,
    })).toEqual({ ready: true, items: [item] });
  });
});
