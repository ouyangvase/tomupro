const BRUNEI_TIME_ZONE = 'Asia/Brunei';

export type DriverReviewOrder = {
  id: string;
  assignment_state?: string | null;
  runner_status?: string | null;
  runner_accept_status?: string | null;
  runner_review_status?: string | null;
  driver_id?: string | null;
  driver_status?: string | null;
  payment_method?: string | null;
  driver_payment_method?: string | null;
  driver_cash_amount?: number | null;
  driver_transfer_amount?: number | null;
  total_amount?: number | null;
  driver_delivered_at?: string | null;
  driver_failed_at?: string | null;
  updated_at?: string | null;
};

const NON_REVIEWABLE_RUNNER_STATUSES = new Set([
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
  cashOrderCount: number;
  transferAmount: number;
  transferOrderCount: number;
};

export function getDriverReportedPaymentComponents(order: DriverReviewOrder) {
  const orderAmount = Math.max(0, Number(order.total_amount || 0));
  const paymentMethod = String(order.payment_method || '').toUpperCase();
  const driverPaymentMethod = String(order.driver_payment_method || '').toUpperCase();

  const cashAmount = Math.max(0, Number(
    order.driver_cash_amount != null
      ? order.driver_cash_amount
      : driverPaymentMethod === 'CASH'
        ? orderAmount
        : driverPaymentMethod === 'TRANSFER'
          ? 0
          : driverPaymentMethod === 'CASH_TRANSFER'
            ? orderAmount - Number(order.driver_transfer_amount || 0)
            : ['COD', 'CASH'].includes(paymentMethod)
              ? orderAmount
              : 0,
  ));

  const transferAmount = Math.max(0, Number(
    order.driver_transfer_amount != null
      ? order.driver_transfer_amount
      : driverPaymentMethod === 'TRANSFER'
        ? orderAmount
        : driverPaymentMethod === 'CASH'
          ? 0
          : driverPaymentMethod === 'CASH_TRANSFER'
            ? orderAmount - Number(order.driver_cash_amount || 0)
            : ['TRANSFER', 'BANK_TRANSFER'].includes(paymentMethod)
              ? orderAmount
              : 0,
  ));

  return { cashAmount, transferAmount };
}

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
    // The derived assignment state must not override the raw final outcome.
    // This protects the queue from stale RPC/cache rows after a Runner accepts.
    && String(order.runner_accept_status || '').toUpperCase() !== 'ACCEPTED'
    && String(order.runner_review_status || '').toUpperCase() !== 'REVIEWED'
    // A legacy/inconsistent row can already have a final runner_status while
    // the Driver report is still waiting for Runner review. The assignment
    // source marks that row as PENDING_ACCEPTANCE, so the driver event remains
    // the source of truth until the Runner accepts or rejects it.
    && !NON_REVIEWABLE_RUNNER_STATUSES.has(String(order.runner_status || '').toUpperCase());
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
      cashOrderCount: 0,
      transferAmount: 0,
      transferOrderCount: 0,
    };
    const amount = Number(order.total_amount || 0);

    if (order.driver_status === 'DRIVER_DELIVERED') {
      group.deliveredOrders.push(order);
      group.deliveredAmount += amount;
      const payment = getDriverReportedPaymentComponents(order);
      group.cashAmount += payment.cashAmount;
      group.transferAmount += payment.transferAmount;
      if (payment.cashAmount > 0) group.cashOrderCount += 1;
      if (payment.transferAmount > 0) group.transferOrderCount += 1;
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
