-- Make Runner area corrections teach the classifier for future matching addresses.
-- The learned rule is exact-normalized-address only; it does not infer broader locality rules.

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
    -- A later correction for the same exact normalized address must win.
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
          area = v_area.code,
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
    jsonb_build_object('delivery_area_code', v_order.delivery_area_code, 'reason', v_order.area_classification_reason),
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
