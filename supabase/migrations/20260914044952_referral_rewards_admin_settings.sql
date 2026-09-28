-- Referral Rewards Phase 3: admin settings, registration attribution, and
-- isolated rebate calculation. This migration never changes Team, Orders,
-- Tier Sharing, delivery status transitions, or existing fee/claim columns.

CREATE TABLE IF NOT EXISTS public.referral_reward_settings_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES public.profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  effective_month date NOT NULL,
  old_rule_version integer REFERENCES public.referral_reward_rule_versions(version),
  new_rule_version integer NOT NULL REFERENCES public.referral_reward_rule_versions(version),
  old_tiers jsonb NOT NULL,
  new_tiers jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_referral_reward_history_changed_at
  ON public.referral_reward_settings_history (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_reward_history_effective_month
  ON public.referral_reward_settings_history (effective_month DESC);

-- This is a separate, idempotent rebate component. Existing delivery fees and
-- claims remain the base values; consumers may use this component after the
-- base fee has been calculated.
CREATE TABLE IF NOT EXISTS public.referral_rebate_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rule_version integer NOT NULL REFERENCES public.referral_reward_rule_versions(version),
  base_delivery_fee_bnd numeric(12,2) NOT NULL CHECK (base_delivery_fee_bnd >= 0),
  rebate_percent numeric(5,2) NOT NULL CHECK (rebate_percent >= 0 AND rebate_percent <= 100),
  rebate_amount_bnd numeric(12,2) NOT NULL CHECK (rebate_amount_bnd >= 0),
  net_delivery_fee_bnd numeric(12,2) NOT NULL CHECK (net_delivery_fee_bnd >= 0),
  applied_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_rebate_applications_owner
  ON public.referral_rebate_applications (owner_user_id, applied_at DESC);

ALTER TABLE public.referral_reward_settings_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rebate_applications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.referral_reward_settings_history,
  public.referral_rebate_applications
FROM PUBLIC, anon, authenticated;

-- Backfill only the new referral-code table. No existing profile, Team, Order,
-- or relationship data is rewritten.
DO $backfill$
DECLARE
  v_user_id uuid;
  v_candidate text;
BEGIN
  FOR v_user_id IN
    SELECT id
    FROM public.profiles
    WHERE role::text IN ('manager', 'salesperson', 'runner', 'runner_assistant')
  LOOP
    IF EXISTS (SELECT 1 FROM public.referral_codes WHERE user_id = v_user_id) THEN
      CONTINUE;
    END IF;

    LOOP
      v_candidate := 'R' || upper(encode(gen_random_bytes(7), 'hex'));
      BEGIN
        INSERT INTO public.referral_codes (user_id, code)
        VALUES (v_user_id, v_candidate);
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- A concurrent insert or code collision is safe; retry this user.
      END;
    END LOOP;
  END LOOP;
END;
$backfill$;

-- Attribute a valid /ref/:code signup after the existing production signup
-- trigger has created the profile. The unique referred_user_id constraint is
-- the final race-condition guard and makes attribution permanent.
CREATE OR REPLACE FUNCTION public.attribute_referral_after_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_code text;
BEGIN
  v_code := NULLIF(upper(btrim(NEW.raw_user_meta_data ->> 'referral_code')), '');
  IF v_code IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.referral_relationships (
    referrer_user_id,
    referred_user_id,
    referral_code_used,
    status,
    created_at
  )
  SELECT
    rc.user_id,
    NEW.id,
    rc.code,
    'ACTIVE',
    now()
  FROM public.referral_codes rc
  WHERE rc.code = v_code
    AND rc.user_id <> NEW.id
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.id)
  ON CONFLICT (referred_user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS zz_referral_attribution_after_auth_user ON auth.users;
CREATE TRIGGER zz_referral_attribution_after_auth_user
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.attribute_referral_after_signup();

REVOKE ALL ON FUNCTION public.attribute_referral_after_signup() FROM PUBLIC, anon, authenticated;

-- Return the current rule, next scheduled rule, and safe change history to
-- Admins only. The UI never reads referral tables directly.
CREATE OR REPLACE FUNCTION public.get_referral_reward_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_current_month date := date_trunc('month', timezone('Asia/Kuala_Lumpur', now()))::date;
  v_next_month date := (date_trunc('month', timezone('Asia/Kuala_Lumpur', now())) + interval '1 month')::date;
  v_current_version integer;
  v_next_version integer;
  v_current_tiers jsonb := '[]'::jsonb;
  v_next_tiers jsonb := '[]'::jsonb;
  v_history jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role(auth.uid())::text <> 'admin' THEN
    RAISE EXCEPTION 'Admin permission required';
  END IF;

  SELECT version INTO v_current_version
  FROM public.referral_reward_rule_versions
  WHERE effective_from_month <= v_current_month
  ORDER BY effective_from_month DESC, version DESC
  LIMIT 1;

  SELECT version INTO v_next_version
  FROM public.referral_reward_rule_versions
  WHERE effective_from_month <= v_next_month
  ORDER BY effective_from_month DESC, version DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('min_points', min_points, 'rebate_percent', rebate_percent)
    ORDER BY min_points
  ), '[]'::jsonb)
  INTO v_current_tiers
  FROM public.referral_reward_tiers
  WHERE rule_version = v_current_version;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('min_points', min_points, 'rebate_percent', rebate_percent)
    ORDER BY min_points
  ), '[]'::jsonb)
  INTO v_next_tiers
  FROM public.referral_reward_tiers
  WHERE rule_version = v_next_version;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', h.id,
      'changed_at', h.changed_at,
      'effective_month', h.effective_month,
      'admin_user_id', h.admin_user_id,
      'admin_name', COALESCE(p.display_name, 'Admin'),
      'old_rule_version', h.old_rule_version,
      'new_rule_version', h.new_rule_version,
      'old_tiers', h.old_tiers,
      'new_tiers', h.new_tiers
    ) ORDER BY h.changed_at DESC
  ), '[]'::jsonb)
  INTO v_history
  FROM (
    SELECT *
    FROM public.referral_reward_settings_history
    ORDER BY changed_at DESC
    LIMIT 50
  ) h
  LEFT JOIN public.profiles p ON p.id = h.admin_user_id;

  RETURN jsonb_build_object(
    'current_month', v_current_month,
    'next_effective_month', v_next_month,
    'current', jsonb_build_object(
      'version', v_current_version,
      'effective_from_month', (SELECT effective_from_month FROM public.referral_reward_rule_versions WHERE version = v_current_version),
      'tiers', v_current_tiers
    ),
    'next', jsonb_build_object(
      'version', v_next_version,
      'effective_from_month', (SELECT effective_from_month FROM public.referral_reward_rule_versions WHERE version = v_next_version),
      'tiers', v_next_tiers
    ),
    'history', v_history
  );
END;
$function$;

-- Validate and schedule a new rule version for the first day of next month.
-- Existing and closed months are never edited.
CREATE OR REPLACE FUNCTION public.save_referral_reward_settings(p_tiers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_item jsonb;
  v_min_text text;
  v_rebate_text text;
  v_min integer;
  v_rebate numeric(5,2);
  v_seen integer[] := ARRAY[]::integer[];
  v_new_tiers jsonb;
  v_old_tiers jsonb;
  v_old_version integer;
  v_new_version integer;
  v_effective_month date := (date_trunc('month', timezone('Asia/Kuala_Lumpur', now())) + interval '1 month')::date;
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role(auth.uid())::text <> 'admin' THEN
    RAISE EXCEPTION 'Admin permission required';
  END IF;

  IF jsonb_typeof(p_tiers) <> 'array' OR jsonb_array_length(p_tiers) = 0 THEN
    RAISE EXCEPTION 'At least one referral tier is required';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_tiers)
  LOOP
    v_min_text := v_item ->> 'min_points';
    v_rebate_text := v_item ->> 'rebate_percent';

    IF v_min_text IS NULL OR v_min_text !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Minimum points must be a whole number of 0 or more';
    END IF;
    IF v_rebate_text IS NULL OR v_rebate_text !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'Rebate percent must be a number from 0 to 100';
    END IF;

    v_min := v_min_text::integer;
    v_rebate := v_rebate_text::numeric;
    IF v_min = ANY(v_seen) THEN
      RAISE EXCEPTION 'Minimum point thresholds must be unique';
    END IF;
    IF v_rebate < 0 OR v_rebate > 100 THEN
      RAISE EXCEPTION 'Rebate percent must be between 0 and 100';
    END IF;
    v_seen := array_append(v_seen, v_min);
  END LOOP;

  IF NOT (0 = ANY(v_seen)) THEN
    RAISE EXCEPTION 'A 0-point baseline tier is required';
  END IF;

  v_new_tiers := (
    SELECT jsonb_agg(
      jsonb_build_object(
        'min_points', (value ->> 'min_points')::integer,
        'rebate_percent', (value ->> 'rebate_percent')::numeric
      ) ORDER BY (value ->> 'min_points')::integer
    )
    FROM jsonb_array_elements(p_tiers)
  );

  -- Serialize writes so concurrent Admin saves cannot reuse a rule version.
  PERFORM pg_advisory_xact_lock(hashtext('tomupro.referral_reward_settings'));

  SELECT rv.version INTO v_old_version
  FROM public.referral_reward_rule_versions rv
  WHERE rv.effective_from_month <= v_effective_month
  ORDER BY rv.effective_from_month DESC, rv.version DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('min_points', t.min_points, 'rebate_percent', t.rebate_percent)
    ORDER BY t.min_points
  ), '[]'::jsonb)
  INTO v_old_tiers
  FROM public.referral_reward_tiers t
  WHERE t.rule_version = v_old_version;

  IF v_new_tiers = v_old_tiers THEN
    RETURN jsonb_build_object(
      'saved', false,
      'effective_month', v_effective_month,
      'version', v_old_version,
      'tiers', v_new_tiers
    );
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_new_version
  FROM public.referral_reward_rule_versions;

  INSERT INTO public.referral_reward_rule_versions (version, effective_from_month, created_by)
  VALUES (v_new_version, v_effective_month, auth.uid());

  INSERT INTO public.referral_reward_tiers (rule_version, min_points, rebate_percent)
  SELECT v_new_version, (value ->> 'min_points')::integer, (value ->> 'rebate_percent')::numeric
  FROM jsonb_array_elements(v_new_tiers);

  INSERT INTO public.referral_reward_settings_history (
    admin_user_id, effective_month, old_rule_version, new_rule_version, old_tiers, new_tiers
  )
  VALUES (
    auth.uid(), v_effective_month, v_old_version, v_new_version, v_old_tiers, v_new_tiers
  );

  RETURN jsonb_build_object(
    'saved', true,
    'effective_month', v_effective_month,
    'version', v_new_version,
    'tiers', v_new_tiers
  );
END;
$function$;

-- Safe isolated rebate component. The base delivery fee is supplied by the
-- existing fee engine first; this function never changes orders or claims.
CREATE OR REPLACE FUNCTION public.get_referral_rebate_for_order(
  p_order_id uuid,
  p_base_delivery_fee_bnd numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_month date := date_trunc('month', timezone('Asia/Kuala_Lumpur', now()))::date;
  v_previous_month date := (date_trunc('month', timezone('Asia/Kuala_Lumpur', now())) - interval '1 month')::date;
  v_rule_version integer;
  v_rebate_percent numeric(5,2) := 0;
  v_base numeric(12,2);
  v_rebate numeric(12,2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT COALESCE(o.order_owner_id, o.salesperson_id) INTO v_owner_id
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_owner_id <> v_user_id THEN
    RAISE EXCEPTION 'Referral rebate is restricted to the order owner';
  END IF;
  IF p_base_delivery_fee_bnd IS NULL OR p_base_delivery_fee_bnd < 0 THEN
    RAISE EXCEPTION 'Base delivery fee must be 0 or more';
  END IF;

  SELECT earned_rebate_percent, rule_version
  INTO v_rebate_percent, v_rule_version
  FROM public.referral_monthly_stats
  WHERE user_id = v_user_id
    AND month_start = v_previous_month;

  v_base := round(p_base_delivery_fee_bnd::numeric, 2);
  v_rebate := round(v_base * COALESCE(v_rebate_percent, 0) / 100, 2);

  RETURN jsonb_build_object(
    'base_delivery_fee_bnd', v_base,
    'referral_rebate_percent', COALESCE(v_rebate_percent, 0),
    'referral_rebate_amount_bnd', v_rebate,
    'delivery_fee_after_referral_rebate_bnd', greatest(v_base - v_rebate, 0),
    'rule_version', v_rule_version,
    'month', v_month
  );
END;
$function$;

-- Apply the isolated component idempotently for the authenticated order owner.
-- This writes only referral_rebate_applications; it never overwrites an order,
-- claim, delivery charge, or existing discount amount.
CREATE OR REPLACE FUNCTION public.apply_referral_rebate_for_order(
  p_order_id uuid,
  p_base_delivery_fee_bnd numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_previous_month date := (date_trunc('month', timezone('Asia/Kuala_Lumpur', now())) - interval '1 month')::date;
  v_rule_version integer;
  v_rebate_percent numeric(5,2) := 0;
  v_base numeric(12,2);
  v_rebate numeric(12,2);
  v_net numeric(12,2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT COALESCE(o.order_owner_id, o.salesperson_id) INTO v_owner_id
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_owner_id <> v_user_id THEN
    RAISE EXCEPTION 'Referral rebate is restricted to the order owner';
  END IF;
  IF p_base_delivery_fee_bnd IS NULL OR p_base_delivery_fee_bnd < 0 THEN
    RAISE EXCEPTION 'Base delivery fee must be 0 or more';
  END IF;

  SELECT earned_rebate_percent, rule_version
  INTO v_rebate_percent, v_rule_version
  FROM public.referral_monthly_stats
  WHERE user_id = v_user_id
    AND month_start = v_previous_month;

  v_base := round(p_base_delivery_fee_bnd::numeric, 2);
  v_rebate := round(v_base * COALESCE(v_rebate_percent, 0) / 100, 2);
  v_net := greatest(v_base - v_rebate, 0);

  INSERT INTO public.referral_rebate_applications (
    order_id,
    owner_user_id,
    rule_version,
    base_delivery_fee_bnd,
    rebate_percent,
    rebate_amount_bnd,
    net_delivery_fee_bnd,
    updated_at
  )
  VALUES (
    p_order_id,
    v_user_id,
    COALESCE(v_rule_version, (SELECT max(version) FROM public.referral_reward_rule_versions)),
    v_base,
    COALESCE(v_rebate_percent, 0),
    v_rebate,
    v_net,
    now()
  )
  ON CONFLICT (order_id) DO UPDATE SET
    base_delivery_fee_bnd = EXCLUDED.base_delivery_fee_bnd,
    rebate_percent = EXCLUDED.rebate_percent,
    rebate_amount_bnd = EXCLUDED.rebate_amount_bnd,
    net_delivery_fee_bnd = EXCLUDED.net_delivery_fee_bnd,
    rule_version = EXCLUDED.rule_version,
    updated_at = now();

  RETURN jsonb_build_object(
    'base_delivery_fee_bnd', v_base,
    'referral_rebate_percent', COALESCE(v_rebate_percent, 0),
    'referral_rebate_amount_bnd', v_rebate,
    'delivery_fee_after_referral_rebate_bnd', v_net,
    'rule_version', COALESCE(v_rule_version, (SELECT max(version) FROM public.referral_reward_rule_versions))
  );
END;
$function$;

-- Admin-only overview: one aggregate result, direct relationships only, and
-- no order/customer/Team/private referral-network data.
CREATE OR REPLACE FUNCTION public.get_referral_admin_overview(p_search text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_month date := date_trunc('month', timezone('Asia/Kuala_Lumpur', now()))::date;
  v_previous_month date := (date_trunc('month', timezone('Asia/Kuala_Lumpur', now())) - interval '1 month')::date;
  v_next_month date := (date_trunc('month', timezone('Asia/Kuala_Lumpur', now())) + interval '1 month')::date;
  v_next_rule_version integer;
  v_rows jsonb := '[]'::jsonb;
  v_query text := NULLIF(btrim(p_search), '');
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role(auth.uid())::text <> 'admin' THEN
    RAISE EXCEPTION 'Admin permission required';
  END IF;

  SELECT version INTO v_next_rule_version
  FROM public.referral_reward_rule_versions
  WHERE effective_from_month <= v_next_month
  ORDER BY effective_from_month DESC, version DESC
  LIMIT 1;

  WITH direct_points AS (
    SELECT
      rel.referrer_user_id,
      rel.referred_user_id,
      count(DISTINCT o.id)::integer AS points
    FROM public.referral_relationships rel
    JOIN public.orders o
      ON COALESCE(o.order_owner_id, o.salesperson_id) = rel.referred_user_id
    WHERE rel.status = 'ACTIVE'
      AND o.current_operational_state = 'DELIVERED'
      AND o.order_type IS DISTINCT FROM 'MIRI_INBOUND_PICKUP'
      AND COALESCE(o.driver_delivered_at, o.delivered_at) IS NOT NULL
      AND (COALESCE(o.driver_delivered_at, o.delivered_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= v_month
      AND (COALESCE(o.driver_delivered_at, o.delivered_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date < v_next_month
    GROUP BY rel.referrer_user_id, rel.referred_user_id
  ), referral_totals AS (
    SELECT
      rel.referrer_user_id,
      count(*) FILTER (WHERE rel.status = 'ACTIVE')::integer AS direct_referral_count,
      COALESCE(sum(dp.points), 0)::integer AS current_points
    FROM public.referral_relationships rel
    LEFT JOIN direct_points dp
      ON dp.referrer_user_id = rel.referrer_user_id
      AND dp.referred_user_id = rel.referred_user_id
    GROUP BY rel.referrer_user_id
  ), overview AS (
    SELECT
      p.id AS user_id,
      p.display_name,
      rc.code AS referral_code,
      COALESCE(rt.direct_referral_count, 0) AS direct_referral_count,
      COALESCE(rt.current_points, 0) AS current_points,
      COALESCE(prev.earned_rebate_percent, 0) AS current_rebate_percent,
      (
        SELECT min(t.min_points)
        FROM public.referral_reward_tiers t
        WHERE t.rule_version = v_next_rule_version
          AND t.min_points > COALESCE(rt.current_points, 0)
      ) AS next_target_points,
      CASE
        WHEN COALESCE(rt.direct_referral_count, 0) > 0 THEN 'ACTIVE'
        ELSE 'NO_DIRECT_REFERRALS'
      END AS relationship_status
    FROM public.profiles p
    LEFT JOIN public.referral_codes rc ON rc.user_id = p.id
    LEFT JOIN referral_totals rt ON rt.referrer_user_id = p.id
    LEFT JOIN public.referral_monthly_stats prev
      ON prev.user_id = p.id AND prev.month_start = v_previous_month
    WHERE p.role::text IN ('manager', 'salesperson', 'runner', 'runner_assistant')
      AND (
        v_query IS NULL
        OR p.display_name ILIKE '%' || v_query || '%'
        OR p.id::text ILIKE '%' || v_query || '%'
        OR rc.code ILIKE '%' || v_query || '%'
      )
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(overview) ORDER BY lower(overview.display_name)), '[]'::jsonb)
  INTO v_rows
  FROM overview;

  RETURN jsonb_build_object(
    'month', v_month,
    'next_effective_month', v_next_month,
    'rows', v_rows
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_referral_reward_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_referral_reward_settings() TO authenticated;
REVOKE ALL ON FUNCTION public.save_referral_reward_settings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_referral_reward_settings(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.get_referral_rebate_for_order(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_referral_rebate_for_order(uuid, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.apply_referral_rebate_for_order(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_referral_rebate_for_order(uuid, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.get_referral_admin_overview(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_referral_admin_overview(text) TO authenticated;

-- Keep the Phase 2 user page on the same effective-month rules as Admin.
-- Current points use the rule effective next month; the current rebate uses
-- the finalized previous-month snapshot.
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
  v_next_month date := (date_trunc('month', timezone('Asia/Kuala_Lumpur', now())) + interval '1 month')::date;
  v_current_points integer := 0;
  v_previous_points integer := 0;
  v_current_rule_version integer;
  v_previous_rule_version integer;
  v_next_rule_version integer;
  v_current_month_rebate numeric(5,2) := 0;
  v_previous_month_rebate numeric(5,2) := 0;
  v_next_month_rebate numeric(5,2) := 0;
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

  SELECT version INTO v_next_rule_version
  FROM public.referral_reward_rule_versions
  WHERE effective_from_month <= v_next_month
  ORDER BY effective_from_month DESC, version DESC
  LIMIT 1;

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
    AND (COALESCE(o.driver_delivered_at, o.delivered_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date < v_next_month;

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
    AND (COALESCE(o.driver_delivered_at, o.delivered_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date < v_current_month;

  SELECT COALESCE(MAX(t.rebate_percent), 0)
  INTO v_previous_month_rebate
  FROM public.referral_reward_tiers t
  WHERE t.rule_version = v_previous_rule_version
    AND t.min_points <= v_previous_points;

  SELECT COALESCE(MAX(t.rebate_percent), 0)
  INTO v_next_month_rebate
  FROM public.referral_reward_tiers t
  WHERE t.rule_version = v_next_rule_version
    AND t.min_points <= v_current_points;

  INSERT INTO public.referral_monthly_stats (
    user_id, month_start, referral_points, earned_rebate_percent, rule_version, calculated_at
  )
  VALUES (
    v_user_id, v_previous_month, v_previous_points, v_previous_month_rebate, v_previous_rule_version, now()
  )
  ON CONFLICT (user_id, month_start) DO NOTHING;

  INSERT INTO public.referral_monthly_stats (
    user_id, month_start, referral_points, earned_rebate_percent, rule_version, calculated_at
  )
  VALUES (
    v_user_id, v_current_month, v_current_points, v_next_month_rebate, v_next_rule_version, now()
  )
  ON CONFLICT (user_id, month_start) DO UPDATE SET
    referral_points = EXCLUDED.referral_points,
    earned_rebate_percent = EXCLUDED.earned_rebate_percent,
    rule_version = EXCLUDED.rule_version,
    calculated_at = EXCLUDED.calculated_at;

  SELECT earned_rebate_percent
  INTO v_current_month_rebate
  FROM public.referral_monthly_stats
  WHERE user_id = v_user_id
    AND month_start = v_previous_month;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('min_points', t.min_points, 'rebate_percent', t.rebate_percent)
    ORDER BY t.min_points
  ), '[]'::jsonb)
  INTO v_tiers
  FROM public.referral_reward_tiers t
  WHERE t.rule_version = v_next_rule_version;

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
      AND (COALESCE(o.driver_delivered_at, o.delivered_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date < v_next_month
  ) points ON true
  WHERE rel.referrer_user_id = v_user_id
    AND rel.status = 'ACTIVE';

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

REVOKE ALL ON FUNCTION public.get_referral_rewards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_referral_rewards() TO authenticated;

NOTIFY pgrst, 'reload schema';
