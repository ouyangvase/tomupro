const BRUNEI_TIME_ZONE = 'Asia/Brunei';

export type DriverReviewOrder = {
  id: string;
  driver_status?: string | null;
  total_amount?: number | null;
  driver_delivered_at?: string | null;
  driver_failed_at?: string | null;
  updated_at?: string | null;
};

export type DriverReviewDateGroup<T extends DriverReviewOrder> = {
  dateKey: string;
  latestActionAt: string;
  deliveredOrders: T[];
  failedOrders: T[];
  deliveredAmount: number;
  failedAmount: number;
};

function getBruneiDateKey(timestamp: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRUNEI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getDriverActionTimestamp(order: DriverReviewOrder) {
  if (order.driver_status === 'DRIVER_DELIVERED') {
    return order.driver_delivered_at || order.updated_at || null;
  }
  if (order.driver_status === 'DRIVER_FAILED') {
    return order.driver_failed_at || order.updated_at || null;
  }
  return null;
}

export function groupDriverReviewOrdersByDate<T extends DriverReviewOrder>(
  orders: T[],
): DriverReviewDateGroup<T>[] {
  const groups = new Map<string, DriverReviewDateGroup<T>>();

  for (const order of orders) {
    const actionAt = getDriverActionTimestamp(order);
    if (!actionAt || Number.isNaN(new Date(actionAt).getTime())) continue;

    const dateKey = getBruneiDateKey(actionAt);
    const group = groups.get(dateKey) || {
      dateKey,
      latestActionAt: actionAt,
      deliveredOrders: [],
      failedOrders: [],
      deliveredAmount: 0,
      failedAmount: 0,
    };
    const amount = Number(order.total_amount || 0);

    if (order.driver_status === 'DRIVER_DELIVERED') {
      group.deliveredOrders.push(order);
      group.deliveredAmount += amount;
    } else if (order.driver_status === 'DRIVER_FAILED') {
      group.failedOrders.push(order);
      group.failedAmount += amount;
    }

    if (new Date(actionAt).getTime() > new Date(group.latestActionAt).getTime()) {
      group.latestActionAt = actionAt;
    }
    groups.set(dateKey, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      deliveredOrders: [...group.deliveredOrders].sort(
        (a, b) => new Date(getDriverActionTimestamp(b) || 0).getTime()
          - new Date(getDriverActionTimestamp(a) || 0).getTime(),
      ),
      failedOrders: [...group.failedOrders].sort(
        (a, b) => new Date(getDriverActionTimestamp(b) || 0).getTime()
          - new Date(getDriverActionTimestamp(a) || 0).getTime(),
      ),
    }))
    .sort(
      (a, b) => new Date(b.latestActionAt).getTime() - new Date(a.latestActionAt).getTime(),
    );
}

export function formatDriverActionDate(timestamp: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BRUNEI_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(timestamp));
}

export function formatDriverActionDateTime(timestamp: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BRUNEI_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}
