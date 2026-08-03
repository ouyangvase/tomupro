import type { OrderItem } from '@/types/database';

export const orderItemsQueryKey = (viewerId?: string, orderId?: string) => (
  ['order-items', viewerId || null, orderId || null] as const
);

interface ResolveOrderItemsForEditorOptions {
  queriedItems: OrderItem[];
  nestedItems: OrderItem[];
  querySucceeded: boolean;
  queryFetching: boolean;
  queryFailed: boolean;
}

export function resolveOrderItemsForEditor({
  queriedItems,
  nestedItems,
  querySucceeded,
  queryFetching,
  queryFailed,
}: ResolveOrderItemsForEditorOptions): { ready: boolean; items: OrderItem[] } {
  if (querySucceeded && !queryFetching) {
    return { ready: true, items: queriedItems };
  }

  if (queryFailed && nestedItems.length > 0) {
    return { ready: true, items: nestedItems };
  }

  return { ready: false, items: [] };
}
