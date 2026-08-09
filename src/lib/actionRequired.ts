import type { Order } from '@/types/database';

export const CANONICAL_ACTION_REQUIRED_OR =
  'and(salesperson_action_required.eq.true,runner_status.neq.DELIVERED),and(runner_status.eq.FAILED_DELIVERY,status.eq.READY)';

export type ActionRequiredClassification =
  | 'FAILED_DELIVERY'
  | 'RESCHEDULED'
  | 'RUNNER_FLAGGED'
  | 'MANUAL';

const RESCHEDULE_REASON_LABELS = new Set([
  'delivery tomorrow',
  'customer requested reschedule',
  'customer reschedule',
]);

export function isRescheduledAction(order: Pick<Order, 'next_delivery_date' | 'driver_next_delivery_date' | 'salesperson_action_type' | 'runner_final_outcome' | 'driver_failed_reason'>): boolean {
  const reason = order.driver_failed_reason?.trim().toLowerCase();
  return Boolean(
    order.next_delivery_date
      || order.driver_next_delivery_date
      || order.salesperson_action_type === 'RESCHEDULE_DELIVERY'
      || order.runner_final_outcome === 'RESCHEDULE'
      || (reason && RESCHEDULE_REASON_LABELS.has(reason)),
  );
}

export function classifyActionRequired(order: Pick<Order, 'runner_status' | 'next_delivery_date' | 'driver_next_delivery_date' | 'salesperson_action_type' | 'runner_final_outcome' | 'driver_failed_reason' | 'runner_failed_reason_id' | 'runner_comment'>): ActionRequiredClassification {
  if (isRescheduledAction(order)) return 'RESCHEDULED';
  if (order.runner_status === 'FAILED_DELIVERY') return 'FAILED_DELIVERY';
  if (order.runner_failed_reason_id || order.runner_comment) return 'RUNNER_FLAGGED';
  return 'MANUAL';
}
