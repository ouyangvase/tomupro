import { describe, expect, it } from 'vitest';
import { hasCurrentDriverAssignment, requiresDriverReview } from './driverOrderScope';

const baseOrder = {
  runner_id: 'runner-1',
  driver_id: 'driver-1',
  status: 'READY',
  current_operational_state: 'READY',
  operational_status: 'NEW',
  runner_status: 'ASSIGNED',
  runner_accept_status: 'PENDING',
  runner_review_status: 'NOT_REVIEWED',
  runner_final_outcome: null,
  salesperson_action_required: false,
  driver_status: 'ASSIGNED',
};

describe('requiresDriverReview', () => {
  it('recognizes a current Driver assignment before a Driver result exists', () => {
    expect(hasCurrentDriverAssignment(baseOrder)).toBe(true);
    expect(hasCurrentDriverAssignment({ ...baseOrder, driver_id: null })).toBe(false);
  });

  it('blocks a stale Runner Inbox delivery action when the current Driver result is pending', () => {
    expect(requiresDriverReview({
      ...baseOrder,
      driver_review_status: 'DRIVER_DELIVERED',
    })).toBe(true);
  });

  it('still requires review when Runner acceptance predates the Driver result', () => {
    expect(requiresDriverReview({
      ...baseOrder,
      runner_accept_status: 'ACCEPTED',
      runner_status: 'TAKEN',
      driver_review_status: 'DRIVER_FAILED',
    })).toBe(true);
  });

  it('does not block once the Driver assignment has been released', () => {
    expect(requiresDriverReview({
      ...baseOrder,
      driver_id: null,
      driver_review_status: 'DRIVER_DELIVERED',
    })).toBe(false);
  });

  it('does not block an already reviewed Driver result', () => {
    expect(requiresDriverReview({
      ...baseOrder,
      runner_accept_status: 'ACCEPTED',
      runner_status: 'DELIVERED',
      driver_review_status: 'DRIVER_DELIVERED',
    })).toBe(false);
  });
});
