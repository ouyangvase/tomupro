import { describe, expect, it } from 'vitest';
import { CANONICAL_ACTION_REQUIRED_OR, NOT_ACTION_REQUIRED_OR, classifyActionRequired, hasPendingSalespersonAction } from './actionRequired';

describe('canonical Action Required classification', () => {
  it('keeps the Orders-tab predicate shared by every consumer', () => {
    expect(CANONICAL_ACTION_REQUIRED_OR).toBe(
      'and(salesperson_action_required.eq.true,runner_status.neq.DELIVERED),and(runner_review_status.eq.ACTION_REQUIRED,runner_status.neq.DELIVERED),and(runner_final_outcome.eq.NEED_SALESPERSON_FOLLOWUP,runner_status.neq.DELIVERED),and(runner_status.eq.FAILED_DELIVERY,status.eq.READY)',
    );
  });

  it('keeps legacy NULL action flags in active order lists', () => {
    expect(NOT_ACTION_REQUIRED_OR).toBe(
      'salesperson_action_required.eq.false,salesperson_action_required.is.null',
    );
  });

  it('treats every explicit salesperson-action marker as pending action', () => {
    expect(hasPendingSalespersonAction({
      salesperson_action_required: true,
      runner_review_status: 'REVIEWED',
      runner_final_outcome: 'RESCHEDULE',
    })).toBe(true);
    expect(hasPendingSalespersonAction({
      salesperson_action_required: false,
      runner_review_status: 'ACTION_REQUIRED',
      runner_final_outcome: null,
    })).toBe(true);
    expect(hasPendingSalespersonAction({
      salesperson_action_required: false,
      runner_review_status: 'REVIEWED',
      runner_final_outcome: 'CONFIRM_DELIVERED',
    })).toBe(false);
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
