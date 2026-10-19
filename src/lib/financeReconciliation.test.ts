import { describe, expect, it } from 'vitest';
import { calculateClaimGross, calculateReconciliation, isLatestThreeCalendarDays } from './financeReconciliation';

describe('finance reconciliation rules', () => {
  it('allows only today and the previous two Brunei calendar days', () => {
    const today = new Date('2026-10-20T01:00:00+08:00');
    expect(isLatestThreeCalendarDays('2026-10-20', today)).toBe(true);
    expect(isLatestThreeCalendarDays('2026-10-19', today)).toBe(true);
    expect(isLatestThreeCalendarDays('2026-10-18', today)).toBe(true);
    expect(isLatestThreeCalendarDays('2026-10-17', today)).toBe(false);
    expect(isLatestThreeCalendarDays('2026-10-21', today)).toBe(false);
  });

  it('requires cash plus CDM to equal accepted cash', () => {
    expect(calculateReconciliation(448, 300, 148)).toEqual({ declared: 448, difference: 0, balanced: true });
    expect(calculateReconciliation(448, 300, 100).balanced).toBe(false);
    expect(calculateReconciliation(0, 0, 0).balanced).toBe(true);
  });

  it('computes claim gross and rejects OUT above the selected total', () => {
    expect(calculateClaimGross(1000, 250)).toBe(750);
    expect(calculateClaimGross(1000, 1000)).toBe(0);
    expect(calculateClaimGross(1000, 1001)).toBeNull();
  });
});
