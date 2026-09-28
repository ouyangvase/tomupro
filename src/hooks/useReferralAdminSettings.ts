import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { ReferralTier } from '@/lib/referralRewards';

export type ReferralRuleVersion = {
  version: number;
  effective_from_month: string;
  tiers: ReferralTier[];
};

export type ReferralRuleHistory = {
  id: string;
  changed_at: string;
  effective_month: string;
  admin_user_id: string;
  admin_name: string;
  old_rule_version: number | null;
  new_rule_version: number;
  old_tiers: ReferralTier[];
  new_tiers: ReferralTier[];
};

export type ReferralAdminSettings = {
  current_month: string;
  next_effective_month: string;
  current: ReferralRuleVersion;
  next: ReferralRuleVersion;
  history: ReferralRuleHistory[];
};

export type ReferralAdminOverviewRow = {
  user_id: string;
  display_name: string;
  referral_code: string | null;
  direct_referral_count: number;
  current_points: number;
  current_rebate_percent: number;
  next_target_points: number | null;
  relationship_status: string;
};

export type ReferralAdminOverview = {
  month: string;
  next_effective_month: string;
  rows: ReferralAdminOverviewRow[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseTiers(value: unknown): ReferralTier[] {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).map((tier) => ({
    min_points: asNumber(tier.min_points),
    rebate_percent: asNumber(tier.rebate_percent),
  })).filter((tier) => tier.min_points >= 0 && tier.rebate_percent >= 0 && tier.rebate_percent <= 100)
    .sort((a, b) => a.min_points - b.min_points);
}

function parseRule(value: unknown): ReferralRuleVersion {
  const record = asRecord(value);
  return {
    version: asNumber(record.version),
    effective_from_month: typeof record.effective_from_month === 'string' ? record.effective_from_month : '',
    tiers: parseTiers(record.tiers),
  };
}

function parseSettings(value: unknown): ReferralAdminSettings {
  const record = asRecord(value);
  const history = Array.isArray(record.history)
    ? record.history.map(asRecord).map((item) => ({
        id: typeof item.id === 'string' ? item.id : '',
        changed_at: typeof item.changed_at === 'string' ? item.changed_at : '',
        effective_month: typeof item.effective_month === 'string' ? item.effective_month : '',
        admin_user_id: typeof item.admin_user_id === 'string' ? item.admin_user_id : '',
        admin_name: typeof item.admin_name === 'string' ? item.admin_name : 'Admin',
        old_rule_version: item.old_rule_version === null ? null : asNumber(item.old_rule_version),
        new_rule_version: asNumber(item.new_rule_version),
        old_tiers: parseTiers(item.old_tiers),
        new_tiers: parseTiers(item.new_tiers),
      }))
    : [];

  return {
    current_month: typeof record.current_month === 'string' ? record.current_month : '',
    next_effective_month: typeof record.next_effective_month === 'string' ? record.next_effective_month : '',
    current: parseRule(record.current),
    next: parseRule(record.next),
    history,
  };
}

function parseOverview(value: unknown): ReferralAdminOverview {
  const record = asRecord(value);
  const rows = Array.isArray(record.rows)
    ? record.rows.map(asRecord).map((row) => ({
        user_id: typeof row.user_id === 'string' ? row.user_id : '',
        display_name: typeof row.display_name === 'string' ? row.display_name : 'User',
        referral_code: typeof row.referral_code === 'string' ? row.referral_code : null,
        direct_referral_count: asNumber(row.direct_referral_count),
        current_points: asNumber(row.current_points),
        current_rebate_percent: asNumber(row.current_rebate_percent),
        next_target_points: row.next_target_points === null ? null : asNumber(row.next_target_points),
        relationship_status: typeof row.relationship_status === 'string' ? row.relationship_status : 'ACTIVE',
      }))
    : [];

  return {
    month: typeof record.month === 'string' ? record.month : '',
    next_effective_month: typeof record.next_effective_month === 'string' ? record.next_effective_month : '',
    rows,
  };
}

export function useReferralAdminSettings() {
  const { role } = useAuth();

  return useQuery({
    queryKey: ['referral-admin-settings'],
    enabled: role === 'admin',
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_referral_reward_settings');
      if (error) throw error;
      return parseSettings(data);
    },
  });
}

export function useSaveReferralAdminSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tiers: ReferralTier[]) => {
      const { data, error } = await supabase.rpc('save_referral_reward_settings', { p_tiers: tiers });
      if (error) throw error;
      return parseSettings({
        current_month: '',
        next_effective_month: typeof (data as Record<string, unknown> | null)?.effective_month === 'string'
          ? (data as Record<string, unknown>).effective_month
          : '',
        current: {},
        next: { tiers },
        history: [],
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['referral-admin-settings'] });
      void queryClient.invalidateQueries({ queryKey: ['referral-admin-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['referral-rewards'] });
    },
  });
}

export function useReferralAdminOverview(search: string) {
  const { role } = useAuth();

  return useQuery({
    queryKey: ['referral-admin-overview', search],
    enabled: role === 'admin',
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_referral_admin_overview', {
        p_search: search.trim() || null,
      });
      if (error) throw error;
      return parseOverview(data);
    },
  });
}
