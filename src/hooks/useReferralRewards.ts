import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  isReferralEligibleRole,
  type ReferralTier,
} from '@/lib/referralRewards';

export type DirectReferral = {
  displayName: string;
  joinedAt: string;
  status: string;
  contributedPoints: number;
};

export type ReferralRewards = {
  referralCode: string;
  currentMonth: string;
  previousMonth: string;
  currentRebatePercent: number;
  currentPoints: number;
  tiers: ReferralTier[];
  directReferrals: DirectReferral[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseRewards(value: unknown): ReferralRewards {
  const record = asRecord(value);
  const tiers = Array.isArray(record.tiers)
    ? record.tiers.map(asRecord).map((tier) => ({
        min_points: asNumber(tier.min_points),
        rebate_percent: asNumber(tier.rebate_percent),
      })).filter((tier) => tier.min_points >= 0)
    : [];
  const directReferrals = Array.isArray(record.direct_referrals)
    ? record.direct_referrals.map(asRecord).map((referral) => ({
        displayName: typeof referral.display_name === 'string' ? referral.display_name : 'Referral',
        joinedAt: typeof referral.joined_at === 'string' ? referral.joined_at : '',
        status: typeof referral.status === 'string' ? referral.status : 'ACTIVE',
        contributedPoints: asNumber(referral.contributed_points),
      }))
    : [];

  return {
    referralCode: typeof record.referral_code === 'string' ? record.referral_code : '',
    currentMonth: typeof record.current_month === 'string' ? record.current_month : '',
    previousMonth: typeof record.previous_month === 'string' ? record.previous_month : '',
    currentRebatePercent: asNumber(record.current_rebate_percent),
    currentPoints: asNumber(record.current_points),
    tiers,
    directReferrals,
  };
}

export function useReferralRewards() {
  const { user, role } = useAuth();
  const enabled = Boolean(user?.id && isReferralEligibleRole(role));

  return useQuery({
    queryKey: ['referral-rewards', user?.id],
    enabled,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_referral_rewards');
      if (error) throw error;
      return parseRewards(data);
    },
  });
}
