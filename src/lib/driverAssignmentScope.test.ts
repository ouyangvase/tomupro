import { describe, expect, it } from 'vitest';
import { getActiveDriverAssignmentIds, getAssignableDriverIdsForRunners } from './driverAssignmentScope';

describe('getAssignableDriverIdsForRunners', () => {
  it('excludes a driver that is only visible through a stale assignment', () => {
    expect(Array.from(getAssignableDriverIdsForRunners([
      { runner_id: 'runner-1', driver_id: 'driver-linked' },
      { runner_id: 'runner-1', driver_id: 'driver-inactive', is_active: false },
    ], ['runner-1']))).toEqual(['driver-linked']);
  });

  it('requires a link to every selected order runner', () => {
    const links = [
      { runner_id: 'runner-1', driver_id: 'driver-both' },
      { runner_id: 'runner-2', driver_id: 'driver-both' },
      { runner_id: 'runner-1', driver_id: 'driver-one' },
    ];

    expect(Array.from(getAssignableDriverIdsForRunners(links, ['runner-1', 'runner-2'])))
      .toEqual(['driver-both']);
  });

  it('returns every active linked driver when no order runner is selected', () => {
    expect(Array.from(getAssignableDriverIdsForRunners([
      { runner_id: 'runner-1', driver_id: 'driver-1' },
      { runner_id: 'runner-2', driver_id: 'driver-2' },
    ], []))).toEqual(['driver-1', 'driver-2']);
  });
});

describe('getActiveDriverAssignmentIds', () => {
  it('excludes pending Driver outcomes from active workload counts', () => {
    expect(Array.from(getActiveDriverAssignmentIds([
      { id: 'active-order', is_active_assignment: true },
      { id: 'pending-failed-order', is_active_assignment: false },
      { id: 'missing-flag-order' },
    ]))).toEqual(['active-order']);
  });
});
