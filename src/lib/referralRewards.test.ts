import { describe, expect, it } from 'vitest';
import {
  buildReferralUrl,
  countDirectReferralPoints,
  getCurrentMonthRebate,
  getReferralProgress,
  isReferralEligibleRole,
} from './referralRewards';

const tiers = [
  { min_points: 0, rebate_percent: 0 },
  { min_points: 500, rebate_percent: 2 },
  { min_points: 1000, rebate_percent: 5 },
  { min_points: 2000, rebate_percent: 10 },
];

describe('referral reward progress', () => {
  it('is available only to manager and salesperson roles', () => {
    expect(isReferralEligibleRole('manager')).toBe(true);
    expect(isReferralEligibleRole('salesperson')).toBe(true);
    expect(isReferralEligibleRole('runner')).toBe(false);
    expect(isReferralEligibleRole('runner_assistant')).toBe(false);
    expect(isReferralEligibleRole('driver')).toBe(false);
  });

  it.each([
    [0, 500, 2, 0],
    [499, 500, 2, 100],
    [500, 1000, 5, 50],
    [999, 1000, 5, 100],
    [1000, 2000, 10, 50],
    [1999, 2000, 10, 100],
  ])('calculates the next target for %i points', (points, target, rebate, progress) => {
    expect(getReferralProgress(points, tiers)).toMatchObject({
      targetPoints: target,
      nextRebatePercent: rebate,
      progressPercent: progress,
      pointsRemaining: target - points,
    });
  });

  it('marks 2,000 or more points as the maximum reward', () => {
    expect(getReferralProgress(2000, tiers)).toMatchObject({
      targetPoints: null,
      nextRebatePercent: null,
      pointsRemaining: 0,
      progressPercent: 100,
      isMaximum: true,
    });
    expect(getReferralProgress(2400, tiers).points).toBe(2400);
  });

  it('keeps current-month rebate independent from current-month points', () => {
    expect(getCurrentMonthRebate(5)).toBe(5);
    expect(getCurrentMonthRebate(0)).toBe(0);
    expect(getCurrentMonthRebate(undefined)).toBe(0);
  });
});

describe('direct referral point boundaries', () => {
  it('counts only direct referrals and one point per distinct valid order', () => {
    const relationships = [
      { referrerUserId: 'A', referredUserId: 'B' },
      { referrerUserId: 'B', referredUserId: 'C' },
    ];
    const orders = [
      { id: 'b-1', ownerId: 'B', currentOperationalState: 'DELIVERED', completedAt: '2026-09-04' },
      { id: 'b-1', ownerId: 'B', currentOperationalState: 'DELIVERED', completedAt: '2026-09-04' },
      { id: 'c-1', ownerId: 'C', currentOperationalState: 'DELIVERED', completedAt: '2026-09-05' },
      { id: 'b-cancelled', ownerId: 'B', currentOperationalState: 'CANCELLED', completedAt: '2026-09-06' },
      { id: 'b-miri', ownerId: 'B', currentOperationalState: 'DELIVERED', orderType: 'MIRI_INBOUND_PICKUP', completedAt: '2026-09-07' },
      { id: 'b-outside-month', ownerId: 'B', currentOperationalState: 'DELIVERED', completedAt: '2026-10-01' },
    ];

    expect(countDirectReferralPoints('A', relationships, orders, '2026-09-01', '2026-10-01')).toBe(1);
    expect(countDirectReferralPoints('B', relationships, orders, '2026-09-01', '2026-10-01')).toBe(1);
  });

  it('ignores Team membership when no referral relationship exists', () => {
    const orders = [
      { id: 'b-1', ownerId: 'B', currentOperationalState: 'DELIVERED', completedAt: '2026-09-04' },
    ];
    expect(countDirectReferralPoints('A', [], orders, '2026-09-01', '2026-10-01')).toBe(0);
  });
});

describe('referral link', () => {
  it('builds a stable public URL without exposing internal IDs', () => {
    expect(buildReferralUrl('RAB12CD34', 'https://www.tomu.my')).toBe(
      'https://www.tomu.my/ref/RAB12CD34',
    );
  });
});
