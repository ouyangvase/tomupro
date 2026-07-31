import { describe, expect, it } from 'vitest';
import { getDriverInboxAssignmentSection } from '@/lib/driverOrderScope';

describe('getDriverInboxAssignmentSection', () => {
  it('keeps active assignments in the delivery queue', () => {
    expect(getDriverInboxAssignmentSection({
      assignment_state: 'ACTIVE',
      driver_status: 'ASSIGNED',
    })).toBe('ACTIVE');
  });

  it('keeps unreviewed failed outcomes visible for proof uploads or correction', () => {
    expect(getDriverInboxAssignmentSection({
      assignment_state: 'PENDING_ACCEPTANCE',
      driver_status: 'DRIVER_FAILED',
      runner_accept_status: 'PENDING',
    })).toBe('PENDING_FAILED');
  });

  it('keeps unreviewed delivered outcomes visible while awaiting Runner acceptance', () => {
    expect(getDriverInboxAssignmentSection({
      assignment_state: 'PENDING_ACCEPTANCE',
      driver_status: 'DRIVER_DELIVERED',
      runner_accept_status: 'PENDING',
    })).toBe('PENDING_DELIVERED');
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
});
