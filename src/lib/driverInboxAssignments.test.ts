import { describe, expect, it } from 'vitest';
import {
  DRIVER_INBOX_ASSIGNMENT_STATES,
  DRIVER_VISIBLE_ASSIGNMENT_STATES,
  getDriverInboxAssignmentSection,
  getDriverInboxVisibleOrders,
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
      driver_status: 'ASSIGNED',
    })).toBe('ACTIVE');
  });

  it('keeps a submitted failed outcome visible until Runner review', () => {
    expect(getDriverInboxAssignmentSection({
      assignment_state: 'PENDING_ACCEPTANCE',
      driver_status: 'DRIVER_FAILED',
      runner_accept_status: 'PENDING',
    })).toBe('PENDING_FAILED');
  });

  it('keeps a submitted delivered outcome visible until Runner review', () => {
    expect(getDriverInboxAssignmentSection({
      assignment_state: 'PENDING_ACCEPTANCE',
      driver_status: 'DRIVER_DELIVERED',
      runner_accept_status: 'PENDING',
    })).toBe('PENDING_DELIVERED');
  });

  it('hides action-required orders from the Driver queue', () => {
    expect(getDriverInboxAssignmentSection({
      assignment_state: 'ACTIVE',
      driver_status: 'ASSIGNED',
      salesperson_action_required: true,
    })).toBeNull();
  });

  it('returns the exact visible order set used by the Driver Inbox and export', () => {
    const visible = getDriverInboxVisibleOrders([
      { id: 'active', assignment_state: 'ACTIVE', driver_status: 'ASSIGNED' },
      { id: 'delivered', assignment_state: 'PENDING_ACCEPTANCE', driver_status: 'DRIVER_DELIVERED' },
      { id: 'failed', assignment_state: 'PENDING_ACCEPTANCE', driver_status: 'DRIVER_FAILED' },
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
    'keeps an unreviewed Driver submission visible despite stale Runner status %s',
    (runnerStatus) => {
      expect(getDriverInboxAssignmentSection({
        assignment_state: 'PENDING_ACCEPTANCE',
        driver_status: 'DRIVER_FAILED',
        runner_status: runnerStatus,
        runner_accept_status: 'PENDING',
        runner_review_status: 'NOT_REVIEWED',
      })).toBe('PENDING_FAILED');
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
});
