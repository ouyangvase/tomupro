import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260914042427_referral_rewards_user_ui_support.sql', import.meta.url),
  'utf8',
);

describe('referral rewards database contract', () => {
  it('keeps direct relationships unique and self-referrals impossible', () => {
    expect(migration).toContain('UNIQUE (referred_user_id)');
    expect(migration).toContain('referrer_user_id <> referred_user_id');
    expect(migration).toContain('UNIQUE (referrer_user_id, referred_user_id)');
  });

  it('protects referral tables and exposes only authenticated RPCs', () => {
    expect(migration).toContain('ALTER TABLE public.referral_relationships ENABLE ROW LEVEL SECURITY;');
    expect(migration).toContain('REVOKE ALL ON TABLE public.referral_codes');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_referral_rewards() TO authenticated;');
    expect(migration).toContain("v_role NOT IN ('manager', 'salesperson', 'runner', 'runner_assistant')");
  });

  it('uses the canonical delivered order once and never Team membership', () => {
    const sql = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(migration).toContain("o.current_operational_state = 'DELIVERED'");
    expect(migration).toContain('count(DISTINCT o.id)');
    expect(migration).toContain("COALESCE(o.driver_delivered_at, o.delivered_at) AT TIME ZONE 'Asia/Kuala_Lumpur'");
    expect(sql).not.toMatch(/team/i);
  });

  it('stores rule versions and snapshots the prior month idempotently', () => {
    expect(migration).toContain('referral_reward_rule_versions');
    expect(migration).toContain('referral_monthly_stats');
    expect(migration).toContain('ON CONFLICT (user_id, month_start) DO NOTHING');
  });

  it('returns aggregate referral fields only', () => {
    expect(migration).toContain("'display_name', p.display_name");
    expect(migration).toContain("'contributed_points', COALESCE(points.point_count, 0)");
    expect(migration).not.toContain('customer_name');
    expect(migration).not.toContain('delivery_address');
    expect(migration).not.toContain('payment_method');
  });
});
