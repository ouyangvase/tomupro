-- KITANI order ingestion keeps TOMUPRO's existing order and driver flow.
-- All values arriving from KITANI are integer minor units and are converted
-- to TOMUPRO's existing major-unit NUMERIC columns exactly once.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'BND',
  ADD COLUMN IF NOT EXISTS merchandise_subtotal numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cod_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_order_id text,
  ADD COLUMN IF NOT EXISTS source_delivery_intent_id text;

CREATE INDEX IF NOT EXISTS idx_orders_source_delivery_intent
  ON public.orders(source_delivery_intent_id)
  WHERE source_delivery_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_source_order_id
  ON public.orders(source_order_id)
  WHERE source_order_id IS NOT NULL;

-- A delivery intent is the idempotency boundary for the KITANI -> TOMUPRO
-- order. Keep the database invariant even if a retry races the receiver.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_kitani_delivery_intent_unique
  ON public.orders(source_delivery_intent_id)
  WHERE order_source = 'KITANI' AND source_delivery_intent_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_kitani_financials_non_negative'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_kitani_financials_non_negative
      CHECK (
        order_source <> 'KITANI'
        OR (
          currency_code = 'BND'
          AND total_amount >= 0
          AND merchandise_subtotal >= 0
          AND delivery_fee >= 0
          AND cod_amount >= 0
        )
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_kitani_cod_matches_total'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_kitani_cod_matches_total
      CHECK (
        order_source <> 'KITANI'
        OR payment_method <> 'COD'::public.payment_method
        OR cod_amount = total_amount
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_kitani_transfer_has_no_cod'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_kitani_transfer_has_no_cod
      CHECK (
        order_source <> 'KITANI'
        OR payment_method <> 'TRANSFER'::public.payment_method
        OR cod_amount = 0
      ) NOT VALID;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.ingest_kitani_order(
  p_event jsonb,
  p_system_profile_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_intent_id text := NULLIF(p_event->>'delivery_intent_id', '');
  v_source_order_id text := NULLIF(p_event->>'source_order_id', '');
  v_source_order_no text := NULLIF(p_event->>'source_order_no', '');
  v_financials jsonb := COALESCE(p_event->'financials', '{}'::jsonb);
  v_currency_code text := upper(COALESCE(v_financials->>'currency_code', ''));
  v_payment_method text := upper(COALESCE(v_financials->>'payment_method', ''));
  v_merchandise_minor bigint;
  v_delivery_minor bigint;
  v_discount_minor bigint;
  v_total_minor bigint;
  v_cod_minor bigint;
  v_existing_link record;
  v_existing_order record;
  v_order record;
  v_item jsonb;
  v_quantity integer;
  v_price_minor bigint;
  v_line_total_minor bigint;
  v_total_qty integer := 0;
  v_address text;
  v_order_code text;
BEGIN
  IF NULLIF(trim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'KITANI idempotency key is required';
  END IF;
  IF v_delivery_intent_id IS NULL OR v_source_order_id IS NULL THEN
    RAISE EXCEPTION 'KITANI delivery_intent_id and source_order_id are required';
  END IF;
  IF p_system_profile_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_system_profile_id
  ) THEN
    RAISE EXCEPTION 'KITANI system profile is not configured';
  END IF;

  -- Serialize retries for the same delivery intent before checking the link.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_delivery_intent_id, 0));

  SELECT l.order_id, o.order_code
    INTO v_existing_link
  FROM public.kitani_order_links l
  JOIN public.orders o ON o.id = l.order_id
  WHERE l.kitani_delivery_intent_id = v_delivery_intent_id
  ORDER BY l.created_at
  LIMIT 1
  FOR UPDATE OF l;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'duplicate',
      'order_id', v_existing_link.order_id,
      'order_code', v_existing_link.order_code
    );
  END IF;

  -- Keep retries idempotent even if an older deployment created the order
  -- before its companion kitani_order_links row was written.
  SELECT id, order_code
    INTO v_existing_order
  FROM public.orders
  WHERE order_source = 'KITANI'
    AND source_delivery_intent_id = v_delivery_intent_id
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'duplicate',
      'order_id', v_existing_order.id,
      'order_code', v_existing_order.order_code
    );
  END IF;

  IF v_currency_code <> 'BND' THEN
    RAISE EXCEPTION 'KITANI currency must be BND';
  END IF;
  IF v_payment_method NOT IN ('COD', 'TRANSFER') THEN
    RAISE EXCEPTION 'KITANI payment method is invalid';
  END IF;

  IF jsonb_typeof(v_financials->'merchandise_subtotal_minor') <> 'number'
     OR (v_financials->>'merchandise_subtotal_minor') !~ '^[0-9]+$'
     OR jsonb_typeof(v_financials->'delivery_fee_minor') <> 'number'
     OR (v_financials->>'delivery_fee_minor') !~ '^[0-9]+$'
     OR jsonb_typeof(v_financials->'discount_total_minor') <> 'number'
     OR (v_financials->>'discount_total_minor') !~ '^[0-9]+$'
     OR jsonb_typeof(v_financials->'total_amount_minor') <> 'number'
     OR (v_financials->>'total_amount_minor') !~ '^[0-9]+$'
     OR jsonb_typeof(v_financials->'cod_amount_minor') <> 'number'
     OR (v_financials->>'cod_amount_minor') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'KITANI financial values must be non-negative integer minor units';
  END IF;

  v_merchandise_minor := (v_financials->>'merchandise_subtotal_minor')::bigint;
  v_delivery_minor := (v_financials->>'delivery_fee_minor')::bigint;
  v_discount_minor := (v_financials->>'discount_total_minor')::bigint;
  v_total_minor := (v_financials->>'total_amount_minor')::bigint;
  v_cod_minor := (v_financials->>'cod_amount_minor')::bigint;

  IF v_discount_minor > v_merchandise_minor + v_delivery_minor
     OR v_total_minor <> v_merchandise_minor + v_delivery_minor - v_discount_minor THEN
    RAISE EXCEPTION 'KITANI financial values do not balance';
  END IF;
  IF v_payment_method = 'COD' AND v_cod_minor <> v_total_minor THEN
    RAISE EXCEPTION 'KITANI COD amount must equal final total';
  END IF;
  IF v_payment_method = 'TRANSFER' AND v_cod_minor <> 0 THEN
    RAISE EXCEPTION 'KITANI transfer COD amount must be zero';
  END IF;
  IF COALESCE(jsonb_array_length(p_event->'items'), 0) = 0 THEN
    RAISE EXCEPTION 'KITANI order must contain at least one item';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_event->'items')
  LOOP
    IF (v_item->>'quantity') !~ '^[1-9][0-9]*$'
       OR (v_item->>'price_minor') !~ '^[0-9]+$'
       OR (v_item->>'line_total_minor') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'KITANI item values must be valid minor units';
    END IF;
    v_quantity := (v_item->>'quantity')::integer;
    v_price_minor := (v_item->>'price_minor')::bigint;
    v_line_total_minor := (v_item->>'line_total_minor')::bigint;
    IF v_line_total_minor <> v_price_minor * v_quantity THEN
      RAISE EXCEPTION 'KITANI item line total does not balance';
    END IF;
    v_total_qty := v_total_qty + v_quantity;
  END LOOP;

  v_address := concat_ws(
    E'\n',
    NULLIF(p_event#>>'{dropoff,formatted_address}', ''),
    CASE WHEN NULLIF(p_event #>> '{dropoff,unit}', '') IS NOT NULL
      THEN 'Unit/House: ' || (p_event #>> '{dropoff,unit}') END,
    CASE WHEN NULLIF(p_event #>> '{dropoff,landmark}', '') IS NOT NULL
      THEN 'Landmark: ' || (p_event #>> '{dropoff,landmark}') END,
    CASE WHEN NULLIF(p_event #>> '{dropoff,instructions}', '') IS NOT NULL
      THEN 'Notes: ' || (p_event #>> '{dropoff,instructions}') END,
    'GPS: ' || COALESCE(p_event #>> '{dropoff,latitude}', '') || ', ' ||
      COALESCE(p_event #>> '{dropoff,longitude}', '')
  );
  v_order_code := COALESCE(v_source_order_no, 'KITANI-' || left(v_delivery_intent_id, 12));

  INSERT INTO public.orders (
    order_code,
    customer_name,
    phone,
    address,
    area,
    channel,
    notes,
    payment_method,
    salesperson_id,
    created_by_user_id,
    order_owner_id,
    status,
    total_qty,
    total_amount,
    runner_status,
    order_source,
    operational_status,
    driver_status,
    currency_code,
    merchandise_subtotal,
    delivery_fee,
    cod_amount,
    discount_amount,
    source_order_id,
    source_delivery_intent_id
  ) VALUES (
    v_order_code,
    COALESCE(NULLIF(p_event#>>'{customer,name}', ''), 'KITANI customer'),
    p_event#>>'{customer,phone}',
    COALESCE(NULLIF(v_address, ''), 'KITANI delivery address'),
    NULLIF(p_event#>>'{dropoff,formatted_address}', ''),
    'KITANI',
    COALESCE(NULLIF(p_event#>>'{package,description}', ''), 'KITANI delivery'),
    v_payment_method::public.payment_method,
    p_system_profile_id,
    p_system_profile_id,
    p_system_profile_id,
    'READY'::public.order_status,
    v_total_qty,
    round(v_total_minor::numeric / 100, 2),
    'UNASSIGNED'::public.runner_status,
    'KITANI',
    'NEW',
    'UNASSIGNED',
    'BND',
    round(v_merchandise_minor::numeric / 100, 2),
    round(v_delivery_minor::numeric / 100, 2),
    round(v_cod_minor::numeric / 100, 2),
    round(v_discount_minor::numeric / 100, 2),
    v_source_order_id,
    v_delivery_intent_id
  ) RETURNING id, order_code INTO v_order;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_event->'items')
  LOOP
    INSERT INTO public.order_items (
      order_id, product_id, sku_label, qty, price, line_total, notes
    ) VALUES (
      v_order.id,
      NULL,
      COALESCE(NULLIF(v_item->>'sku_label', ''), 'KITANI item'),
      (v_item->>'quantity')::integer,
      round((v_item->>'price_minor')::numeric / 100, 2),
      round((v_item->>'line_total_minor')::numeric / 100, 2),
      'KITANI native order; inventory remains owned by KITANI'
    );
  END LOOP;

  INSERT INTO public.kitani_order_links (
    order_id,
    created_by,
    updated_by,
    kitani_delivery_intent_id,
    status,
    source,
    request_payload,
    response_payload
  ) VALUES (
    v_order.id,
    p_system_profile_id,
    p_system_profile_id,
    v_delivery_intent_id,
    'SUBMITTED_TO_TOMUPRO',
    'KITANI',
    jsonb_build_object('idempotency_key', p_idempotency_key, 'event', p_event),
    jsonb_build_object('status', 'created', 'order_id', v_order.id, 'order_code', v_order.order_code)
  );

  INSERT INTO public.audit_logs (
    entity_type, entity_id, actor_id, action, before_json, after_json
  ) VALUES (
    'order',
    v_order.id,
    p_system_profile_id,
    'KITANI_ORDER_INGESTED',
    NULL,
    jsonb_build_object(
      'delivery_intent_id', v_delivery_intent_id,
      'idempotency_key', p_idempotency_key,
      'total_amount_minor', v_total_minor,
      'cod_amount_minor', v_cod_minor,
      'payment_method', v_payment_method,
      'currency_code', 'BND'
    )
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'order_id', v_order.id,
    'order_code', v_order.order_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_kitani_order(jsonb, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_kitani_order(jsonb, uuid, text) TO service_role;
