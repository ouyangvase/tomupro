import { describe, expect, it } from 'vitest';
import { CANONICAL_ACTION_REQUIRED_OR, classifyActionRequired } from './actionRequired';

describe('canonical Action Required classification', () => {
  it('keeps the Orders-tab predicate shared by every consumer', () => {
    expect(CANONICAL_ACTION_REQUIRED_OR).toBe(
      'and(salesperson_action_required.eq.true,runner_status.neq.DELIVERED),and(runner_status.eq.FAILED_DELIVERY,status.eq.READY)',
    );
  });

  it('classifies reschedule before failed delivery', () => {
    expect(classifyActionRequired({
      runner_status: 'FAILED_DELIVERY',
      next_delivery_date: '2026-08-10',
      driver_next_delivery_date: null,
      salesperson_action_type: null,
      runner_final_outcome: null,
      driver_failed_reason: 'Customer not available',
      runner_failed_reason_id: null,
      runner_comment: null,
    })).toBe('RESCHEDULED');
  });

  it('does not turn an ordinary failed delivery into a reschedule', () => {
    expect(classifyActionRequired({
      runner_status: 'FAILED_DELIVERY',
      next_delivery_date: null,
      driver_next_delivery_date: null,
      salesperson_action_type: null,
      runner_final_outcome: 'CONFIRM_FAILED',
      driver_failed_reason: 'Customer not available',
      runner_failed_reason_id: null,
      runner_comment: null,
    })).toBe('FAILED_DELIVERY');
  });
});
