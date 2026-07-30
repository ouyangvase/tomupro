-- Driver Inbox delivery areas are operational dispatch zones. They must never
-- read from or write to orders.area, which remains the canonical business area
-- used by delivery charges, claims, finance, sales, and reports.

CREATE OR REPLACE FUNCTION public.classify_order_delivery_area(
  p_order_id uuid,
  p_force boolean DEFAULT false
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
      area_classification_status = CASE
        WHEN (v_result->>'needs_review')::boolean THEN 'NEEDS_REVIEW'
        ELSE 'CLASSIFIED'
      END,
      area_classification_confidence = (v_result->>'confidence')::numeric,
      area_classification_source = v_result->>'source',
      area_classification_reason = v_result->>'reason',
      area_classified_at = now(),
      area_classified_by = v_user,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, after_json)
  VALUES ('order', p_order_id, 'AREA_CLASSIFIED', v_user, v_result);

  RETURN v_result;
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
  v_learned_order_count integer := 0;
BEGIN
  IF v_role NOT IN ('runner', 'admin') THEN
    RAISE EXCEPTION 'Only runner users can correct dispatch areas';
  END IF;

  SELECT * INTO v_area
  FROM public.delivery_areas
  WHERE code = p_delivery_area_code
    AND active = true
    AND is_special = false;

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
    UPDATE public.delivery_area_rules
    SET active = false,
        updated_at = now()
    WHERE rule_type = 'exact_address'
      AND normalized_value = v_normalized
      AND delivery_area_code <> v_area.code
      AND active = true;

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

    WITH learned_orders AS (
      UPDATE public.orders AS o
      SET normalized_address = v_normalized,
          delivery_area_code = v_area.code,
          delivery_area_name = v_area.name,
          area_classification_status = 'CLASSIFIED',
          area_classification_confidence = 0.990,
          area_classification_source = 'learned_exact_address',
          area_classification_reason = 'Matched learned exact address from runner correction',
          area_classified_at = now(),
          area_classified_by = v_user,
          updated_at = now()
      WHERE o.id <> p_order_id
        AND COALESCE(o.area_manual_override, false) = false
        AND (v_role = 'admin' OR o.runner_id = v_user)
        AND (
          o.delivery_area_code IS NULL
          OR o.delivery_area_code = 'NEEDS_REVIEW'
          OR o.area_classification_status = 'NEEDS_REVIEW'
        )
        AND public.normalize_brunei_address(o.address) = v_normalized
      RETURNING o.id
    ),
    audit AS (
      INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, after_json)
      SELECT
        'order',
        id,
        'AREA_CLASSIFIED_FROM_LEARNED_EXACT_ADDRESS',
        v_user,
        jsonb_build_object(
          'delivery_area_code', v_area.code,
          'delivery_area_name', v_area.name,
          'normalized_address', v_normalized,
          'source_order_id', p_order_id
        )
      FROM learned_orders
      RETURNING 1
    )
    SELECT COUNT(*)::integer INTO v_learned_order_count
    FROM audit;
  END IF;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
  VALUES (
    'order',
    p_order_id,
    'AREA_MANUALLY_CORRECTED',
    v_user,
    jsonb_build_object(
      'delivery_area_code', v_order.delivery_area_code,
      'reason', v_order.area_classification_reason
    ),
    jsonb_build_object(
      'delivery_area_code', v_area.code,
      'delivery_area_name', v_area.name,
      'saved_exact_rule', p_save_exact,
      'learned_matching_orders', v_learned_order_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'delivery_area_code', v_area.code,
    'delivery_area_name', v_area.name,
    'saved_exact_rule', p_save_exact,
    'learned_order_count', v_learned_order_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.canonicalize_order_delivery_area()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_area_code text;
  v_area_name text;
BEGIN
  IF NEW.delivery_area_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_area_code := public.classify_delivery_area(NEW.address, NEW.status::text)->>'delivery_area';
  IF v_area_code IS NULL OR v_area_code = 'NEEDS_REVIEW' THEN
    RETURN NEW;
  END IF;

  SELECT name
  INTO v_area_name
  FROM public.delivery_areas
  WHERE code = v_area_code
    AND active = true;

  IF v_area_name IS NOT NULL THEN
    NEW.delivery_area_code := v_area_code;
    NEW.delivery_area_name := v_area_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canonicalize_order_delivery_area ON public.orders;
CREATE TRIGGER trg_canonicalize_order_delivery_area
  BEFORE INSERT OR UPDATE OF address, status, delivery_area_code
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.canonicalize_order_delivery_area();

CREATE OR REPLACE FUNCTION public.get_runner_dispatch_area_order_ids(
  p_operational_date date,
  p_delivery_area_code text,
  p_unassigned_only boolean DEFAULT true
)
RETURNS TABLE (
  order_id uuid,
  order_code text,
  delivery_area_code text,
  delivery_area_name text,
  collect_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      o.id,
      o.order_code,
      o.driver_id,
      o.driver_status,
      COALESCE(
        o.delivery_area_code,
        public.classify_delivery_area(o.address, o.status::text)->>'delivery_area'
      ) AS resolved_area_code,
      public.order_collection_amount(o.payment_method::text, o.total_amount) AS collect_amount
    FROM public.orders o
    WHERE (
        (
          p_operational_date IS NULL
          AND public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)
        )
        OR (
          p_operational_date IS NOT NULL
          AND public.order_operational_date(
            o.next_delivery_date,
            o.expected_pickup_date,
            o.order_date
          ) = p_operational_date
        )
      )
      AND (
        public.get_user_role(auth.uid())::text = 'admin'
        OR (
          public.get_user_role(auth.uid())::text = 'runner'
          AND o.runner_id = auth.uid()
        )
        OR public.has_runner_assistant_permission(
          auth.uid(),
          o.runner_id,
          'driver_inbox'
        )
      )
  )
  SELECT
    s.id AS order_id,
    s.order_code,
    da.code AS delivery_area_code,
    da.name AS delivery_area_name,
    s.collect_amount
  FROM scoped s
  JOIN public.delivery_areas da ON da.code = s.resolved_area_code
  WHERE da.active = true
    AND da.is_special = false
    AND da.code = p_delivery_area_code
    AND (
      p_unassigned_only IS NOT TRUE
      OR s.driver_id IS NULL
      OR COALESCE(s.driver_status::text, 'UNASSIGNED') = 'UNASSIGNED'
    )
  ORDER BY s.order_code NULLS LAST, s.id
$$;

REVOKE ALL ON FUNCTION public.get_runner_dispatch_area_order_ids(date, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_runner_dispatch_area_order_ids(date, text, boolean) TO authenticated;

-- Preserve the complete production repair input in a non-API schema before
-- changing any business-area value.
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.driver_inbox_area_isolation_repair_20260731 (
  order_id uuid PRIMARY KEY,
  order_code text,
  address text,
  phone text,
  runner_id uuid,
  order_created_at timestamptz,
  order_updated_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  area_before text,
  delivery_area_code_before text,
  delivery_area_name_before text,
  classification_status_before text,
  classification_source_before text,
  classification_reason_before text,
  classification_at_before timestamptz,
  proposed_restored_area text,
  recovery_evidence text,
  recovery_confidence text NOT NULL,
  safe_to_auto_repair boolean NOT NULL,
  charge_rate_match_before boolean NOT NULL,
  charge_rate_match_after boolean,
  repaired_at timestamptz
);

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON TABLE private.driver_inbox_area_isolation_repair_20260731
  FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE driver_inbox_area_repair_plan ON COMMIT DROP AS
WITH polluted AS (
  SELECT o.*
  FROM public.orders o
  WHERE o.area = ANY (ARRAY[
    'BM_MENTIRI_MUARA',
    'BM_GADONG_RIMBA',
    'BM_BANDAR_LUMAPAS',
    'BM_BERAKAS_LAMBAK',
    'BM_JERUDONG_SENGKURONG',
    'BM_SOUTHWEST',
    'BELAIT',
    'TUTONG',
    'TEMBURONG'
  ])
    AND o.area_classification_source IN ('manual_override', 'learned_exact_address')
),
audit_candidates AS (
  SELECT
    p.id AS order_id,
    candidate.area,
    'audit_history'::text AS evidence_source
  FROM polluted p
  JOIN public.audit_logs a ON a.entity_id = p.id OR a.order_id = p.id
  CROSS JOIN LATERAL (
    VALUES (a.before_json->>'area'), (a.after_json->>'area')
  ) candidate(area)
  WHERE EXISTS (
    SELECT 1 FROM public.delivery_charges dc WHERE dc.area = candidate.area
  )
),
backup_candidates AS (
  SELECT id AS order_id, area, 'backup'::text AS evidence_source
  FROM public.orders_total_amount_fix_backup_20260702_0010_orders b
  WHERE EXISTS (SELECT 1 FROM public.delivery_charges dc WHERE dc.area = b.area)
  UNION ALL
  SELECT id, area, 'backup'
  FROM public.orders_total_amount_fix_backup_20260709_orders b
  WHERE EXISTS (SELECT 1 FROM public.delivery_charges dc WHERE dc.area = b.area)
  UNION ALL
  SELECT id, area, 'backup'
  FROM public.price_fix_backup_20260627_all_orders b
  WHERE EXISTS (SELECT 1 FROM public.delivery_charges dc WHERE dc.area = b.area)
  UNION ALL
  SELECT id, area, 'backup'
  FROM public.price_fix_backup_20260627_orders b
  WHERE EXISTS (SELECT 1 FROM public.delivery_charges dc WHERE dc.area = b.area)
  UNION ALL
  SELECT id, area, 'backup'
  FROM public.price_fix_backup_20260629_orders b
  WHERE EXISTS (SELECT 1 FROM public.delivery_charges dc WHERE dc.area = b.area)
  UNION ALL
  SELECT id, area, 'backup'
  FROM public.price_total_fix_backup_20260701_1615_orders b
  WHERE EXISTS (SELECT 1 FROM public.delivery_charges dc WHERE dc.area = b.area)
),
direct_grouped AS (
  SELECT
    p.id AS order_id,
    min(c.area) AS area,
    string_agg(DISTINCT c.evidence_source, '+') AS evidence_source,
    count(DISTINCT c.area) AS candidate_count
  FROM polluted p
  LEFT JOIN (
    SELECT * FROM audit_candidates
    UNION ALL
    SELECT * FROM backup_candidates
  ) c ON c.order_id = p.id
  GROUP BY p.id
),
direct_unique AS (
  SELECT order_id, area, evidence_source
  FROM direct_grouped
  WHERE candidate_count = 1
),
address_grouped AS (
  SELECT
    p.id AS order_id,
    min(other.area) AS area,
    count(DISTINCT other.area) AS candidate_count
  FROM polluted p
  LEFT JOIN direct_unique d ON d.order_id = p.id
  LEFT JOIN public.orders other
    ON d.order_id IS NULL
   AND other.id <> p.id
   AND public.normalize_brunei_address(other.address) =
       public.normalize_brunei_address(p.address)
   AND EXISTS (
     SELECT 1 FROM public.delivery_charges dc WHERE dc.area = other.area
   )
  GROUP BY p.id
),
address_unique AS (
  SELECT
    order_id,
    area,
    'exact_normalized_address'::text AS evidence_source
  FROM address_grouped
  WHERE candidate_count = 1
),
phone_grouped AS (
  SELECT
    p.id AS order_id,
    min(other.area) AS area,
    count(DISTINCT other.area) AS candidate_count
  FROM polluted p
  LEFT JOIN direct_unique d ON d.order_id = p.id
  LEFT JOIN address_unique ad ON ad.order_id = p.id
  LEFT JOIN public.orders other
    ON d.order_id IS NULL
   AND ad.order_id IS NULL
   AND other.id <> p.id
   AND regexp_replace(COALESCE(other.phone, ''), '\D', '', 'g') =
       regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g')
   AND length(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g')) >= 6
   AND EXISTS (
     SELECT 1 FROM public.delivery_charges dc WHERE dc.area = other.area
   )
  GROUP BY p.id
),
phone_unique AS (
  SELECT
    order_id,
    area,
    'exact_phone_and_address_reviewed'::text AS evidence_source
  FROM phone_grouped
  WHERE candidate_count = 1
)
SELECT
  p.id AS order_id,
  p.order_code,
  p.address,
  p.phone,
  p.runner_id,
  p.created_at AS order_created_at,
  p.updated_at AS order_updated_at,
  p.area AS area_before,
  p.delivery_area_code AS delivery_area_code_before,
  p.delivery_area_name AS delivery_area_name_before,
  p.area_classification_status AS classification_status_before,
  p.area_classification_source AS classification_source_before,
  p.area_classification_reason AS classification_reason_before,
  p.area_classified_at AS classification_at_before,
  COALESCE(d.area, ad.area, ph.area) AS proposed_restored_area,
  COALESCE(d.evidence_source, ad.evidence_source, ph.evidence_source) AS recovery_evidence,
  CASE
    WHEN d.area IS NOT NULL THEN 'strong'
    WHEN ad.area IS NOT NULL THEN 'strong'
    WHEN ph.area IS NOT NULL THEN 'strong_reviewed'
    ELSE 'manual_review'
  END AS recovery_confidence,
  COALESCE(d.area, ad.area, ph.area) IS NOT NULL AS safe_to_auto_repair,
  EXISTS (
    SELECT 1 FROM public.delivery_charges dc WHERE dc.area = p.area
  ) AS charge_rate_match_before,
  CASE
    WHEN COALESCE(d.area, ad.area, ph.area) IS NULL THEN NULL
    ELSE EXISTS (
      SELECT 1
      FROM public.delivery_charges dc
      WHERE dc.area = COALESCE(d.area, ad.area, ph.area)
    )
  END AS charge_rate_match_after
FROM polluted p
LEFT JOIN direct_unique d ON d.order_id = p.id
LEFT JOIN address_unique ad ON ad.order_id = p.id
LEFT JOIN phone_unique ph ON ph.order_id = p.id;

DO $$
DECLARE
  v_existing_snapshot integer;
  v_total integer;
  v_safe integer;
  v_manual integer;
  v_missing_delivery_area integer;
BEGIN
  SELECT count(*) INTO v_existing_snapshot
  FROM private.driver_inbox_area_isolation_repair_20260731;

  IF v_existing_snapshot = 0 THEN
    SELECT
      count(*),
      count(*) FILTER (WHERE safe_to_auto_repair),
      count(*) FILTER (WHERE NOT safe_to_auto_repair),
      count(*) FILTER (WHERE delivery_area_code_before IS NULL)
    INTO v_total, v_safe, v_manual, v_missing_delivery_area
    FROM driver_inbox_area_repair_plan;

    IF v_total <> 44 OR v_safe <> 41 OR v_manual <> 3 THEN
      RAISE EXCEPTION
        'Driver Inbox area repair dry run changed: total %, safe %, manual %',
        v_total, v_safe, v_manual;
    END IF;

    IF v_missing_delivery_area <> 0 THEN
      RAISE EXCEPTION
        'Driver Inbox area repair expected all polluted rows to retain a dedicated delivery area; missing %',
        v_missing_delivery_area;
    END IF;
  END IF;
END;
$$;

INSERT INTO private.driver_inbox_area_isolation_repair_20260731 (
  order_id,
  order_code,
  address,
  phone,
  runner_id,
  order_created_at,
  order_updated_at,
  area_before,
  delivery_area_code_before,
  delivery_area_name_before,
  classification_status_before,
  classification_source_before,
  classification_reason_before,
  classification_at_before,
  proposed_restored_area,
  recovery_evidence,
  recovery_confidence,
  safe_to_auto_repair,
  charge_rate_match_before,
  charge_rate_match_after
)
SELECT
  order_id,
  order_code,
  address,
  phone,
  runner_id,
  order_created_at,
  order_updated_at,
  area_before,
  delivery_area_code_before,
  delivery_area_name_before,
  classification_status_before,
  classification_source_before,
  classification_reason_before,
  classification_at_before,
  proposed_restored_area,
  recovery_evidence,
  recovery_confidence,
  safe_to_auto_repair,
  charge_rate_match_before,
  charge_rate_match_after
FROM driver_inbox_area_repair_plan
ON CONFLICT (order_id) DO NOTHING;

WITH repaired AS (
  UPDATE public.orders o
  SET area = snapshot.proposed_restored_area
  FROM private.driver_inbox_area_isolation_repair_20260731 snapshot
  WHERE o.id = snapshot.order_id
    AND snapshot.safe_to_auto_repair
    AND snapshot.proposed_restored_area IS NOT NULL
    AND o.area = snapshot.area_before
    AND o.delivery_area_code IS NOT DISTINCT FROM snapshot.delivery_area_code_before
  RETURNING
    o.id,
    snapshot.area_before,
    snapshot.proposed_restored_area,
    snapshot.delivery_area_code_before,
    snapshot.recovery_evidence
),
audit AS (
  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    action,
    before_json,
    after_json
  )
  SELECT
    'order',
    repaired.id,
    'DRIVER_INBOX_BUSINESS_AREA_RESTORED',
    jsonb_build_object(
      'area', repaired.area_before,
      'delivery_area_code', repaired.delivery_area_code_before
    ),
    jsonb_build_object(
      'area', repaired.proposed_restored_area,
      'delivery_area_code', repaired.delivery_area_code_before,
      'recovery_evidence', repaired.recovery_evidence
    )
  FROM repaired
  RETURNING entity_id
)
UPDATE private.driver_inbox_area_isolation_repair_20260731 snapshot
SET repaired_at = now()
WHERE snapshot.order_id IN (SELECT entity_id FROM audit)
  AND snapshot.repaired_at IS NULL;

COMMENT ON TABLE private.driver_inbox_area_isolation_repair_20260731 IS
  'Immutable evidence and recovery plan for Driver Inbox delivery-area pollution of orders.area on 2026-07-31.';

COMMENT ON FUNCTION public.classify_order_delivery_area(uuid, boolean) IS
  'Classifies Driver Inbox delivery_area fields only; never updates the canonical business orders.area.';

COMMENT ON FUNCTION public.correct_order_delivery_area(uuid, text, boolean) IS
  'Corrects Driver Inbox delivery_area fields only; never updates the canonical business orders.area.';
