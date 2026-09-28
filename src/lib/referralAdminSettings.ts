import type { ReferralTier } from '@/lib/referralRewards';

export function validateReferralTiers(tiers: ReferralTier[]): string | null {
  if (tiers.length === 0) return 'Add at least one referral tier.';
  if (!tiers.some((tier) => tier.min_points === 0)) return 'A 0-point baseline tier is required.';

  const thresholds = new Set<number>();
  for (const tier of tiers) {
    if (!Number.isInteger(tier.min_points) || tier.min_points < 0) {
      return 'Minimum points must be a whole number of 0 or more.';
    }
    if (!Number.isFinite(tier.rebate_percent) || tier.rebate_percent < 0 || tier.rebate_percent > 100) {
      return 'Rebate percent must be between 0 and 100.';
    }
    if (thresholds.has(tier.min_points)) return 'Minimum point thresholds must be unique.';
    thresholds.add(tier.min_points);
  }
  return null;
}

export function canonicalizeReferralTiers(tiers: ReferralTier[]): ReferralTier[] {
  return [...tiers].sort((left, right) => left.min_points - right.min_points);
}

export function calculateReferralRebate(baseDeliveryFee: number, rebatePercent: number): {
  baseDeliveryFee: number;
  rebateAmount: number;
  netDeliveryFee: number;
} {
  const base = Math.max(0, Number.isFinite(baseDeliveryFee) ? baseDeliveryFee : 0);
  const percent = Math.min(100, Math.max(0, Number.isFinite(rebatePercent) ? rebatePercent : 0));
  const roundedBase = Math.round((base + Number.EPSILON) * 100) / 100;
  const rebateAmount = Math.round((roundedBase * percent / 100 + Number.EPSILON) * 100) / 100;

  return {
    baseDeliveryFee: roundedBase,
    rebateAmount,
    netDeliveryFee: Math.max(0, Math.round((roundedBase - rebateAmount + Number.EPSILON) * 100) / 100),
  };
}
