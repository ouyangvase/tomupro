import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260914044952_referral_rewards_admin_settings.sql', import.meta.url),
  'utf8',
);

describe('referral rewards Phase 3 database contract', () => {
  it('versions future settings and records Admin changes', () => {
    expect(migration).toContain('referral_reward_settings_history');
    expect(migration).toContain("v_effective_month date := (date_trunc('month', timezone('Asia/Kuala_Lumpur', now())) + interval '1 month')::date");
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("old_tiers, new_tiers");
  });

  it('protects Admin settings and overview RPCs at the database boundary', () => {
    expect(migration).toContain("public.get_user_role(auth.uid())::text <> 'admin'");
    expect(migration).toContain('REVOKE ALL ON TABLE public.referral_reward_settings_history');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.save_referral_reward_settings(jsonb) TO authenticated;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_referral_admin_overview(text) TO authenticated;');
  });

  it('attributes links once without changing Team membership', () => {
    expect(migration).toContain("NEW.raw_user_meta_data ->> 'referral_code'");
    expect(migration).toContain('ON CONFLICT (referred_user_id) DO NOTHING');
    expect(migration).toContain('rc.user_id <> NEW.id');
    const executableSql = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(executableSql).not.toMatch(/team/i);
  });

  it('keeps rebate separate from existing order and claim amounts', () => {
    expect(migration).toContain('referral_rebate_applications');
    expect(migration).toContain('base_delivery_fee_bnd');
    expect(migration).toContain('referral_rebate_amount_bnd');
    expect(migration).toContain('Referral rebate is restricted to the order owner');
    expect(migration).toContain('apply_referral_rebate_for_order');
    expect(migration).toContain('ON CONFLICT (order_id) DO UPDATE SET');
    expect(migration).not.toMatch(/UPDATE public\.orders/i);
    expect(migration).not.toMatch(/UPDATE public\.claims/i);
    expect(migration).not.toContain('customer_name');
  });
});
