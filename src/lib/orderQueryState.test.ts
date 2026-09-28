import { describe, expect, it } from 'vitest';
import { isOrdersQueryReady } from './orderQueryState';

describe('isOrdersQueryReady', () => {
  const base = {
    userId: 'user-1',
    role: 'manager' as const,
    scopeRequired: true,
  };

  it('waits for the authoritative profile', () => {
    expect(isOrdersQueryReady({ ...base, profileStatus: 'loading', scopeReady: true })).toBe(false);
  });

  it('waits for a required owner scope', () => {
    expect(isOrdersQueryReady({ ...base, profileStatus: 'ready', scopeReady: false })).toBe(false);
    expect(isOrdersQueryReady({ ...base, profileStatus: 'ready', scopeReady: true })).toBe(true);
  });

  it('does not require owner scope for admins', () => {
    expect(isOrdersQueryReady({
      userId: 'admin-1',
      role: 'admin',
      profileStatus: 'ready',
      scopeRequired: false,
      scopeReady: false,
    })).toBe(true);
  });
});
