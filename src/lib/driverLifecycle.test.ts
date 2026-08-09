import { describe, expect, it } from 'vitest';
import { getDriverLifecycleBucket, getEffectiveDriverAssignmentDate } from '@/lib/driverLifecycle';

describe('driver lifecycle', () => {
  it('keeps a Driver submission pending when legacy runner status is already final', () => {
    expect(getDriverLifecycleBucket({
      assignment_state: 'PENDING_ACCEPTANCE',
      driver_status: 'DRIVER_DELIVERED',
      runner_status: 'DELIVERED',
      runner_accept_status: 'PENDING',
      runner_review_status: 'NOT_REVIEWED',
    })).toBe('DRIVER_SUBMITTED_DELIVERED');
  });

  it('only treats an explicitly accepted Driver delivery as final', () => {
    expect(getDriverLifecycleBucket({
      assignment_state: 'PENDING_ACCEPTANCE',
      driver_status: 'DRIVER_DELIVERED',
      runner_status: 'DELIVERED',
      runner_accept_status: 'ACCEPTED',
      runner_review_status: 'REVIEWED',
    })).toBe('RUNNER_ACCEPTED_DELIVERED');
  });

  it('uses the effective assignment date supplied by the canonical source', () => {
    expect(getEffectiveDriverAssignmentDate({
      effective_assignment_date: '2026-08-08',
      driver_assigned_at: '2026-08-07T23:59:00.000Z',
      created_at: '2026-08-01T00:00:00.000Z',
    })).toBe('2026-08-08');
  });
});
