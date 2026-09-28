import { describe, expect, it } from 'vitest';
import {
  DRIVER_INBOX_ASSIGNMENT_STATES,
  DRIVER_VISIBLE_ASSIGNMENT_STATES,
  getDriverInboxAssignmentSection,
  getDriverInboxVisibleOrders,
  isDriverOperationalDateDue,
  isRunnerDriverInboxOrder,
  isRunnerDriverAssignmentCandidate,
} from '@/lib/driverOrderScope';

describe('driver-visible assignment states', () => {
  it('requests active work and unreviewed driver outcomes from the shared source', () => {
    expect(DRIVER_VISIBLE_ASSIGNMENT_STATES).toEqual(['ACTIVE', 'PENDING_ACCEPTANCE']);
    expect(DRIVER_INBOX_ASSIGNMENT_STATES).toBe(DRIVER_VISIBLE_ASSIGNMENT_STATES);
  });
});

describe('getDriverInboxAssignmentSection', () => {
  it('keeps active assignments in the delivery queue', () => {
    expect(getDriverInboxAssignmentSection({
      assignment_state: 'ACTIVE',
      runner_id: 'runner-1',
      current_operational_state: 'READY',
      driver_status: 'ASSIGNED',
      runner_status: 'ASSIGNED',
    })).toBe('ACTIVE');
  });

  it('keeps a submitted failed outcome visible until Runner review', () => {
    expect(getDriverInboxAssignmentSection({
      assignment_state: 'PENDING_ACCEPTANCE',
      runner_id: 'runner-1',
      current_operational_state: 'READY',
      driver_status: 'DRIVER_FAILED',
      runner_status: 'ASSIGNED',
      runner_accept_status: 'PENDING',
    })).toBe('PENDING_FAILED');
  });

  it('keeps a submitted delivered outcome visible until Runner review', () => {
    expect(getDriverInboxAssignmentSection({
      assignment_state: 'PENDING_ACCEPTANCE',
      runner_id: 'runner-1',
      current_operational_state: 'READY',
      driver_status: 'DRIVER_DELIVERED',
      runner_status: 'ASSIGNED',
      runner_accept_status: 'PENDING',
    })).toBe('PENDING_DELIVERED');
  });

  it('hides action-required orders from the Driver queue', () => {
    expect(getDriverInboxAssignmentSection({
      assignment_state: 'ACTIVE',
      runner_id: 'runner-1',
      current_operational_state: 'READY',
      driver_status: 'ASSIGNED',
      runner_status: 'ASSIGNED',
      salesperson_action_required: true,
    })).toBeNull();
  });

  it('returns the exact visible order set used by the Driver Inbox and export', () => {
    const visible = getDriverInboxVisibleOrders([
      { id: 'active', assignment_state: 'ACTIVE', runner_id: 'runner-1', current_operational_state: 'READY', runner_status: 'ASSIGNED', driver_status: 'ASSIGNED' },
      { id: 'delivered', assignment_state: 'PENDING_ACCEPTANCE', runner_id: 'runner-1', current_operational_state: 'READY', runner_status: 'ASSIGNED', driver_status: 'DRIVER_DELIVERED' },
      { id: 'failed', assignment_state: 'PENDING_ACCEPTANCE', runner_id: 'runner-1', current_operational_state: 'READY', runner_status: 'ASSIGNED', driver_status: 'DRIVER_FAILED' },
      { id: 'cancelled', assignment_state: 'ACTIVE', driver_status: 'ASSIGNED', status: 'CANCELLED' },
    ]);

    expect(visible.map((order) => order.id)).toEqual(['active', 'delivered', 'failed']);
  });

  it.each(['DELIVERED', 'FAILED', 'INACTIVE'])(
    'does not show finalized assignment state %s',
    (assignmentState) => {
      expect(getDriverInboxAssignmentSection({
        assignment_state: assignmentState,
        driver_status: 'DRIVER_FAILED',
      })).toBeNull();
    },
  );

  it.each(['DELIVERED', 'FAILED_DELIVERY'])(
    'hides a Driver submission after canonical Runner status %s',
    (runnerStatus) => {
      expect(getDriverInboxAssignmentSection({
        assignment_state: 'PENDING_ACCEPTANCE',
        driver_status: 'DRIVER_FAILED',
        runner_status: runnerStatus,
        runner_accept_status: 'PENDING',
        runner_review_status: 'NOT_REVIEWED',
      })).toBeNull();
    },
  );

  it('does not revive a cancelled Driver submission', () => {
    expect(getDriverInboxAssignmentSection({
      assignment_state: 'PENDING_ACCEPTANCE',
      driver_status: 'DRIVER_FAILED',
      runner_status: 'CANCELLED',
      runner_accept_status: 'PENDING',
      runner_review_status: 'NOT_REVIEWED',
    })).toBeNull();
  });

  it('does not revive a Driver submission when the order itself is cancelled', () => {
    expect(getDriverInboxAssignmentSection({
      assignment_state: 'PENDING_ACCEPTANCE',
      driver_status: 'DRIVER_FAILED',
      status: 'CANCELLED',
      runner_status: 'UNASSIGNED',
      runner_accept_status: 'PENDING',
      runner_review_status: 'NOT_REVIEWED',
    })).toBeNull();
  });

  it('does not show a finalized delivered order even if an old RPC labels it active', () => {
    expect(getDriverInboxAssignmentSection({
      assignment_state: 'ACTIVE',
      driver_status: 'ASSIGNED',
      runner_status: 'DELIVERED',
    })).toBeNull();
  });

  it('hides an order after its Runner assignment is removed', () => {
    expect(getDriverInboxAssignmentSection({
      assignment_state: 'PENDING_ACCEPTANCE',
      runner_id: null,
      current_operational_state: 'READY',
      runner_status: 'UNASSIGNED',
      driver_status: 'DRIVER_DELIVERED',
      runner_accept_status: 'PENDING',
    })).toBeNull();
  });

  it('hides non-READY Driver work even when legacy fields look active', () => {
    expect(getDriverInboxAssignmentSection({
      assignment_state: 'ACTIVE',
      runner_id: 'runner-1',
      current_operational_state: 'ACTION_REQUIRED',
      runner_status: 'ASSIGNED',
      driver_status: 'ASSIGNED',
    })).toBeNull();
  });
});

describe('isDriverOperationalDateDue', () => {
  it('keeps today and overdue work in the active queue', () => {
    expect(isDriverOperationalDateDue({ next_delivery_date: '2026-08-15' }, '2026-08-15')).toBe(true);
    expect(isDriverOperationalDateDue({ next_delivery_date: '2026-08-14' }, '2026-08-15')).toBe(true);
  });

  it('does not expose a future reschedule in today\'s queue', () => {
    expect(isDriverOperationalDateDue({ next_delivery_date: '2026-08-18' }, '2026-08-15')).toBe(false);
  });
});

describe('isRunnerDriverAssignmentCandidate', () => {
  it('keeps pending Driver reports out of the assignable Runner queue', () => {
    expect(isRunnerDriverAssignmentCandidate({
      driver_status: 'DRIVER_FAILED',
      runner_accept_status: 'PENDING',
      runner_review_status: 'NOT_REVIEWED',
      runner_status: 'TAKEN',
    })).toBe(false);
  });

  it('keeps normal active Driver work assignable', () => {
    expect(isRunnerDriverAssignmentCandidate({
      driver_status: 'ASSIGNED',
      runner_status: 'TAKEN',
    })).toBe(true);
  });

  it('does not block a new Runner cycle after the Driver assignment is released', () => {
    expect(isRunnerDriverAssignmentCandidate({
      driver_id: null,
      driver_status: 'DRIVER_FAILED',
      runner_accept_status: 'PENDING',
      runner_review_status: 'NOT_REVIEWED',
      runner_status: 'TAKEN',
    })).toBe(true);
  });
});

describe('isRunnerDriverInboxOrder', () => {
  it('keeps a READY order with no Driver visible for Runner assignment', () => {
    expect(isRunnerDriverInboxOrder({
      runner_id: 'runner-1',
      current_operational_state: 'READY',
      runner_status: 'ASSIGNED',
      driver_id: null,
      driver_status: 'UNASSIGNED',
    })).toBe(true);
  });

  it('does not show an order after its Runner assignment is removed', () => {
    expect(isRunnerDriverInboxOrder({
      runner_id: null,
      current_operational_state: 'READY',
      runner_status: 'UNASSIGNED',
      driver_id: null,
      driver_status: 'UNASSIGNED',
    })).toBe(false);
  });
});
