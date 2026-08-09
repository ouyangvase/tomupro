import {
  isPendingDriverOutcome,
  normalizeDriverStatus,
  toDateKey,
  type DriverOrderScopeFields,
} from '@/lib/driverOrderScope';

export type DriverLifecycleOrder = DriverOrderScopeFields & {
  assignment_state?: string | null;
  effective_assignment_date?: string | null;
  assignment_timestamp?: string | null;
  driver_assigned_at?: string | null;
  total_amount?: number | null;
};

export type DriverLifecycleBucket =
  | 'ASSIGNED_ACTIVE'
  | 'DRIVER_SUBMITTED_DELIVERED'
  | 'DRIVER_SUBMITTED_FAILED'
  | 'RUNNER_ACCEPTED_DELIVERED'
  | 'RUNNER_ACCEPTED_FAILED'
  | 'INACTIVE';

export function getEffectiveDriverAssignmentDate(order: DriverLifecycleOrder) {
  const metadataDate = toDateKey(order.effective_assignment_date);
  if (metadataDate) return metadataDate;

  return toDateKey(order.driver_assigned_at)
    || toDateKey(order.assignment_timestamp)
    || toDateKey(order.runner_assigned_at)
    || toDateKey(order.created_at);
}

export function getDriverLifecycleBucket(order: DriverLifecycleOrder): DriverLifecycleBucket {
  const driverStatus = normalizeDriverStatus(order.driver_status);

  if (isPendingDriverOutcome(order)) {
    return driverStatus === 'DRIVER_DELIVERED'
      ? 'DRIVER_SUBMITTED_DELIVERED'
      : 'DRIVER_SUBMITTED_FAILED';
  }

  if (driverStatus === 'DRIVER_DELIVERED'
    && normalizeDriverStatus(order.runner_accept_status) === 'ACCEPTED'
    && normalizeDriverStatus(order.runner_status) === 'DELIVERED') {
    return 'RUNNER_ACCEPTED_DELIVERED';
  }

  if (driverStatus === 'DRIVER_FAILED'
    && normalizeDriverStatus(order.runner_accept_status) === 'ACCEPTED'
    && normalizeDriverStatus(order.runner_status) === 'FAILED_DELIVERY') {
    return 'RUNNER_ACCEPTED_FAILED';
  }

  if (order.assignment_state === 'ACTIVE') return 'ASSIGNED_ACTIVE';
  return 'INACTIVE';
}

export function isCurrentDriverWorkload(order: DriverLifecycleOrder) {
  const bucket = getDriverLifecycleBucket(order);
  return bucket === 'ASSIGNED_ACTIVE'
    || bucket === 'DRIVER_SUBMITTED_DELIVERED'
    || bucket === 'DRIVER_SUBMITTED_FAILED';
}

export function isRunnerAcceptedDelivered(order: DriverLifecycleOrder) {
  return getDriverLifecycleBucket(order) === 'RUNNER_ACCEPTED_DELIVERED';
}
