export type DriverOrderScopeFields = {
  status?: string | null;
  driver_status?: string | null;
  runner_status?: string | null;
  runner_accept_status?: string | null;
  order_date?: string | null;
  expected_pickup_date?: string | null;
  next_delivery_date?: string | null;
  runner_assigned_at?: string | null;
  created_at?: string | null;
};

const FINAL_DRIVER_HIDDEN_STATUSES = new Set([
  'DELIVERED',
  'FAILED',
  'FAILED_DELIVERY',
  'DRIVER_DELIVERED',
  'DRIVER_FAILED',
  'CANCELLED',
  'CANCELED',
  'APPROVED',
  'COMPLETED',
  'RETURNED',
  'REFUNDED',
]);

export const DRIVER_VISIBLE_STATUSES = [
  'ASSIGNED',
  'OUT_FOR_DELIVERY',
] as const;

export const DRIVER_WORKLOAD_STATUSES = [
  'ASSIGNED',
  'OUT_FOR_DELIVERY',
] as const;

export function normalizeDriverStatus(value: string | null | undefined) {
  return String(value || '').trim().toUpperCase();
}

export function toDateKey(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  }

  const raw = String(value).trim();
  if (!raw) return null;
  const directDate = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directDate) return directDate[1];

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDateKey(parsed);
}

export function getTodayDateKey(now = new Date()) {
  return toDateKey(now) || '';
}

export function getDriverOperationalDateKey(order: DriverOrderScopeFields) {
  return (
    toDateKey(order.next_delivery_date)
    || toDateKey(order.expected_pickup_date)
    || toDateKey(order.order_date)
    || toDateKey(order.runner_assigned_at)
    || toDateKey(order.created_at)
  );
}

export function isHiddenFromDriverApps(order: DriverOrderScopeFields) {
  return (
    FINAL_DRIVER_HIDDEN_STATUSES.has(normalizeDriverStatus(order.status))
    || FINAL_DRIVER_HIDDEN_STATUSES.has(normalizeDriverStatus(order.runner_status))
    || FINAL_DRIVER_HIDDEN_STATUSES.has(normalizeDriverStatus(order.driver_status))
  );
}

export function isRunnerDeliveredOutsideDriverFlow(order: DriverOrderScopeFields) {
  return normalizeDriverStatus(order.runner_status) === 'DELIVERED' && normalizeDriverStatus(order.driver_status) !== 'DRIVER_DELIVERED';
}

export function isCompletedDriverDeliveryAccepted(order: DriverOrderScopeFields) {
  return normalizeDriverStatus(order.driver_status) === 'DRIVER_DELIVERED' && normalizeDriverStatus(order.runner_accept_status) === 'ACCEPTED';
}

export function hasDriverVisibleActiveStatus(order: DriverOrderScopeFields) {
  return (
    DRIVER_VISIBLE_STATUSES.includes(normalizeDriverStatus(order.driver_status) as typeof DRIVER_VISIBLE_STATUSES[number])
  );
}

export function isSameDriverOperationalDate(order: DriverOrderScopeFields, targetDateKey = getTodayDateKey()) {
  const orderDateKey = getDriverOperationalDateKey(order);
  return Boolean(orderDateKey && targetDateKey && orderDateKey === targetDateKey);
}

export function isVisibleDriverInboxOrder(order: DriverOrderScopeFields, targetDateKey = getTodayDateKey()) {
  return (
    hasDriverVisibleActiveStatus(order)
    && !isHiddenFromDriverApps(order)
    && isSameDriverOperationalDate(order, targetDateKey)
  );
}

export function isDriverWorkloadOrder(order: DriverOrderScopeFields, targetDateKey = getTodayDateKey()) {
  return (
    DRIVER_WORKLOAD_STATUSES.includes(normalizeDriverStatus(order.driver_status) as typeof DRIVER_WORKLOAD_STATUSES[number])
    && !isHiddenFromDriverApps(order)
    && isSameDriverOperationalDate(order, targetDateKey)
  );
}

export function isStaleActiveDriverAssignment(order: DriverOrderScopeFields, currentDateKey = getTodayDateKey()) {
  const orderDateKey = getDriverOperationalDateKey(order);
  return (
    hasDriverVisibleActiveStatus(order)
    && !isHiddenFromDriverApps(order)
    && Boolean(orderDateKey && currentDateKey && orderDateKey < currentDateKey)
  );
}
