import type { Order } from '@/types/database';

export const CANONICAL_ACTION_REQUIRED_OR =
  'and(salesperson_action_required.eq.true,runner_status.neq.DELIVERED),and(runner_review_status.eq.ACTION_REQUIRED,runner_status.neq.DELIVERED),and(runner_final_outcome.eq.NEED_SALESPERSON_FOLLOWUP,runner_status.neq.DELIVERED),and(runner_status.eq.FAILED_DELIVERY,status.eq.READY)';

// Older orders may still have NULL in this nullable legacy column. NULL means
// no explicit salesperson action marker, so active-order lists must keep it.
export const NOT_ACTION_REQUIRED_OR =
  'salesperson_action_required.eq.false,salesperson_action_required.is.null';

export interface CurrentActionRequiredFields {
  status?: string | null;
  runner_status?: string | null;
  runner_review_status?: string | null;
  runner_final_outcome?: string | null;
  salesperson_action_required?: boolean | null;
}

/**
 * The same current-order predicate used by the Action Required list query.
 * Historical outcomes alone must not make an order actionable.
 */
export function hasCurrentActionRequired(order: CurrentActionRequiredFields) {
  return Boolean(
    order.salesperson_action_required === true
      || String(order.runner_review_status || '').trim().toUpperCase() === 'ACTION_REQUIRED'
      || String(order.runner_final_outcome || '').trim().toUpperCase() === 'NEED_SALESPERSON_FOLLOWUP'
      || (
        String(order.runner_status || '').trim().toUpperCase() === 'FAILED_DELIVERY'
        && String(order.status || '').trim().toUpperCase() === 'READY'
      ),
  );
}

export function hasPendingSalespersonAction(
  order: Pick<Order, 'salesperson_action_required' | 'runner_review_status' | 'runner_final_outcome'>,
) {
  return Boolean(
    order.salesperson_action_required === true
      || String(order.runner_review_status || '').trim().toUpperCase() === 'ACTION_REQUIRED'
      || String(order.runner_final_outcome || '').trim().toUpperCase() === 'NEED_SALESPERSON_FOLLOWUP',
  );
}

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
