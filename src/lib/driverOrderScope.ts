export type DriverOrderScopeFields = {
  runner_id?: string | null;
  driver_id?: string | null;
  status?: string | null;
  current_operational_state?: string | null;
  operational_status?: string | null;
  driver_status?: string | null;
  runner_status?: string | null;
  runner_accept_status?: string | null;
  runner_review_status?: string | null;
  runner_final_outcome?: string | null;
  salesperson_action_required?: boolean | null;
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
  'DELIVERED_FINAL',
  'CANCELLED',
  'CANCELED',
  'APPROVED',
  'COMPLETED',
  'RETURNED',
  'REFUNDED',
]);

const FINAL_RUNNER_STATUSES = new Set([
  'DELIVERED',
  'FAILED_DELIVERY',
  'CANCELLED',
  'CANCELED',
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

export const DRIVER_VISIBLE_ASSIGNMENT_STATES = [
  'ACTIVE',
  'PENDING_ACCEPTANCE',
] as const;

export const DRIVER_INBOX_ASSIGNMENT_STATES = DRIVER_VISIBLE_ASSIGNMENT_STATES;

export type DriverInboxAssignmentSection =
  | 'ACTIVE'
  | 'PENDING_DELIVERED'
  | 'PENDING_FAILED';

const ACTION_REQUIRED_OUTCOMES = new Set([
  'NEED_SALESPERSON_FOLLOWUP',
]);

const CURRENT_RUNNER_ASSIGNMENT_STATUSES = new Set(['ASSIGNED', 'TAKEN']);

export function normalizeDriverStatus(value: string | null | undefined) {
  return String(value || '').trim().toUpperCase();
}

export function hasCurrentRunnerAssignment(order: DriverOrderScopeFields) {
  return Boolean(order.runner_id)
    && normalizeDriverStatus(order.current_operational_state) === 'READY'
    && CURRENT_RUNNER_ASSIGNMENT_STATUSES.has(normalizeDriverStatus(order.runner_status));
}

export function isRunnerDriverInboxOrder(order: DriverOrderScopeFields) {
  return hasCurrentRunnerAssignment(order) && !isHiddenFromDriverApps(order);
}

/**
 * A Driver submission remains current until the Runner explicitly processes it,
 * unless the canonical Runner status has already finalized the order.
 */
export function isPendingDriverOutcome(order: DriverOrderScopeFields) {
  const driverStatus = normalizeDriverStatus(order.driver_status);
  const runnerStatus = normalizeDriverStatus(order.runner_status);
  return (
    (order.driver_id === undefined || Boolean(order.driver_id))
    &&
    (driverStatus === 'DRIVER_DELIVERED' || driverStatus === 'DRIVER_FAILED')
    && !['CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'].includes(normalizeDriverStatus(order.status))
    && normalizeDriverStatus(order.runner_review_status) !== 'REVIEWED'
    && !FINAL_RUNNER_STATUSES.has(runnerStatus)
    && !['DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'].includes(normalizeDriverStatus(order.operational_status))
    && order.salesperson_action_required !== true
    && normalizeDriverStatus(order.runner_review_status) !== 'ACTION_REQUIRED'
    && normalizeDriverStatus(order.runner_final_outcome) !== 'NEED_SALESPERSON_FOLLOWUP'
  );
}

export function hasCurrentDriverAssignment(order: Pick<DriverOrderScopeFields, 'driver_id'>) {
  return Boolean(order.driver_id);
}

export function requiresDriverReview(order: DriverOrderScopeFields & {
  driver_review_status?: string | null;
}) {
  return isPendingDriverOutcome({
    ...order,
    driver_status: order.driver_review_status ?? order.driver_status,
  });
}

export function isRunnerDriverAssignmentCandidate(order: DriverOrderScopeFields) {
  return !isPendingDriverOutcome(order);
}

export function getDriverInboxAssignmentSection(order: DriverOrderScopeFields & {
  assignment_state?: string | null;
}): DriverInboxAssignmentSection | null {
  if (!hasCurrentRunnerAssignment(order)) return null;
  if (isHiddenFromDriverApps(order)) return null;
  const assignmentState = normalizeDriverStatus(order.assignment_state);
  if (assignmentState === 'ACTIVE') return 'ACTIVE';
  if (assignmentState !== 'PENDING_ACCEPTANCE') return null;

  const driverStatus = normalizeDriverStatus(order.driver_status);
  if (driverStatus === 'DRIVER_DELIVERED') return 'PENDING_DELIVERED';
  if (driverStatus === 'DRIVER_FAILED') return 'PENDING_FAILED';
  return null;
}

export function getDriverInboxVisibleOrders<
  T extends DriverOrderScopeFields & { assignment_state?: string | null },
>(orders: T[]) {
  return orders.filter((order) => getDriverInboxAssignmentSection(order) !== null);
}

export function isFinalRunnerAssignment(order: DriverOrderScopeFields) {
  return FINAL_RUNNER_STATUSES.has(normalizeDriverStatus(order.runner_status));
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

export function isDriverOperationalDateDue(
  order: DriverOrderScopeFields,
  targetDateKey = getTodayDateKey(),
) {
  const operationalDateKey = getDriverOperationalDateKey(order);
  return !operationalDateKey || !targetDateKey || operationalDateKey <= targetDateKey;
}

export function isHiddenFromDriverApps(order: DriverOrderScopeFields) {
  if (isPendingDriverOutcome(order)) return false;

  return (
    FINAL_DRIVER_HIDDEN_STATUSES.has(normalizeDriverStatus(order.status))
    || FINAL_DRIVER_HIDDEN_STATUSES.has(normalizeDriverStatus(order.operational_status))
    || FINAL_DRIVER_HIDDEN_STATUSES.has(normalizeDriverStatus(order.runner_status))
    || FINAL_DRIVER_HIDDEN_STATUSES.has(normalizeDriverStatus(order.driver_status))
    || order.salesperson_action_required === true
    || normalizeDriverStatus(order.runner_review_status) === 'ACTION_REQUIRED'
    || ACTION_REQUIRED_OUTCOMES.has(normalizeDriverStatus(order.runner_final_outcome))
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
    hasCurrentRunnerAssignment(order)
    && normalizeDriverStatus(order.status) === 'READY'
    && DRIVER_VISIBLE_STATUSES.includes(normalizeDriverStatus(order.driver_status) as typeof DRIVER_VISIBLE_STATUSES[number])
  );
}

export function isSameDriverOperationalDate(order: DriverOrderScopeFields, targetDateKey = getTodayDateKey()) {
  const orderDateKey = getDriverOperationalDateKey(order);
  return Boolean(orderDateKey && targetDateKey && orderDateKey === targetDateKey);
}

export function isVisibleDriverInboxOrder(order: DriverOrderScopeFields, targetDateKey = getTodayDateKey()) {
  const orderDateKey = getDriverOperationalDateKey(order);
  return (
    hasDriverVisibleActiveStatus(order)
    && !isHiddenFromDriverApps(order)
    && Boolean(orderDateKey && targetDateKey && orderDateKey <= targetDateKey)
  );
}

export function isDriverWorkloadOrder(order: DriverOrderScopeFields, targetDateKey = getTodayDateKey()) {
  const orderDateKey = getDriverOperationalDateKey(order);
  return (
    hasCurrentRunnerAssignment(order)
    && normalizeDriverStatus(order.status) === 'READY'
    && DRIVER_WORKLOAD_STATUSES.includes(normalizeDriverStatus(order.driver_status) as typeof DRIVER_WORKLOAD_STATUSES[number])
    && !isHiddenFromDriverApps(order)
    && Boolean(orderDateKey && targetDateKey && orderDateKey <= targetDateKey)
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
