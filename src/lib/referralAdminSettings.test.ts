import { describe, expect, it } from 'vitest';
import {
  calculateReferralRebate,
  canonicalizeReferralTiers,
  validateReferralTiers,
} from '@/lib/referralAdminSettings';

describe('referral admin settings', () => {
  it('requires a valid zero-point baseline and unique thresholds', () => {
    expect(validateReferralTiers([{ min_points: 500, rebate_percent: 2 }])).toContain('baseline');
    expect(validateReferralTiers([
      { min_points: 0, rebate_percent: 0 },
      { min_points: 0, rebate_percent: 2 },
    ])).toContain('unique');
    expect(validateReferralTiers([
      { min_points: 0, rebate_percent: 0 },
      { min_points: 500, rebate_percent: 2 },
    ])).toBeNull();
  });

  it('canonicalizes tiers without changing the configured values', () => {
    expect(canonicalizeReferralTiers([
      { min_points: 1000, rebate_percent: 5 },
      { min_points: 0, rebate_percent: 0 },
    ])).toEqual([
      { min_points: 0, rebate_percent: 0 },
      { min_points: 1000, rebate_percent: 5 },
    ]);
  });

  it('calculates a separate rebate component after the base fee', () => {
    expect(calculateReferralRebate(39, 5)).toEqual({
      baseDeliveryFee: 39,
      rebateAmount: 1.95,
      netDeliveryFee: 37.05,
    });
  });
});
