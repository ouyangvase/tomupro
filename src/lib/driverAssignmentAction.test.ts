import { describe, expect, it } from 'vitest';
import { resolveDriverAssignmentAction } from '@/lib/driverAssignmentAction';

describe('resolveDriverAssignmentAction', () => {
  it('assigns orders that do not have a driver', () => {
    expect(resolveDriverAssignmentAction([
      { driver_id: null },
      { driver_id: null },
    ])).toBe('ASSIGN');
  });

  it('reassigns a batch when any selected order already has a driver', () => {
    expect(resolveDriverAssignmentAction([
      { driver_id: null },
      { driver_id: 'ming-driver-id' },
    ])).toBe('REASSIGN');
  });
});
