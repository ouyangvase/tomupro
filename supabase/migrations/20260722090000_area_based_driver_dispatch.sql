-- Area-based Runner dispatch and bulk Driver assignment.
-- Runner = dispatch operator. Driver = delivery user assigned on orders.driver_id.

CREATE TABLE IF NOT EXISTS public.delivery_areas (
  code text PRIMARY KEY,
  name text NOT NULL,
  district text,
  is_special boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_area_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_area_code text NOT NULL REFERENCES public.delivery_areas(code) ON DELETE CASCADE,
  rule_type text NOT NULL,
  normalized_value text NOT NULL,
  confidence numeric(4,3) NOT NULL DEFAULT 0.900,
  priority integer NOT NULL DEFAULT 10,
  source text NOT NULL DEFAULT 'seed',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_area_rules_unique UNIQUE (rule_type, normalized_value, delivery_area_code)
);

CREATE TABLE IF NOT EXISTS public.driver_area_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delivery_area_code text NOT NULL REFERENCES public.delivery_areas(code) ON DELETE CASCADE,
  preference_type text NOT NULL DEFAULT 'backup',
  capacity integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_area_preferences_unique UNIQUE (runner_id, driver_id, delivery_area_code)
);

CREATE TABLE IF NOT EXISTS public.driver_assignment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operational_date date NOT NULL,
  action text NOT NULL,
  selected_order_count integer NOT NULL DEFAULT 0,
  selected_collect_amount numeric(12,2) NOT NULL DEFAULT 0,
  old_driver_id uuid REFERENCES public.profiles(id),
  new_driver_id uuid REFERENCES public.profiles(id),
  created_by uuid REFERENCES public.profiles(id),
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  notification_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS normalized_address text,
  ADD COLUMN IF NOT EXISTS normalized_locality text,
  ADD COLUMN IF NOT EXISTS normalized_postal_code text,
  ADD COLUMN IF NOT EXISTS delivery_area_code text REFERENCES public.delivery_areas(code),
  ADD COLUMN IF NOT EXISTS delivery_area_name text,
  ADD COLUMN IF NOT EXISTS area_classification_status text,
  ADD COLUMN IF NOT EXISTS area_classification_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS area_classification_source text,
  ADD COLUMN IF NOT EXISTS area_classification_reason text,
  ADD COLUMN IF NOT EXISTS area_classified_at timestamptz,
  ADD COLUMN IF NOT EXISTS area_classified_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS area_manual_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS driver_assignment_batch_id uuid REFERENCES public.driver_assignment_batches(id),
  ADD COLUMN IF NOT EXISTS driver_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS driver_assigned_by uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_orders_delivery_area_code ON public.orders(delivery_area_code);
CREATE INDEX IF NOT EXISTS idx_orders_operational_date_driver ON public.orders((COALESCE(next_delivery_date, expected_pickup_date, order_date)), runner_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_area_rules_lookup ON public.delivery_area_rules(rule_type, active, priority DESC, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_driver_assignment_batches_date ON public.driver_assignment_batches(operational_date DESC, created_at DESC);

ALTER TABLE public.delivery_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_area_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_area_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_assignment_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_delivery_areas" ON public.delivery_areas;
CREATE POLICY "authenticated_read_delivery_areas"
ON public.delivery_areas FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "runner_admin_manage_delivery_areas" ON public.delivery_areas;
CREATE POLICY "runner_admin_manage_delivery_areas"
ON public.delivery_areas FOR ALL
USING (public.get_user_role(auth.uid())::text IN ('runner', 'admin'))
WITH CHECK (public.get_user_role(auth.uid())::text IN ('runner', 'admin'));

DROP POLICY IF EXISTS "authenticated_read_delivery_area_rules" ON public.delivery_area_rules;
CREATE POLICY "authenticated_read_delivery_area_rules"
ON public.delivery_area_rules FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "runner_admin_manage_delivery_area_rules" ON public.delivery_area_rules;
CREATE POLICY "runner_admin_manage_delivery_area_rules"
ON public.delivery_area_rules FOR ALL
USING (public.get_user_role(auth.uid())::text IN ('runner', 'admin'))
WITH CHECK (public.get_user_role(auth.uid())::text IN ('runner', 'admin'));

DROP POLICY IF EXISTS "runner_admin_manage_driver_area_preferences" ON public.driver_area_preferences;
CREATE POLICY "runner_admin_manage_driver_area_preferences"
ON public.driver_area_preferences FOR ALL
USING (runner_id = auth.uid() OR public.get_user_role(auth.uid())::text = 'admin')
WITH CHECK (runner_id = auth.uid() OR public.get_user_role(auth.uid())::text = 'admin');

DROP POLICY IF EXISTS "runner_admin_read_assignment_batches" ON public.driver_assignment_batches;
CREATE POLICY "runner_admin_read_assignment_batches"
ON public.driver_assignment_batches FOR SELECT
USING (created_by = auth.uid() OR public.get_user_role(auth.uid())::text = 'admin');

INSERT INTO public.delivery_areas (code, name, district, is_special, display_order)
VALUES
  ('BELAIT', 'Belait', 'Belait', false, 10),
  ('TUTONG', 'Tutong', 'Tutong', false, 20),
  ('TEMBURONG', 'Temburong', 'Temburong', false, 30),
  ('BM_GADONG_RIMBA', 'Gadong / Rimba', 'Brunei-Muara', false, 40),
  ('BM_BERAKAS_LAMBAK', 'Berakas / Lambak', 'Brunei-Muara', false, 50),
  ('BM_MENTIRI_MUARA', 'Mentiri / Muara', 'Brunei-Muara', false, 60),
  ('BM_JERUDONG_SENGKURONG', 'Jerudong / Sengkurong', 'Brunei-Muara', false, 70),
  ('BM_SOUTHWEST', 'Southwest BM', 'Brunei-Muara', false, 80),
  ('BM_BANDAR_LUMAPAS', 'Bandar / Lumapas', 'Brunei-Muara', false, 90),
  ('SELF_PICKUP', 'Self Pickup', NULL, true, 900),
  ('CANCELLED', 'Cancelled', NULL, true, 910),
  ('NEEDS_REVIEW', 'Needs Review', NULL, true, 920)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  district = EXCLUDED.district,
  is_special = EXCLUDED.is_special,
  display_order = EXCLUDED.display_order,
  updated_at = now();

INSERT INTO public.delivery_area_rules (delivery_area_code, rule_type, normalized_value, confidence, priority, source)
VALUES
  ('BELAIT', 'locality', 'KUALA BELAIT', 0.960, 70, 'seed'),
  ('BELAIT', 'locality', 'SERIA', 0.960, 70, 'seed'),
  ('BELAIT', 'locality', 'LUMUT', 0.950, 70, 'seed'),
  ('BELAIT', 'locality', 'PANAGA', 0.950, 70, 'seed'),
  ('BELAIT', 'locality', 'PANDAN', 0.930, 70, 'seed'),
  ('BELAIT', 'locality', 'MUMONG', 0.930, 70, 'seed'),
  ('BELAIT', 'locality', 'SUNGAI LIANG', 0.930, 70, 'seed'),
  ('TUTONG', 'locality', 'TUTONG', 0.960, 70, 'seed'),
  ('TUTONG', 'locality', 'BUKIT BERUANG', 0.950, 70, 'seed'),
  ('TUTONG', 'locality', 'KUPANG', 0.940, 70, 'seed'),
  ('TUTONG', 'locality', 'LAMUNIN', 0.940, 70, 'seed'),
  ('TUTONG', 'locality', 'KIUDANG', 0.940, 70, 'seed'),
  ('TUTONG', 'locality', 'PENANJONG', 0.940, 70, 'seed'),
  ('TUTONG', 'locality', 'LUGU', 0.860, 55, 'seed'),
  ('TEMBURONG', 'locality', 'TEMBURONG', 0.980, 80, 'seed'),
  ('TEMBURONG', 'locality', 'BANGAR', 0.970, 80, 'seed'),
  ('TEMBURONG', 'locality', 'BATANG DURI', 0.970, 80, 'seed'),
  ('TEMBURONG', 'locality', 'SIBUT', 0.970, 80, 'seed'),
  ('BM_GADONG_RIMBA', 'locality', 'GADONG', 0.950, 70, 'seed'),
  ('BM_GADONG_RIMBA', 'locality', 'RIMBA', 0.950, 70, 'seed'),
  ('BM_GADONG_RIMBA', 'locality', 'MATA MATA', 0.930, 70, 'seed'),
  ('BM_GADONG_RIMBA', 'locality', 'BERIBI', 0.930, 70, 'seed'),
  ('BM_GADONG_RIMBA', 'locality', 'KIARONG', 0.930, 70, 'seed'),
  ('BM_GADONG_RIMBA', 'locality', 'KIULAP', 0.930, 70, 'seed'),
  ('BM_GADONG_RIMBA', 'locality', 'TUNGKU', 0.900, 60, 'seed'),
  ('BM_GADONG_RIMBA', 'locality', 'KATOK', 0.900, 60, 'seed'),
  ('BM_BERAKAS_LAMBAK', 'locality', 'BERAKAS', 0.950, 70, 'seed'),
  ('BM_BERAKAS_LAMBAK', 'locality', 'LAMBAK', 0.950, 70, 'seed'),
  ('BM_BERAKAS_LAMBAK', 'locality', 'AIRPORT', 0.910, 60, 'seed'),
  ('BM_BERAKAS_LAMBAK', 'locality', 'MADANG', 0.930, 70, 'seed'),
  ('BM_BERAKAS_LAMBAK', 'locality', 'PANCHA DELIMA', 0.930, 70, 'seed'),
  ('BM_BERAKAS_LAMBAK', 'locality', 'SERUSOP', 0.930, 70, 'seed'),
  ('BM_BERAKAS_LAMBAK', 'locality', 'SUNGAI TILONG', 0.930, 70, 'seed'),
  ('BM_MENTIRI_MUARA', 'locality', 'MENTIRI', 0.950, 70, 'seed'),
  ('BM_MENTIRI_MUARA', 'locality', 'TANAH JAMBU', 0.930, 70, 'seed'),
  ('BM_MENTIRI_MUARA', 'locality', 'MENGKUBAU', 0.930, 70, 'seed'),
  ('BM_MENTIRI_MUARA', 'locality', 'MERAGANG', 0.930, 70, 'seed'),
  ('BM_MENTIRI_MUARA', 'locality', 'MUARA', 0.950, 70, 'seed'),
  ('BM_MENTIRI_MUARA', 'locality', 'SERASA', 0.930, 70, 'seed'),
  ('BM_MENTIRI_MUARA', 'locality', 'SALAMBIGAR', 0.930, 70, 'seed'),
  ('BM_JERUDONG_SENGKURONG', 'locality', 'JERUDONG', 0.950, 70, 'seed'),
  ('BM_JERUDONG_SENGKURONG', 'locality', 'SENGKURONG', 0.950, 70, 'seed'),
  ('BM_JERUDONG_SENGKURONG', 'locality', 'KILANAS', 0.930, 70, 'seed'),
  ('BM_JERUDONG_SENGKURONG', 'locality', 'TANJONG BUNUT', 0.930, 70, 'seed'),
  ('BM_JERUDONG_SENGKURONG', 'locality', 'TANJUNG BUNUT', 0.930, 70, 'seed'),
  ('BM_JERUDONG_SENGKURONG', 'locality', 'TANJONG NANGKA', 0.930, 70, 'seed'),
  ('BM_JERUDONG_SENGKURONG', 'locality', 'SELAYUN', 0.930, 70, 'seed'),
  ('BM_JERUDONG_SENGKURONG', 'locality', 'MULAUT', 0.930, 70, 'seed'),
  ('BM_SOUTHWEST', 'locality', 'BENGKURONG', 0.930, 70, 'seed'),
  ('BM_SOUTHWEST', 'locality', 'MASIN', 0.930, 70, 'seed'),
  ('BM_SOUTHWEST', 'locality', 'BUNUT', 0.880, 55, 'seed'),
  ('BM_SOUTHWEST', 'locality', 'MADEWA', 0.930, 70, 'seed'),
  ('BM_SOUTHWEST', 'locality', 'SINARUBAI', 0.930, 70, 'seed'),
  ('BM_SOUTHWEST', 'locality', 'PENGKALAN BATU', 0.930, 70, 'seed'),
  ('BM_SOUTHWEST', 'locality', 'BATONG', 0.930, 70, 'seed'),
  ('BM_SOUTHWEST', 'locality', 'BEBULOH', 0.930, 70, 'seed'),
  ('BM_BANDAR_LUMAPAS', 'locality', 'BANDAR SERI BEGAWAN', 0.940, 70, 'seed'),
  ('BM_BANDAR_LUMAPAS', 'locality', 'KAMPONG AYER', 0.940, 70, 'seed'),
  ('BM_BANDAR_LUMAPAS', 'locality', 'TAMOI', 0.940, 70, 'seed'),
  ('BM_BANDAR_LUMAPAS', 'locality', 'SETIA', 0.880, 55, 'seed'),
  ('BM_BANDAR_LUMAPAS', 'locality', 'LUMAPAS', 0.940, 70, 'seed'),
  ('BM_BANDAR_LUMAPAS', 'locality', 'JUNJONGAN', 0.940, 70, 'seed'),
  ('BM_BANDAR_LUMAPAS', 'locality', 'KASAT', 0.940, 70, 'seed'),
  ('BM_BANDAR_LUMAPAS', 'locality', 'BATU SATU', 0.940, 70, 'seed')
ON CONFLICT (rule_type, normalized_value, delivery_area_code) DO UPDATE SET
  confidence = EXCLUDED.confidence,
  priority = EXCLUDED.priority,
  source = EXCLUDED.source,
  active = true,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.normalize_brunei_address(p_address text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(upper(COALESCE(p_address, '')), '[,.;:/\\\-]+', ' ', 'g'),
                '\mKPG\M|\mKG\M',
                'KAMPONG',
                'g'
              ),
              '\mJLN\M',
              'JALAN',
              'g'
            ),
            '\mSPG\M',
            'SIMPANG',
            'g'
          ),
          '\s+',
          ' ',
          'g'
        ),
        'KAMPONG KAMPONG',
        'KAMPONG',
        'g'
      )
    ),
    ''
  )
$$;

CREATE OR REPLACE FUNCTION public.classify_delivery_area(p_address text, p_status text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized text := public.normalize_brunei_address(p_address);
  v_rule record;
  v_area record;
  v_status text := upper(COALESCE(p_status, ''));
BEGIN
  IF v_status = 'CANCELLED' OR v_normalized LIKE '%CANCEL FEE%' THEN
    SELECT * INTO v_area FROM public.delivery_areas WHERE code = 'CANCELLED';
    RETURN jsonb_build_object(
      'delivery_area', v_area.code,
      'delivery_area_name', v_area.name,
      'district', v_area.district,
      'confidence', 1.0,
      'source', 'status',
      'reason', 'Order is cancelled or cancel-fee only',
      'needs_review', false,
      'is_special', true,
      'normalized_address', v_normalized
    );
  END IF;

  IF v_normalized IS NULL OR v_normalized IN ('-', '.', 'N A', 'NA', 'NONE') THEN
    SELECT * INTO v_area FROM public.delivery_areas WHERE code = 'NEEDS_REVIEW';
    RETURN jsonb_build_object(
      'delivery_area', v_area.code,
      'delivery_area_name', v_area.name,
      'district', v_area.district,
      'confidence', 0.0,
      'source', 'missing_address',
      'reason', 'Address is empty or not usable',
      'needs_review', true,
      'is_special', true,
      'normalized_address', v_normalized
    );
  END IF;

  IF v_normalized LIKE '%PICK UP%' OR v_normalized LIKE '%PICKUP%' OR v_normalized LIKE '%SELF PICK%' OR v_normalized LIKE '%SELF COLLECT%' THEN
    SELECT * INTO v_area FROM public.delivery_areas WHERE code = 'SELF_PICKUP';
    RETURN jsonb_build_object(
      'delivery_area', v_area.code,
      'delivery_area_name', v_area.name,
      'district', v_area.district,
      'confidence', 1.0,
      'source', 'self_pickup_keyword',
      'reason', 'Address indicates pickup/self-collection',
      'needs_review', false,
      'is_special', true,
      'normalized_address', v_normalized
    );
  END IF;

  SELECT r.*, da.name, da.district, da.is_special
  INTO v_rule
  FROM public.delivery_area_rules r
  JOIN public.delivery_areas da ON da.code = r.delivery_area_code
  WHERE r.active = true
    AND da.active = true
    AND (
      (r.rule_type = 'exact_address' AND v_normalized = r.normalized_value)
      OR (r.rule_type IN ('locality', 'kampong', 'mukim', 'landmark', 'postal_code', 'postal_prefix')
        AND v_normalized LIKE ('%' || r.normalized_value || '%'))
    )
  ORDER BY
    CASE WHEN r.rule_type = 'exact_address' THEN 1 ELSE 2 END,
    r.priority DESC,
    r.confidence DESC,
    length(r.normalized_value) DESC
  LIMIT 1;

  IF FOUND AND v_rule.confidence >= 0.75 THEN
    RETURN jsonb_build_object(
      'delivery_area', v_rule.delivery_area_code,
      'delivery_area_name', v_rule.name,
      'district', v_rule.district,
      'confidence', v_rule.confidence,
      'source', v_rule.rule_type,
      'reason', 'Matched ' || v_rule.rule_type || ': ' || v_rule.normalized_value,
      'needs_review', v_rule.confidence < 0.90,
      'is_special', COALESCE(v_rule.is_special, false),
      'normalized_address', v_normalized
    );
  END IF;

  SELECT * INTO v_area FROM public.delivery_areas WHERE code = 'NEEDS_REVIEW';
  RETURN jsonb_build_object(
    'delivery_area', v_area.code,
    'delivery_area_name', v_area.name,
    'district', v_area.district,
    'confidence', COALESCE(v_rule.confidence, 0.0),
    'source', COALESCE(v_rule.rule_type, 'no_rule_match'),
    'reason', CASE
      WHEN FOUND THEN 'Low-confidence area match: ' || v_rule.normalized_value
      ELSE 'No configured locality, postal, landmark, or exact-address rule matched'
    END,
    'needs_review', true,
    'is_special', true,
    'normalized_address', v_normalized
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.classify_order_delivery_area(p_order_id uuid, p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text := public.get_user_role(v_user)::text;
  v_order public.orders%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_role NOT IN ('runner', 'admin') THEN
    RAISE EXCEPTION 'Only runner users can classify dispatch areas';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND (runner_id = v_user OR v_role = 'admin')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not allowed';
  END IF;

  IF v_order.area_manual_override = true AND p_force = false THEN
    RETURN jsonb_build_object(
      'delivery_area', v_order.delivery_area_code,
      'delivery_area_name', v_order.delivery_area_name,
      'confidence', v_order.area_classification_confidence,
      'source', 'manual_override',
      'reason', v_order.area_classification_reason,
      'needs_review', COALESCE(v_order.area_classification_status = 'NEEDS_REVIEW', false)
    );
  END IF;

  v_result := public.classify_delivery_area(v_order.address, v_order.status::text);

  UPDATE public.orders
  SET normalized_address = v_result->>'normalized_address',
      delivery_area_code = v_result->>'delivery_area',
      delivery_area_name = v_result->>'delivery_area_name',
      area_classification_status = CASE WHEN (v_result->>'needs_review')::boolean THEN 'NEEDS_REVIEW' ELSE 'CLASSIFIED' END,
      area_classification_confidence = (v_result->>'confidence')::numeric,
      area_classification_source = v_result->>'source',
      area_classification_reason = v_result->>'reason',
      area_classified_at = now(),
      area_classified_by = v_user,
      updated_at = now(),
      area = CASE WHEN area IS NULL OR btrim(area) = '' THEN v_result->>'delivery_area' ELSE area END
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, after_json)
  VALUES ('order', p_order_id, 'AREA_CLASSIFIED', v_user, v_result);

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_runner_dispatch_area_summary(p_operational_date date)
RETURNS TABLE (
  area_code text,
  area_name text,
  district text,
  is_special boolean,
  total_orders integer,
  assigned_orders integer,
  unassigned_orders integer,
  assignment_percentage numeric,
  total_collect_amount numeric,
  assigned_collect_amount numeric,
  unassigned_collect_amount numeric,
  needs_review_orders integer,
  active_driver_count integer,
  driver_names text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      o.*,
      COALESCE(o.delivery_area_code, public.classify_delivery_area(o.address, o.status::text)->>'delivery_area') AS resolved_area_code,
      CASE WHEN o.payment_method::text = 'COD' THEN COALESCE(o.total_amount, 0) ELSE 0 END AS collect_amount
    FROM public.orders o
    WHERE COALESCE(o.next_delivery_date, o.expected_pickup_date, o.order_date) = p_operational_date
      AND (
        public.get_user_role(auth.uid())::text = 'admin'
        OR (public.get_user_role(auth.uid())::text = 'runner' AND o.runner_id = auth.uid())
      )
  ),
  area_rows AS (
    SELECT
      da.code,
      da.name,
      da.district,
      da.is_special,
      s.id,
      s.driver_id,
      s.driver_status,
      s.collect_amount,
      p.display_name AS driver_name
    FROM public.delivery_areas da
    LEFT JOIN scoped s ON s.resolved_area_code = da.code
    LEFT JOIN public.profiles p ON p.id = s.driver_id
    WHERE da.active = true
  )
  SELECT
    code AS area_code,
    name AS area_name,
    district,
    is_special,
    COUNT(id)::integer AS total_orders,
    CASE WHEN is_special THEN 0 ELSE COUNT(id) FILTER (WHERE driver_id IS NOT NULL AND COALESCE(driver_status, 'UNASSIGNED') <> 'UNASSIGNED')::integer END AS assigned_orders,
    CASE WHEN is_special THEN 0 ELSE COUNT(id) FILTER (WHERE driver_id IS NULL OR COALESCE(driver_status, 'UNASSIGNED') = 'UNASSIGNED')::integer END AS unassigned_orders,
    CASE
      WHEN is_special OR COUNT(id) = 0 THEN 0
      ELSE ROUND((COUNT(id) FILTER (WHERE driver_id IS NOT NULL AND COALESCE(driver_status, 'UNASSIGNED') <> 'UNASSIGNED')::numeric / COUNT(id)::numeric) * 100, 1)
    END AS assignment_percentage,
    COALESCE(SUM(collect_amount), 0)::numeric AS total_collect_amount,
    CASE WHEN is_special THEN 0 ELSE COALESCE(SUM(collect_amount) FILTER (WHERE driver_id IS NOT NULL AND COALESCE(driver_status, 'UNASSIGNED') <> 'UNASSIGNED'), 0)::numeric END AS assigned_collect_amount,
    CASE WHEN is_special THEN 0 ELSE COALESCE(SUM(collect_amount) FILTER (WHERE driver_id IS NULL OR COALESCE(driver_status, 'UNASSIGNED') = 'UNASSIGNED'), 0)::numeric END AS unassigned_collect_amount,
    COUNT(id) FILTER (WHERE code = 'NEEDS_REVIEW')::integer AS needs_review_orders,
    COUNT(DISTINCT driver_id) FILTER (WHERE driver_id IS NOT NULL)::integer AS active_driver_count,
    COALESCE(array_remove(array_agg(DISTINCT driver_name), NULL), ARRAY[]::text[]) AS driver_names
  FROM area_rows
  GROUP BY code, name, district, is_special
  ORDER BY min((SELECT display_order FROM public.delivery_areas da2 WHERE da2.code = area_rows.code)), code;
$$;

CREATE OR REPLACE FUNCTION public.apply_driver_assignment_batch(
  p_order_ids uuid[],
  p_driver_id uuid,
  p_operational_date date,
  p_action text DEFAULT 'ASSIGN'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text := public.get_user_role(v_user)::text;
  v_batch_id uuid;
  v_order_count integer;
  v_conflict_count integer;
  v_invalid_count integer;
  v_collect_amount numeric(12,2);
  v_driver_name text;
  v_area_names text[];
  v_notification_id uuid;
  v_action text := upper(COALESCE(p_action, 'ASSIGN'));
BEGIN
  IF v_role NOT IN ('runner', 'admin') THEN
    RAISE EXCEPTION 'Only runner users can assign driver orders';
  END IF;

  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No orders selected';
  END IF;

  IF v_action NOT IN ('ASSIGN', 'REASSIGN') THEN
    RAISE EXCEPTION 'Unsupported assignment action %', p_action;
  END IF;

  IF v_role <> 'admin' AND NOT EXISTS (
    SELECT 1 FROM public.runner_drivers
    WHERE runner_id = v_user AND driver_id = p_driver_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Selected driver is not linked to this runner';
  END IF;

  SELECT display_name INTO v_driver_name FROM public.profiles WHERE id = p_driver_id AND role::text = 'driver';
  IF v_driver_name IS NULL THEN
    RAISE EXCEPTION 'Selected driver is invalid';
  END IF;

  WITH selected AS (
    SELECT o.*
    FROM public.orders o
    WHERE o.id = ANY(p_order_ids)
    FOR UPDATE
  )
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (
      WHERE COALESCE(next_delivery_date, expected_pickup_date, order_date) <> p_operational_date
        OR status = 'CANCELLED'
        OR COALESCE(delivery_area_code, public.classify_delivery_area(address, status::text)->>'delivery_area') IN ('SELF_PICKUP', 'CANCELLED', 'NEEDS_REVIEW')
        OR NOT (runner_id = v_user OR v_role = 'admin')
    )::integer,
    COUNT(*) FILTER (
      WHERE v_action = 'ASSIGN'
        AND driver_id IS NOT NULL
        AND COALESCE(driver_status, 'UNASSIGNED') <> 'UNASSIGNED'
    )::integer,
    COALESCE(SUM(CASE WHEN payment_method::text = 'COD' THEN total_amount ELSE 0 END), 0)::numeric
  INTO v_order_count, v_invalid_count, v_conflict_count, v_collect_amount
  FROM selected;

  IF v_order_count <> array_length(p_order_ids, 1) THEN
    RAISE EXCEPTION 'Some selected orders were not found';
  END IF;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION '% selected orders are not assignable for this date or still need review', v_invalid_count;
  END IF;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION '% selected orders already have a driver. Use Reassign.', v_conflict_count;
  END IF;

  SELECT COALESCE(array_remove(array_agg(DISTINCT COALESCE(delivery_area_name, delivery_area_code, area)), NULL), ARRAY[]::text[])
  INTO v_area_names
  FROM public.orders
  WHERE id = ANY(p_order_ids);

  INSERT INTO public.driver_assignment_batches (
    operational_date,
    action,
    selected_order_count,
    selected_collect_amount,
    new_driver_id,
    created_by,
    result_summary
  ) VALUES (
    p_operational_date,
    v_action,
    v_order_count,
    v_collect_amount,
    p_driver_id,
    v_user,
    jsonb_build_object('areas', v_area_names, 'driver_name', v_driver_name)
  )
  RETURNING id INTO v_batch_id;

  UPDATE public.orders
  SET driver_id = p_driver_id,
      driver_status = 'ASSIGNED',
      driver_assignment_batch_id = v_batch_id,
      driver_assigned_at = now(),
      driver_assigned_by = v_user,
      updated_at = now()
  WHERE id = ANY(p_order_ids);

  INSERT INTO public.notifications (
    user_id, title, message, type, priority,
    reference_type, reference_id, entity_type, recipient_role
  )
  VALUES (
    p_driver_id,
    CASE WHEN v_action = 'REASSIGN' THEN 'Delivery Orders Reassigned' ELSE 'New Delivery Orders Assigned' END,
    'You have received ' || v_order_count || ' delivery order(s).' ||
      E'\nDate: ' || to_char(p_operational_date, 'DD Mon YYYY') ||
      E'\nArea(s): ' || COALESCE(array_to_string(v_area_names, ', '), 'Not specified') ||
      E'\nCollection amount: BND ' || to_char(v_collect_amount, 'FM999999990.00') ||
      E'\nOpen My Deliveries to view the orders.',
    'DRIVER_BULK_ASSIGNMENT',
    'HIGH',
    'driver_assignment_batch',
    v_batch_id,
    'DRIVER_ASSIGNMENT',
    'driver'
  )
  RETURNING id INTO v_notification_id;

  UPDATE public.driver_assignment_batches
  SET notification_id = v_notification_id,
      result_summary = result_summary || jsonb_build_object('notification_id', v_notification_id, 'status', 'applied')
  WHERE id = v_batch_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, after_json)
  VALUES (
    'driver_assignment_batch',
    v_batch_id,
    'BULK_DRIVER_' || v_action,
    v_user,
    jsonb_build_object(
      'order_ids', p_order_ids,
      'driver_id', p_driver_id,
      'driver_name', v_driver_name,
      'operational_date', p_operational_date,
      'order_count', v_order_count,
      'collect_amount', v_collect_amount,
      'areas', v_area_names
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'assigned_count', v_order_count,
    'collect_amount', v_collect_amount,
    'driver_id', p_driver_id,
    'driver_name', v_driver_name,
    'notification_id', v_notification_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_driver_assignment_batch(
  p_order_ids uuid[],
  p_operational_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text := public.get_user_role(v_user)::text;
  v_batch_id uuid;
  v_order_count integer;
  v_collect_amount numeric(12,2);
BEGIN
  IF v_role NOT IN ('runner', 'admin') THEN
    RAISE EXCEPTION 'Only runner users can remove driver assignments';
  END IF;

  WITH selected AS (
    SELECT *
    FROM public.orders
    WHERE id = ANY(p_order_ids)
      AND COALESCE(next_delivery_date, expected_pickup_date, order_date) = p_operational_date
      AND (runner_id = v_user OR v_role = 'admin')
    FOR UPDATE
  )
  SELECT COUNT(*)::integer,
         COALESCE(SUM(CASE WHEN payment_method::text = 'COD' THEN total_amount ELSE 0 END), 0)::numeric
  INTO v_order_count, v_collect_amount
  FROM selected;

  IF v_order_count <> array_length(p_order_ids, 1) THEN
    RAISE EXCEPTION 'Some selected orders were not found or are not allowed';
  END IF;

  INSERT INTO public.driver_assignment_batches (
    operational_date, action, selected_order_count, selected_collect_amount, created_by, result_summary
  )
  VALUES (p_operational_date, 'UNASSIGN', v_order_count, v_collect_amount, v_user, jsonb_build_object('status', 'applied'))
  RETURNING id INTO v_batch_id;

  UPDATE public.orders
  SET driver_id = NULL,
      driver_status = 'UNASSIGNED',
      driver_assignment_batch_id = v_batch_id,
      driver_assigned_at = NULL,
      driver_assigned_by = NULL,
      updated_at = now()
  WHERE id = ANY(p_order_ids);

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, after_json)
  VALUES ('driver_assignment_batch', v_batch_id, 'BULK_DRIVER_UNASSIGN', v_user,
          jsonb_build_object('order_ids', p_order_ids, 'operational_date', p_operational_date, 'order_count', v_order_count));

  RETURN jsonb_build_object('success', true, 'batch_id', v_batch_id, 'unassigned_count', v_order_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_order_delivery_area(
  p_order_id uuid,
  p_delivery_area_code text,
  p_save_exact boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text := public.get_user_role(v_user)::text;
  v_order public.orders%ROWTYPE;
  v_area public.delivery_areas%ROWTYPE;
  v_normalized text;
BEGIN
  IF v_role NOT IN ('runner', 'admin') THEN
    RAISE EXCEPTION 'Only runner users can correct dispatch areas';
  END IF;

  SELECT * INTO v_area FROM public.delivery_areas WHERE code = p_delivery_area_code AND active = true AND is_special = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid normal delivery area';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND (runner_id = v_user OR v_role = 'admin')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not allowed';
  END IF;

  v_normalized := public.normalize_brunei_address(v_order.address);

  UPDATE public.orders
  SET normalized_address = v_normalized,
      delivery_area_code = v_area.code,
      delivery_area_name = v_area.name,
      area = v_area.code,
      area_classification_status = 'CLASSIFIED',
      area_classification_confidence = 1.0,
      area_classification_source = 'manual_override',
      area_classification_reason = 'Runner corrected delivery area',
      area_classified_at = now(),
      area_classified_by = v_user,
      area_manual_override = true,
      updated_at = now()
  WHERE id = p_order_id;

  IF p_save_exact AND v_normalized IS NOT NULL THEN
    INSERT INTO public.delivery_area_rules (
      delivery_area_code, rule_type, normalized_value, confidence, priority, source
    ) VALUES (
      v_area.code, 'exact_address', v_normalized, 0.990, 100, 'runner_manual_correction'
    )
    ON CONFLICT (rule_type, normalized_value, delivery_area_code) DO UPDATE SET
      confidence = EXCLUDED.confidence,
      priority = EXCLUDED.priority,
      source = EXCLUDED.source,
      active = true,
      updated_at = now();
  END IF;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
  VALUES (
    'order',
    p_order_id,
    'AREA_MANUALLY_CORRECTED',
    v_user,
    jsonb_build_object('delivery_area_code', v_order.delivery_area_code, 'reason', v_order.area_classification_reason),
    jsonb_build_object('delivery_area_code', v_area.code, 'delivery_area_name', v_area.name, 'saved_exact_rule', p_save_exact)
  );

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'delivery_area_code', v_area.code, 'delivery_area_name', v_area.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.dry_run_delivery_area_backfill(p_operational_date date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      o.id,
      o.status,
      o.address,
      o.delivery_area_code,
      o.area_manual_override,
      o.driver_id,
      public.classify_delivery_area(o.address, o.status::text) AS result
    FROM public.orders o
    WHERE COALESCE(o.next_delivery_date, o.expected_pickup_date, o.order_date) = p_operational_date
      AND (
        public.get_user_role(auth.uid())::text = 'admin'
        OR (public.get_user_role(auth.uid())::text = 'runner' AND o.runner_id = auth.uid())
      )
  )
  SELECT jsonb_build_object(
    'operational_date', p_operational_date,
    'total_orders_checked', COUNT(*),
    'already_classified', COUNT(*) FILTER (WHERE delivery_area_code IS NOT NULL),
    'manual_overrides', COUNT(*) FILTER (WHERE area_manual_override = true),
    'automatically_classifiable', COUNT(*) FILTER (WHERE delivery_area_code IS NULL AND (result->>'needs_review')::boolean = false AND (result->>'is_special')::boolean = false),
    'low_confidence', COUNT(*) FILTER (WHERE (result->>'needs_review')::boolean = true AND (result->>'is_special')::boolean = false),
    'needs_review', COUNT(*) FILTER (WHERE result->>'delivery_area' = 'NEEDS_REVIEW'),
    'self_pickup', COUNT(*) FILTER (WHERE result->>'delivery_area' = 'SELF_PICKUP'),
    'cancelled', COUNT(*) FILTER (WHERE result->>'delivery_area' = 'CANCELLED'),
    'existing_driver_assignments', COUNT(*) FILTER (WHERE driver_id IS NOT NULL)
  )
  FROM scoped;
$$;

CREATE OR REPLACE FUNCTION public.apply_delivery_area_backfill(p_operational_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text := public.get_user_role(v_user)::text;
  v_order record;
  v_result jsonb;
  v_applied integer := 0;
  v_needs_review integer := 0;
BEGIN
  IF v_role NOT IN ('runner', 'admin') THEN
    RAISE EXCEPTION 'Only runner users can apply dispatch classification backfill';
  END IF;

  FOR v_order IN
    SELECT id
    FROM public.orders
    WHERE COALESCE(next_delivery_date, expected_pickup_date, order_date) = p_operational_date
      AND delivery_area_code IS NULL
      AND COALESCE(area_manual_override, false) = false
      AND (runner_id = v_user OR v_role = 'admin')
  LOOP
    v_result := public.classify_order_delivery_area(v_order.id, false);
    v_applied := v_applied + 1;
    IF (v_result->>'needs_review')::boolean THEN
      v_needs_review := v_needs_review + 1;
    END IF;
  END LOOP;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, after_json)
  VALUES (
    'driver_assignment_batch',
    gen_random_uuid(),
    'AREA_CLASSIFICATION_BACKFILL',
    v_user,
    jsonb_build_object('operational_date', p_operational_date, 'orders_classified', v_applied, 'needs_review', v_needs_review)
  );

  RETURN jsonb_build_object(
    'success', true,
    'operational_date', p_operational_date,
    'orders_classified', v_applied,
    'needs_review', v_needs_review
  );
END;
$$;
