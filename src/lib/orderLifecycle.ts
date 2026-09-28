import { hasCurrentActionRequired, isRescheduledAction } from '@/lib/actionRequired';

export type CurrentOrderStatus = 'BOOKING' | 'READY' | 'DELIVERED' | 'CANCELLED' | 'ACTION_REQUIRED';
export type CurrentOrderTab = 'booking' | 'ready' | 'delivered' | 'cancelled' | 'action-required';

export function isCurrentOrderStatus(value: unknown): value is CurrentOrderStatus {
  return ['BOOKING', 'READY', 'ACTION_REQUIRED', 'DELIVERED', 'CANCELLED'].includes(
    String(value || '').trim().toUpperCase(),
  );
}

export interface CurrentOrderFields {
  id: string;
  order_code?: string | null;
  status?: string | null;
  operational_status?: string | null;
  current_operational_state?: CurrentOrderStatus | string | null;
  runner_status?: string | null;
  runner_review_status?: string | null;
  runner_final_outcome?: string | null;
  runner_comment?: string | null;
  runner_failed_reason_id?: string | null;
  salesperson_action_required?: boolean | null;
  salesperson_action_type?: string | null;
  next_delivery_date?: string | null;
  driver_next_delivery_date?: string | null;
  driver_failed_reason?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
}

export interface CurrentOrderState {
  currentStatus: CurrentOrderStatus;
  currentSubStatus: string | null;
  destinationTab: CurrentOrderTab;
  scheduledDate: string | null;
  actionReason: string | null;
}

function normalize(value?: string | null) {
  return String(value || '').trim().toUpperCase();
}

function getScheduledDate(order: CurrentOrderFields) {
  return order.next_delivery_date || order.driver_next_delivery_date || null;
}

function getActionReason(order: CurrentOrderFields) {
  if (isRescheduledAction(order)) return 'Rescheduled';
  if (normalize(order.runner_status) === 'FAILED_DELIVERY') return 'Failed delivery';
  if (order.runner_failed_reason_id || order.runner_comment) return 'Runner note';
  return 'Action required';
}

function getDestinationTab(status: CurrentOrderStatus): CurrentOrderTab {
  switch (status) {
    case 'ACTION_REQUIRED': return 'action-required';
    case 'READY': return 'ready';
    case 'DELIVERED': return 'delivered';
    case 'CANCELLED': return 'cancelled';
    default: return 'booking';
  }
}

/**
 * Resolve one current operational state from the live orders row.
 * Reschedule history and old delivery outcomes are audit data only.
 */
export function resolveCurrentOrderState(order: CurrentOrderFields): CurrentOrderState {
  const status = normalize(order.status);
  const operationalStatus = normalize(order.operational_status);
  const runnerStatus = normalize(order.runner_status);
  const scheduledDate = getScheduledDate(order);

  let currentStatus: CurrentOrderStatus;
  let currentSubStatus: string | null = null;
  let actionReason: string | null = null;

  const canonicalStatus = normalize(order.current_operational_state);
  if (['BOOKING', 'READY', 'ACTION_REQUIRED', 'DELIVERED', 'CANCELLED'].includes(canonicalStatus)) {
    currentStatus = canonicalStatus as CurrentOrderStatus;
    if (currentStatus === 'ACTION_REQUIRED') {
      actionReason = getActionReason(order);
      currentSubStatus = actionReason;
    }
  } else if (status === 'CANCELLED' || operationalStatus === 'CANCELLED') {
    currentStatus = 'CANCELLED';
  } else if (runnerStatus === 'DELIVERED' || operationalStatus === 'DELIVERED_FINAL') {
    currentStatus = 'DELIVERED';
  } else if (hasCurrentActionRequired(order)) {
    currentStatus = 'ACTION_REQUIRED';
    actionReason = getActionReason(order);
    currentSubStatus = actionReason;
  } else if (status === 'READY') {
    currentStatus = 'READY';
  } else {
    currentStatus = 'BOOKING';
  }

  if (currentStatus === 'BOOKING' && scheduledDate) {
    currentSubStatus = 'Ready on';
  }

  return {
    currentStatus,
    currentSubStatus,
    destinationTab: getDestinationTab(currentStatus),
    scheduledDate,
    actionReason,
  };
}
