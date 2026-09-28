import type { AppRole } from '@/types/database';

export const REFERRAL_ELIGIBLE_ROLES: AppRole[] = [
  'manager',
  'salesperson',
];

export type ReferralTier = {
  min_points: number;
  rebate_percent: number;
};

export type ReferralProgress = {
  points: number;
  targetPoints: number | null;
  nextRebatePercent: number | null;
  pointsRemaining: number;
  progressPercent: number;
  isMaximum: boolean;
};

export type ReferralOrderForPointTest = {
  id: string;
  ownerId: string;
  currentOperationalState: string;
  orderType?: string | null;
  completedAt?: string | null;
};

export type ReferralRelationshipForPointTest = {
  referrerUserId: string;
  referredUserId: string;
  status?: string;
};

export function isReferralEligibleRole(role: AppRole | string | null | undefined): boolean {
  return Boolean(role && REFERRAL_ELIGIBLE_ROLES.includes(role as AppRole));
}

export function getReferralProgress(points: number, tiers: ReferralTier[]): ReferralProgress {
  const safePoints = Math.max(0, Math.floor(Number.isFinite(points) ? points : 0));
  const orderedTiers = [...tiers]
    .filter((tier) => Number.isFinite(tier.min_points) && Number.isFinite(tier.rebate_percent))
    .sort((a, b) => a.min_points - b.min_points);
  const nextTier = orderedTiers.find((tier) => tier.min_points > safePoints);

  if (!nextTier) {
    return {
      points: safePoints,
      targetPoints: null,
      nextRebatePercent: null,
      pointsRemaining: 0,
      progressPercent: 100,
      isMaximum: true,
    };
  }

  const targetPoints = Math.max(nextTier.min_points, 1);
  return {
    points: safePoints,
    targetPoints,
    nextRebatePercent: nextTier.rebate_percent,
    pointsRemaining: Math.max(0, targetPoints - safePoints),
    progressPercent: Math.min(100, Math.round((safePoints / targetPoints) * 100)),
    isMaximum: false,
  };
}

export function getCurrentMonthRebate(previousMonthRebate: number | null | undefined): number {
  return Number.isFinite(previousMonthRebate) ? Math.max(0, previousMonthRebate as number) : 0;
}

export function buildReferralUrl(code: string, origin: string): string {
  return new URL(`/ref/${encodeURIComponent(code)}`, origin).toString();
}

export function countDirectReferralPoints(
  referrerUserId: string,
  relationships: ReferralRelationshipForPointTest[],
  orders: ReferralOrderForPointTest[],
  monthStart: string,
  nextMonthStart: string,
): number {
  const directReferralIds = new Set(
    relationships
      .filter((relationship) => relationship.referrerUserId === referrerUserId && relationship.status !== 'REVOKED')
      .map((relationship) => relationship.referredUserId),
  );
  const validOrderIds = new Set(
    orders
      .filter((order) => (
        directReferralIds.has(order.ownerId)
        && order.currentOperationalState === 'DELIVERED'
        && order.orderType !== 'MIRI_INBOUND_PICKUP'
        && Boolean(order.completedAt)
        && (order.completedAt as string) >= monthStart
        && (order.completedAt as string) < nextMonthStart
      ))
      .map((order) => order.id),
  );

  return validOrderIds.size;
}
