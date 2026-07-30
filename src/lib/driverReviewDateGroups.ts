const BRUNEI_TIME_ZONE = 'Asia/Brunei';

export type DriverReviewOrder = {
  id: string;
  assignment_state?: string | null;
  runner_status?: string | null;
  driver_id?: string | null;
  driver_status?: string | null;
  payment_method?: string | null;
  total_amount?: number | null;
  driver_delivered_at?: string | null;
  driver_failed_at?: string | null;
  updated_at?: string | null;
};

const FINAL_RUNNER_OUTCOMES = new Set([
  'DELIVERED',
  'FAILED_DELIVERY',
  'CANCELLED',
  'CANCELED',
  'RETURNED',
  'REFUNDED',
]);

export type DriverReviewDateGroup<T extends DriverReviewOrder> = {
  dateKey: string;
  latestActionAt: string;
  deliveredOrders: T[];
  failedOrders: T[];
  deliveredAmount: number;
  cashAmount: number;
  transferAmount: number;
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

export function isPendingDriverReviewOrder(
  order: DriverReviewOrder,
  expectedDriverStatus: 'DRIVER_DELIVERED' | 'DRIVER_FAILED',
) {
  return order.assignment_state === 'PENDING_ACCEPTANCE'
    && order.driver_status === expectedDriverStatus
    && Boolean(order.driver_id)
    && !FINAL_RUNNER_OUTCOMES.has(String(order.runner_status || '').toUpperCase());
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
      cashAmount: 0,
      transferAmount: 0,
    };
    const amount = Number(order.total_amount || 0);

    if (order.driver_status === 'DRIVER_DELIVERED') {
      group.deliveredOrders.push(order);
      group.deliveredAmount += amount;
      if (order.payment_method === 'TRANSFER') {
        group.transferAmount += amount;
      } else if (order.payment_method === 'COD' || order.payment_method === 'CASH') {
        group.cashAmount += amount;
      }
    } else if (order.driver_status === 'DRIVER_FAILED') {
      group.failedOrders.push(order);
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
