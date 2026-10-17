ALTER TABLE public.kitani_order_links
  ADD COLUMN IF NOT EXISTS kitani_source_order_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kitani_order_links_delivery_intent_unique
  ON public.kitani_order_links(kitani_delivery_intent_id)
  WHERE kitani_delivery_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kitani_order_links_source_order_unique
  ON public.kitani_order_links(kitani_source_order_id)
  WHERE kitani_source_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_kitani_order_ready(
  p_delivery_intent_id text,
  p_source_order_id text,
  p_source_order_no text,
  p_customer_name text,
  p_phone text,
  p_address text,
  p_payment_method text,
  p_currency_code text,
  p_financials jsonb,
  p_items jsonb,
  p_salesperson_id uuid,
  p_request_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(order_id uuid, order_code text, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_order_id uuid;
  v_existing_order_code text;
  v_payment_method public.payment_method;
  v_field text;
  v_item jsonb;
  v_item_quantity integer;
  v_item_price_minor numeric;
  v_item_line_total_minor numeric;
  v_total_qty integer := 0;
  v_total_items_minor numeric := 0;
  v_merchandise_subtotal_minor numeric;
  v_delivery_fee_minor numeric;
  v_discount_total_minor numeric;
  v_total_amount_minor numeric;
  v_cod_amount_minor numeric;
  v_total_amount numeric;
  v_order_id uuid;
  v_owner_name text;
  v_owner_email text;
  v_order_code text;
BEGIN
  IF NULLIF(trim(p_delivery_intent_id), '') IS NULL
     OR NULLIF(trim(p_source_order_id), '') IS NULL
     OR NULLIF(trim(p_source_order_no), '') IS NULL THEN
    RAISE EXCEPTION 'KITANI order identity is required';
  END IF;

  IF upper(coalesce(p_currency_code, '')) <> 'BND' THEN
    RAISE EXCEPTION 'KITANI orders must use BND';
  END IF;

  IF upper(coalesce(p_payment_method, '')) NOT IN ('COD', 'TRANSFER') THEN
    RAISE EXCEPTION 'Unsupported KITANI payment method';
  END IF;
  v_payment_method := upper(p_payment_method)::public.payment_method;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_salesperson_id) THEN
    RAISE EXCEPTION 'KITANI TOMUPRO owner profile is not configured';
  END IF;

  SELECT o.id, o.order_code
    INTO v_existing_order_id, v_existing_order_code
  FROM public.kitani_order_links l
  JOIN public.orders o ON o.id = l.order_id
  WHERE l.kitani_delivery_intent_id = p_delivery_intent_id
     OR l.kitani_source_order_id = p_source_order_id
  ORDER BY l.created_at
  LIMIT 1
  FOR UPDATE;

  IF v_existing_order_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_order_id, v_existing_order_code, false;
    RETURN;
  END IF;

  IF jsonb_typeof(p_financials) <> 'object' THEN
    RAISE EXCEPTION 'KITANI financials are required';
  END IF;

  FOREACH v_field IN ARRAY ARRAY[
    'merchandise_subtotal_minor',
    'delivery_fee_minor',
    'discount_total_minor',
    'total_amount_minor',
    'cod_amount_minor'
  ] LOOP
    IF coalesce(p_financials->>v_field, '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'KITANI % must be a non-negative integer minor-unit amount', v_field;
    END IF;
  END LOOP;

  v_merchandise_subtotal_minor := (p_financials->>'merchandise_subtotal_minor')::numeric;
  v_delivery_fee_minor := (p_financials->>'delivery_fee_minor')::numeric;
  v_discount_total_minor := (p_financials->>'discount_total_minor')::numeric;
  v_total_amount_minor := (p_financials->>'total_amount_minor')::numeric;
  v_cod_amount_minor := (p_financials->>'cod_amount_minor')::numeric;

  IF v_total_amount_minor <> v_merchandise_subtotal_minor
      + v_delivery_fee_minor - v_discount_total_minor
     OR v_total_amount_minor < 0 THEN
    RAISE EXCEPTION 'KITANI order financials do not balance';
  END IF;
  IF v_payment_method = 'COD' AND v_cod_amount_minor <> v_total_amount_minor THEN
    RAISE EXCEPTION 'COD amount must equal the final KITANI total';
  END IF;
  IF v_payment_method = 'TRANSFER' AND v_cod_amount_minor <> 0 THEN
    RAISE EXCEPTION 'Transfer orders must have zero COD amount';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'KITANI order must contain at least one item';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF NULLIF(trim(v_item->>'sku_label'), '') IS NULL
       OR coalesce(v_item->>'quantity', '') !~ '^[1-9][0-9]*$'
       OR coalesce(v_item->>'price_minor', '') !~ '^[0-9]+$'
       OR coalesce(v_item->>'line_total_minor', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'KITANI order item is invalid';
    END IF;

    v_item_quantity := (v_item->>'quantity')::integer;
    v_item_price_minor := (v_item->>'price_minor')::numeric;
    v_item_line_total_minor := (v_item->>'line_total_minor')::numeric;
    IF v_item_line_total_minor <> v_item_price_minor * v_item_quantity THEN
      RAISE EXCEPTION 'KITANI order item total does not balance';
    END IF;
    v_total_qty := v_total_qty + v_item_quantity;
    v_total_items_minor := v_total_items_minor + v_item_line_total_minor;
  END LOOP;

  IF v_total_items_minor <> v_merchandise_subtotal_minor THEN
    RAISE EXCEPTION 'KITANI item totals do not match merchandise subtotal';
  END IF;

  SELECT display_name, email
    INTO v_owner_name, v_owner_email
  FROM public.profiles
  WHERE id = p_salesperson_id;

  v_total_amount := v_total_amount_minor / 100;
  v_order_code := left(trim(p_source_order_no), 100);

  INSERT INTO public.orders (
    order_code,
    customer_name,
    phone,
    address,
    channel,
    notes,
    payment_method,
    salesperson_id,
    order_owner_id,
    order_source,
    created_by_user_id,
    created_by_name_snapshot,
    owner_salesperson_id_snapshot,
    owner_salesperson_display_name_snapshot,
    status,
    total_qty,
    total_amount,
    runner_status,
    operational_status
  ) VALUES (
    v_order_code,
    coalesce(nullif(trim(p_customer_name), ''), 'KITANI customer'),
    trim(p_phone),
    trim(p_address),
    'KITANI',
    'KITANI delivery intent: ' || p_delivery_intent_id,
    v_payment_method,
    p_salesperson_id,
    p_salesperson_id,
    'KITANI',
    p_salesperson_id,
    coalesce(v_owner_name, v_owner_email, 'KITANI'),
    p_salesperson_id,
    coalesce(v_owner_name, v_owner_email, 'KITANI'),
    'READY',
    v_total_qty,
    v_total_amount,
    'UNASSIGNED',
    'NEW'
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.order_items (
      order_id,
      sku_label,
      qty,
      price,
      line_total,
      notes
    ) VALUES (
      v_order_id,
      trim(v_item->>'sku_label'),
      (v_item->>'quantity')::integer,
      (v_item->>'price_minor')::numeric / 100,
      (v_item->>'line_total_minor')::numeric / 100,
      'KITANI native order'
    );
  END LOOP;

  INSERT INTO public.kitani_order_links (
    order_id,
    created_by,
    updated_by,
    kitani_delivery_intent_id,
    kitani_source_order_id,
    template_key,
    template_version,
    status,
    source,
    request_payload,
    response_payload
  ) VALUES (
    v_order_id,
    p_salesperson_id,
    p_salesperson_id,
    trim(p_delivery_intent_id),
    trim(p_source_order_id),
    'native_order_ready',
    1,
    'SUBMITTED_TO_TOMUPRO',
    'KITANI',
    p_request_payload,
    jsonb_build_object(
      'event_type', 'delivery.order_ready',
      'total_amount_minor', v_total_amount_minor,
      'cod_amount_minor', v_cod_amount_minor,
      'currency_code', 'BND'
    )
  );

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, after_json)
  VALUES (
    'order',
    v_order_id,
    'KITANI_ORDER_CREATED',
    p_salesperson_id,
    jsonb_build_object(
      'kitani_delivery_intent_id', p_delivery_intent_id,
      'kitani_source_order_id', p_source_order_id,
      'total_amount_minor', v_total_amount_minor,
      'cod_amount_minor', v_cod_amount_minor,
      'merchandise_subtotal_minor', v_merchandise_subtotal_minor,
      'delivery_fee_minor', v_delivery_fee_minor,
      'discount_total_minor', v_discount_total_minor,
      'currency_code', 'BND'
    )
  );

  RETURN QUERY SELECT v_order_id, v_order_code, true;
EXCEPTION
  WHEN unique_violation THEN
    SELECT o.id, o.order_code
      INTO v_existing_order_id, v_existing_order_code
    FROM public.kitani_order_links l
    JOIN public.orders o ON o.id = l.order_id
    WHERE l.kitani_delivery_intent_id = p_delivery_intent_id
       OR l.kitani_source_order_id = p_source_order_id
    ORDER BY l.created_at
    LIMIT 1;
    IF v_existing_order_id IS NOT NULL THEN
      RETURN QUERY SELECT v_existing_order_id, v_existing_order_code, false;
      RETURN;
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_kitani_order_ready(text, text, text, text, text, text, text, text, jsonb, jsonb, uuid, jsonb)
  FROM PUBLIC;

COMMENT ON FUNCTION public.create_kitani_order_ready(text, text, text, text, text, text, text, text, jsonb, jsonb, uuid, jsonb)
IS 'Creates one READY TOMUPRO order from a validated KITANI native order using BND minor-unit financials.';
