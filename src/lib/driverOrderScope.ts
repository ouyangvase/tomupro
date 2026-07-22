export type DriverOrderScopeFields = {
  driver_status?: string | null;
  runner_status?: string | null;
  runner_accept_status?: string | null;
};

export const DRIVER_VISIBLE_STATUSES = [
  'ASSIGNED',
  'OUT_FOR_DELIVERY',
  'DRIVER_DELIVERED',
  'DRIVER_FAILED',
] as const;

export const DRIVER_WORKLOAD_STATUSES = [
  'ASSIGNED',
  'OUT_FOR_DELIVERY',
  'DRIVER_DELIVERED',
] as const;

export function isRunnerDeliveredOutsideDriverFlow(order: DriverOrderScopeFields) {
  return order.runner_status === 'DELIVERED' && order.driver_status !== 'DRIVER_DELIVERED';
}

export function isCompletedDriverDeliveryAccepted(order: DriverOrderScopeFields) {
  return order.driver_status === 'DRIVER_DELIVERED' && order.runner_accept_status === 'ACCEPTED';
}

export function isVisibleDriverInboxOrder(order: DriverOrderScopeFields) {
  return (
    DRIVER_VISIBLE_STATUSES.includes((order.driver_status || '') as typeof DRIVER_VISIBLE_STATUSES[number])
    && !isRunnerDeliveredOutsideDriverFlow(order)
    && !isCompletedDriverDeliveryAccepted(order)
  );
}

export function isDriverWorkloadOrder(order: DriverOrderScopeFields) {
  return (
    DRIVER_WORKLOAD_STATUSES.includes((order.driver_status || '') as typeof DRIVER_WORKLOAD_STATUSES[number])
    && !isRunnerDeliveredOutsideDriverFlow(order)
    && !isCompletedDriverDeliveryAccepted(order)
  );
}
