import { describe, expect, it } from 'vitest';
import type { AppRole } from '@/types/database';
import { canAccessPerformance } from './performanceAccess';

describe('canAccessPerformance', () => {
  it('keeps Performance available to admins when the UI is hidden', () => {
    expect(canAccessPerformance('admin', true)).toBe(true);
  });

  it('blocks every non-admin role when the UI is hidden', () => {
    const nonAdminRoles: AppRole[] = [
      'manager',
      'salesperson',
      'runner',
      'driver',
      'runner_assistant',
      'finance_viewer',
      'user',
    ];

    nonAdminRoles.forEach((role) => {
      expect(canAccessPerformance(role, true)).toBe(false);
    });
  });

  it('allows signed-in roles when the UI is not hidden', () => {
    expect(canAccessPerformance('salesperson', false)).toBe(true);
    expect(canAccessPerformance('runner', false)).toBe(true);
  });

  it('does not allow access before the user role is known', () => {
    expect(canAccessPerformance(null, false)).toBe(false);
  });
});
