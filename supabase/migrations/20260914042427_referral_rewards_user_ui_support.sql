-- Referral Rewards user UI support.
-- This module is intentionally isolated from Team, orders, pricing, and delivery.
-- The current checkout does not contain the Phase 1 referral artifacts, so this
-- migration provides the smallest private data/query surface the user page needs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.referral_codes (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_codes_code_format CHECK (code ~ '^[A-Z0-9]{8,32}$')
);

CREATE TABLE IF NOT EXISTS public.referral_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referral_code_used text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'ACTIVE',
  qualified_at timestamptz,
  CONSTRAINT referral_relationships_not_self CHECK (referrer_user_id <> referred_user_id),
  CONSTRAINT referral_relationships_status_check CHECK (status IN ('ACTIVE', 'REVOKED')),
  CONSTRAINT referral_relationships_one_referrer UNIQUE (referred_user_id),
  CONSTRAINT referral_relationships_direct_unique UNIQUE (referrer_user_id, referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_relationships_referrer_active
  ON public.referral_relationships (referrer_user_id, created_at)
  WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS public.referral_reward_rule_versions (
  version integer PRIMARY KEY,
  effective_from_month date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.referral_reward_tiers (
  rule_version integer NOT NULL REFERENCES public.referral_reward_rule_versions(version) ON DELETE CASCADE,
  min_points integer NOT NULL CHECK (min_points >= 0),
  rebate_percent numeric(5,2) NOT NULL CHECK (rebate_percent >= 0 AND rebate_percent <= 100),
  PRIMARY KEY (rule_version, min_points)
);

CREATE TABLE IF NOT EXISTS public.referral_monthly_stats (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month_start date NOT NULL,
  referral_points integer NOT NULL CHECK (referral_points >= 0),
  earned_rebate_percent numeric(5,2) NOT NULL CHECK (earned_rebate_percent >= 0 AND earned_rebate_percent <= 100),
  rule_version integer NOT NULL REFERENCES public.referral_reward_rule_versions(version),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month_start)
);

INSERT INTO public.referral_reward_rule_versions (version, effective_from_month)
VALUES (1, DATE '2000-01-01')
ON CONFLICT (version) DO NOTHING;

INSERT INTO public.referral_reward_tiers (rule_version, min_points, rebate_percent)
VALUES
  (1, 0, 0),
  (1, 500, 2),
  (1, 1000, 5),
  (1, 2000, 10)
ON CONFLICT (rule_version, min_points) DO NOTHING;

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_reward_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_reward_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_monthly_stats ENABLE ROW LEVEL SECURITY;

-- Referral details are exposed only through the aggregate RPC below. Direct
-- table reads are intentionally unavailable to client roles.
REVOKE ALL ON TABLE public.referral_codes,
  public.referral_relationships,
  public.referral_reward_rule_versions,
  public.referral_reward_tiers,
  public.referral_monthly_stats
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_or_create_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_existing_code text;
  v_candidate text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_role := public.get_user_role(v_user_id)::text;
  IF v_role NOT IN ('manager', 'salesperson', 'runner', 'runner_assistant') THEN
    RAISE EXCEPTION 'Referral Rewards is not available for this user';
  END IF;

  SELECT code INTO v_existing_code
  FROM public.referral_codes
  WHERE user_id = v_user_id;

  IF v_existing_code IS NOT NULL THEN
    RETURN v_existing_code;
  END IF;

  LOOP
    v_candidate := 'R' || upper(encode(gen_random_bytes(7), 'hex'));
    BEGIN
      INSERT INTO public.referral_codes (user_id, code)
      VALUES (v_user_id, v_candidate);
      RETURN v_candidate;
    EXCEPTION WHEN unique_violation THEN
      SELECT code INTO v_existing_code
      FROM public.referral_codes
      WHERE user_id = v_user_id;

      IF v_existing_code IS NOT NULL THEN
        RETURN v_existing_code;
      END IF;
    END;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_referral_rewards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_code text;
  v_current_month date := date_trunc('month', timezone('Asia/Kuala_Lumpur', now()))::date;
  v_previous_month date := (date_trunc('month', timezone('Asia/Kuala_Lumpur', now())) - interval '1 month')::date;
  v_next_current_month date := (date_trunc('month', timezone('Asia/Kuala_Lumpur', now())) + interval '1 month')::date;
  v_next_previous_month date := date_trunc('month', timezone('Asia/Kuala_Lumpur', now()))::date;
  v_current_points integer := 0;
  v_previous_points integer := 0;
  v_current_rule_version integer;
  v_previous_rule_version integer;
  v_current_month_rebate numeric(5,2) := 0;
  v_previous_month_rebate numeric(5,2) := 0;
  v_tiers jsonb := '[]'::jsonb;
  v_referrals jsonb := '[]'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_role := public.get_user_role(v_user_id)::text;
  IF v_role NOT IN ('manager', 'salesperson', 'runner', 'runner_assistant') THEN
    RAISE EXCEPTION 'Referral Rewards is not available for this user';
  END IF;

  v_code := public.get_or_create_referral_code();

  SELECT version INTO v_current_rule_version
  FROM public.referral_reward_rule_versions
  WHERE effective_from_month <= v_current_month
  ORDER BY effective_from_month DESC, version DESC
  LIMIT 1;

  SELECT version INTO v_previous_rule_version
  FROM public.referral_reward_rule_versions
  WHERE effective_from_month <= v_previous_month
  ORDER BY effective_from_month DESC, version DESC
  LIMIT 1;

  -- One distinct DELIVERED order is one point. This follows the existing
  -- canonical state and date source used by Delivered reporting.
  SELECT count(DISTINCT o.id)::integer INTO v_current_points
  FROM public.referral_relationships rel
  JOIN public.orders o
    ON COALESCE(o.order_owner_id, o.salesperson_id) = rel.referred_user_id
  WHERE rel.referrer_user_id = v_user_id
    AND rel.status = 'ACTIVE'
    AND o.current_operational_state = 'DELIVERED'
    AND o.order_type IS DISTINCT FROM 'MIRI_INBOUND_PICKUP'
    AND COALESCE(o.driver_delivered_at, o.delivered_at) IS NOT NULL
    AND (COALESCE(o.driver_delivered_at, o.delivered_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= v_current_month
    AND (COALESCE(o.driver_delivered_at, o.delivered_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date < v_next_current_month;

  SELECT count(DISTINCT o.id)::integer INTO v_previous_points
  FROM public.referral_relationships rel
  JOIN public.orders o
    ON COALESCE(o.order_owner_id, o.salesperson_id) = rel.referred_user_id
  WHERE rel.referrer_user_id = v_user_id
    AND rel.status = 'ACTIVE'
    AND o.current_operational_state = 'DELIVERED'
    AND o.order_type IS DISTINCT FROM 'MIRI_INBOUND_PICKUP'
    AND COALESCE(o.driver_delivered_at, o.delivered_at) IS NOT NULL
    AND (COALESCE(o.driver_delivered_at, o.delivered_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= v_previous_month
    AND (COALESCE(o.driver_delivered_at, o.delivered_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date < v_next_previous_month;

  SELECT COALESCE(MAX(t.rebate_percent), 0)
  INTO v_current_month_rebate
  FROM public.referral_reward_tiers t
  WHERE t.rule_version = v_previous_rule_version
    AND t.min_points <= v_previous_points;

  SELECT COALESCE(MAX(t.rebate_percent), 0)
  INTO v_previous_month_rebate
  FROM public.referral_reward_tiers t
  WHERE t.rule_version = v_current_rule_version
    AND t.min_points <= v_current_points;

  -- The prior month is snapshotted once so later settings changes do not alter
  -- a closed result. The current month is intentionally refreshed on read.
  INSERT INTO public.referral_monthly_stats (
    user_id, month_start, referral_points, earned_rebate_percent, rule_version, calculated_at
  )
  VALUES (
    v_user_id, v_previous_month, v_previous_points, v_current_month_rebate, v_previous_rule_version, now()
  )
  ON CONFLICT (user_id, month_start) DO NOTHING;

  INSERT INTO public.referral_monthly_stats (
    user_id, month_start, referral_points, earned_rebate_percent, rule_version, calculated_at
  )
  VALUES (
    v_user_id, v_current_month, v_current_points, v_previous_month_rebate, v_current_rule_version, now()
  )
  ON CONFLICT (user_id, month_start) DO UPDATE SET
    referral_points = EXCLUDED.referral_points,
    earned_rebate_percent = EXCLUDED.earned_rebate_percent,
    rule_version = EXCLUDED.rule_version,
    calculated_at = EXCLUDED.calculated_at;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'min_points', t.min_points,
      'rebate_percent', t.rebate_percent
    ) ORDER BY t.min_points
  ), '[]'::jsonb)
  INTO v_tiers
  FROM public.referral_reward_tiers t
  WHERE t.rule_version = v_current_rule_version;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'display_name', p.display_name,
      'joined_at', rel.created_at,
      'status', rel.status,
      'contributed_points', COALESCE(points.point_count, 0)
    ) ORDER BY p.display_name, rel.created_at
  ), '[]'::jsonb)
  INTO v_referrals
  FROM public.referral_relationships rel
  JOIN public.profiles p ON p.id = rel.referred_user_id
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT o.id)::integer AS point_count
    FROM public.orders o
    WHERE COALESCE(o.order_owner_id, o.salesperson_id) = rel.referred_user_id
      AND o.current_operational_state = 'DELIVERED'
      AND o.order_type IS DISTINCT FROM 'MIRI_INBOUND_PICKUP'
      AND COALESCE(o.driver_delivered_at, o.delivered_at) IS NOT NULL
      AND (COALESCE(o.driver_delivered_at, o.delivered_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= v_current_month
      AND (COALESCE(o.driver_delivered_at, o.delivered_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date < v_next_current_month
  ) points ON true
  WHERE rel.referrer_user_id = v_user_id
    AND rel.status = 'ACTIVE';

  SELECT earned_rebate_percent
  INTO v_current_month_rebate
  FROM public.referral_monthly_stats
  WHERE user_id = v_user_id
    AND month_start = v_previous_month;

  RETURN jsonb_build_object(
    'referral_code', v_code,
    'current_month', to_char(v_current_month, 'YYYY-MM'),
    'previous_month', to_char(v_previous_month, 'YYYY-MM'),
    'current_rebate_percent', COALESCE(v_current_month_rebate, 0),
    'current_points', v_current_points,
    'tiers', v_tiers,
    'direct_referrals', v_referrals
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_or_create_referral_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_referral_code() TO authenticated;
REVOKE ALL ON FUNCTION public.get_referral_rewards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_referral_rewards() TO authenticated;

NOTIFY pgrst, 'reload schema';
