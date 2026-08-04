export interface LocalityGroup<T> {
  label: string;
  orders: T[];
}

export function groupRemainingOrdersByLocality<T>(
  orders: readonly T[],
  getLocalityLabel: (order: T) => string,
): LocalityGroup<T>[] {
  const grouped = new Map<string, T[]>();

  for (const order of orders) {
    const label = getLocalityLabel(order);
    const current = grouped.get(label);
    if (current) current.push(order);
    else grouped.set(label, [order]);
  }

  return Array.from(grouped.entries())
    .map(([label, groupedOrders]) => ({ label, orders: groupedOrders }))
    .sort((left, right) => left.label.localeCompare(right.label));
}
