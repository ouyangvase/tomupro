export function normalizeOrderCodeSearch(value?: string) {
  return value?.trim().toUpperCase().replace(/\s+/g, '') || '';
}

export function hasOrderCodeSearch(value?: string) {
  return normalizeOrderCodeSearch(value).length > 0;
}

export function orderCodeSearchPattern(value?: string) {
  const normalized = normalizeOrderCodeSearch(value);
  return normalized ? `${normalized}%` : undefined;
}

export function dedupeOrderSearchResults<T extends {
  id: string;
  order_code: string;
  updated_at?: string | null;
}>(orders: T[]) {
  const byId = new Map<string, T>();
  for (const order of orders) {
    const existing = byId.get(order.id);
    if (!existing || (order.updated_at || '') > (existing.updated_at || '')) {
      byId.set(order.id, order);
    }
  }

  const byOrderCode = new Map<string, T>();
  for (const order of byId.values()) {
    const key = normalizeOrderCodeSearch(order.order_code) || order.id;
    const existing = byOrderCode.get(key);
    if (!existing || (order.updated_at || '') > (existing.updated_at || '')) {
      byOrderCode.set(key, order);
    }
  }

  return [...byOrderCode.values()];
}
