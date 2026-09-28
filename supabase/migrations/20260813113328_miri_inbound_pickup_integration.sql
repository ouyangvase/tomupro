-- MIRI INBOUND PICKUP
--
-- Miri orders are created by the Sniper service, assigned to an existing
-- Runner, and delivered through the existing Runner lifecycle. They are not
-- customer COD orders and must never enter the normal delivery stock queue.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_receive_miri_pickup boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS external_order_id text,
  ADD COLUMN IF NOT EXISTS external_tracking_number text,
  ADD COLUMN IF NOT EXISTS sniper_seller_id text,
  ADD COLUMN IF NOT EXISTS tomu_seller_account_id text,
  ADD COLUMN IF NOT EXISTS tomu_runner_id uuid,
  ADD COLUMN IF NOT EXISTS actual_pickup_charge numeric(12, 2),
  ADD COLUMN IF NOT EXISTS settlement_base_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS internal_settlement_offset numeric(12, 2),
  ADD COLUMN IF NOT EXISTS internal_offset_type text,
  ADD COLUMN IF NOT EXISTS cod_type text,
  ADD COLUMN IF NOT EXISTS is_customer_cod boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS seller_charge_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS runner_payable_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS telegram_chat_id text,
  ADD COLUMN IF NOT EXISTS telegram_message_id text,
  ADD COLUMN IF NOT EXISTS telegram_user_id text,
  ADD COLUMN IF NOT EXISTS expected_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS content_verification_status text NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN IF NOT EXISTS integration_status text NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS integration_error text,
  ADD COLUMN IF NOT EXISTS picked_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS miri_delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS miri_sku_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS miri_sku_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS miri_stocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS miri_stocked_by uuid,
  ADD COLUMN IF NOT EXISTS miri_request_idempotency_key text,
  ADD COLUMN IF NOT EXISTS miri_request_hash text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_order_type_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_order_type_check
      CHECK (order_type IN ('STANDARD', 'MIRI_INBOUND_PICKUP'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_miri_settlement_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_miri_settlement_check
      CHECK (
        order_type <> 'MIRI_INBOUND_PICKUP'
        OR (
          area = 'P200'
          AND source_system = 'SNIPER_TELEGRAM'
          AND actual_pickup_charge > 0
          AND settlement_base_amount > 0
          AND actual_pickup_charge <= settlement_base_amount
          AND internal_settlement_offset >= 0
          AND internal_settlement_offset = settlement_base_amount - actual_pickup_charge
          AND seller_charge_amount = actual_pickup_charge
          AND runner_payable_amount = actual_pickup_charge
          AND internal_offset_type = 'MIRI_PICKUP_OFFSET'
          AND cod_type = 'INTERNAL_MIRI_PICKUP_OFFSET'
          AND is_customer_cod = false
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_miri_expected_items_array_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_miri_expected_items_array_check
      CHECK (jsonb_typeof(expected_items) = 'array');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.seller_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  account_code text NOT NULL UNIQUE,
  sniper_seller_id text NOT NULL UNIQUE,
  store_name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  can_create_miri_pickup boolean NOT NULL DEFAULT false,
  phone_last_four text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.miri_pickup_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  settlement_base_amount numeric(12, 2) NOT NULL DEFAULT 200.00 CHECK (settlement_base_amount > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);

INSERT INTO public.miri_pickup_settings (id, settlement_base_amount)
VALUES (true, 200.00)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS seller_accounts_profile_idx
  ON public.seller_accounts(profile_id);

CREATE TABLE IF NOT EXISTS public.miri_pickup_callback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL CHECK (event_type IN ('ORDER_CREATED', 'DELIVERED', 'CANCELLED', 'ADJUSTED')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENDING', 'ACKNOWLEDGED', 'FAILED')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz DEFAULT now(),
  last_http_status integer,
  last_error text,
  last_response jsonb,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, event_type)
);

CREATE INDEX IF NOT EXISTS miri_callback_pending_idx
  ON public.miri_pickup_callback_events(status, next_retry_at);

CREATE UNIQUE INDEX IF NOT EXISTS orders_miri_source_external_uidx
  ON public.orders(source_system, external_order_id)
  WHERE order_type = 'MIRI_INBOUND_PICKUP'
    AND source_system IS NOT NULL
    AND external_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_miri_idempotency_uidx
  ON public.orders(miri_request_idempotency_key)
  WHERE order_type = 'MIRI_INBOUND_PICKUP'
    AND miri_request_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_miri_telegram_message_uidx
  ON public.orders(telegram_chat_id, telegram_message_id)
  WHERE order_type = 'MIRI_INBOUND_PICKUP'
    AND telegram_chat_id IS NOT NULL
    AND telegram_message_id IS NOT NULL;

INSERT INTO public.delivery_areas (code, name, district, is_special, active, display_order)
SELECT 'P200', 'Miri Inbound Pickup', 'Miri', true, true, 999
WHERE NOT EXISTS (SELECT 1 FROM public.delivery_areas WHERE code = 'P200');

INSERT INTO public.feature_settings (scope_type, scope_id, setting_key, value_boolean)
SELECT 'GLOBAL', NULL, 'SNIPER_MIRI_PICKUP_INTEGRATION_ENABLED', false
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_settings
  WHERE scope_type = 'GLOBAL'
    AND setting_key = 'SNIPER_MIRI_PICKUP_INTEGRATION_ENABLED'
);

ALTER TABLE public.seller_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.miri_pickup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.miri_pickup_callback_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.seller_accounts TO authenticated;
GRANT SELECT ON public.miri_pickup_settings TO authenticated;
GRANT SELECT ON public.miri_pickup_callback_events TO authenticated;

CREATE POLICY seller_accounts_admin_read
  ON public.seller_accounts FOR SELECT TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY seller_accounts_admin_manage
  ON public.seller_accounts FOR ALL TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY miri_pickup_settings_admin_manage
  ON public.miri_pickup_settings FOR ALL TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY miri_callback_events_admin_read
  ON public.miri_pickup_callback_events FOR SELECT TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE OR REPLACE FUNCTION public.miri_pickup_is_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT fs.value_boolean
      FROM public.feature_settings fs
      WHERE fs.scope_type = 'GLOBAL'
        AND fs.setting_key = 'SNIPER_MIRI_PICKUP_INTEGRATION_ENABLED'
      ORDER BY fs.updated_at DESC NULLS LAST
      LIMIT 1
    ), false
  );
$$;

REVOKE ALL ON FUNCTION public.miri_pickup_is_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.miri_pickup_is_enabled() TO service_role;

CREATE OR REPLACE FUNCTION public.miri_pickup_callback_payload(
  p_order_id uuid,
  p_event_type text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'event', 'MIRI_PICKUP_' || p_event_type,
    'external_order_id', o.external_order_id,
    'tomu_order_id', o.order_code,
    'tomu_order_uuid', o.id,
    'actual_pickup_charge', to_char(o.actual_pickup_charge, 'FM999999990.00'),
    'delivered_at', o.miri_delivered_at,
    'content_status', o.content_verification_status,
    'event_type', p_event_type
  )
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.order_type = 'MIRI_INBOUND_PICKUP';
$$;

CREATE OR REPLACE FUNCTION public.enqueue_miri_pickup_callback(
  p_order_id uuid,
  p_event_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_event_id text;
BEGIN
  v_payload := public.miri_pickup_callback_payload(p_order_id, p_event_type);
  IF v_payload IS NULL THEN
    RETURN;
  END IF;

  v_event_id := 'miri:' || p_order_id::text || ':' || lower(p_event_type);
  INSERT INTO public.miri_pickup_callback_events (order_id, event_id, event_type, payload)
  VALUES (p_order_id, v_event_id, p_event_type, v_payload)
  ON CONFLICT (order_id, event_type) DO UPDATE
    SET payload = EXCLUDED.payload,
        updated_at = now()
  WHERE public.miri_pickup_callback_events.status IN ('PENDING', 'FAILED');
END;
$$;

-- Keep Miri inbound pickup orders out of the existing Finance Overview read model.
-- Miri settlement is internal and must not appear in normal COD/runner finance totals.
CREATE OR REPLACE FUNCTION private.finance_scoped_orders(
  p_runner_id UUID,
  p_area TEXT,
  p_visible_owner_ids UUID[]
)
RETURNS TABLE (
  id UUID,
  order_code TEXT,
  customer_name TEXT,
  area TEXT,
  total_amount NUMERIC,
  payment_method TEXT,
  status TEXT,
  runner_status TEXT,
  runner_id UUID,
  salesperson_id UUID,
  salesperson_action_required BOOLEAN,
  next_delivery_date DATE,
  driver_next_delivery_date DATE,
  salesperson_action_type TEXT,
  runner_final_outcome TEXT,
  runner_failed_reason_id UUID,
  runner_comment TEXT,
  driver_failed_reason TEXT,
  driver_failed_remark TEXT,
  failed_reason TEXT,
  driver_failed_at TIMESTAMPTZ,
  runner_reviewed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  runner_accept_status TEXT,
  driver_status TEXT,
  driver_payment_method TEXT,
  driver_cash_amount NUMERIC,
  driver_transfer_amount NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    o.id,
    o.order_code,
    o.customer_name,
    o.area,
    o.total_amount,
    o.payment_method::TEXT,
    o.status::TEXT,
    o.runner_status::TEXT,
    o.runner_id,
    o.salesperson_id,
    o.salesperson_action_required,
    o.next_delivery_date,
    o.driver_next_delivery_date,
    o.salesperson_action_type,
    o.runner_final_outcome,
    o.runner_failed_reason_id,
    o.runner_comment,
    o.driver_failed_reason,
    o.driver_failed_remark,
    o.failed_reason,
    o.driver_failed_at,
    o.runner_reviewed_at,
    o.delivered_at,
    o.runner_accept_status::TEXT,
    o.driver_status::TEXT,
    o.driver_payment_method::TEXT,
    o.driver_cash_amount,
    o.driver_transfer_amount
  FROM public.orders o
  WHERE o.status::TEXT NOT IN ('CANCELLED', 'CANCELED')
    AND o.order_type <> 'MIRI_INBOUND_PICKUP'
    AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
    AND (p_area IS NULL OR o.area = p_area)
    AND (p_visible_owner_ids IS NULL OR o.salesperson_id = ANY(p_visible_owner_ids))
$$;

CREATE OR REPLACE FUNCTION public.protect_miri_settlement_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.order_type = 'MIRI_INBOUND_PICKUP'
    AND (
      NEW.actual_pickup_charge IS DISTINCT FROM OLD.actual_pickup_charge
      OR NEW.settlement_base_amount IS DISTINCT FROM OLD.settlement_base_amount
      OR NEW.internal_settlement_offset IS DISTINCT FROM OLD.internal_settlement_offset
      OR NEW.seller_charge_amount IS DISTINCT FROM OLD.seller_charge_amount
      OR NEW.runner_payable_amount IS DISTINCT FROM OLD.runner_payable_amount
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
      OR NEW.is_customer_cod IS DISTINCT FROM OLD.is_customer_cod
      OR NEW.cod_type IS DISTINCT FROM OLD.cod_type
    )
    AND current_setting('app.miri_adjustment', true) IS DISTINCT FROM 'true'
  THEN
    RAISE EXCEPTION 'Miri settlement fields are immutable; use the authorized adjustment workflow';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_miri_settlement_fields_trigger ON public.orders;
CREATE TRIGGER protect_miri_settlement_fields_trigger
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_miri_settlement_fields();

CREATE OR REPLACE FUNCTION public.enqueue_miri_order_lifecycle_callback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_type <> 'MIRI_INBOUND_PICKUP' THEN
    RETURN NEW;
  END IF;

  IF NEW.status::text = 'CANCELLED' AND OLD.status::text IS DISTINCT FROM 'CANCELLED' THEN
    PERFORM public.enqueue_miri_pickup_callback(NEW.id, 'CANCELLED');
  ELSIF NEW.runner_status::text = 'DELIVERED' AND OLD.runner_status::text IS DISTINCT FROM 'DELIVERED' THEN
    PERFORM public.enqueue_miri_pickup_callback(NEW.id, 'DELIVERED');
  ELSIF NEW.actual_pickup_charge IS DISTINCT FROM OLD.actual_pickup_charge
    OR NEW.settlement_base_amount IS DISTINCT FROM OLD.settlement_base_amount
  THEN
    PERFORM public.enqueue_miri_pickup_callback(NEW.id, 'ADJUSTED');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_miri_order_lifecycle_callback_trigger ON public.orders;
CREATE TRIGGER enqueue_miri_order_lifecycle_callback_trigger
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_miri_order_lifecycle_callback();

CREATE OR REPLACE FUNCTION public.miri_pickup_order_response(
  p_order_id uuid,
  p_duplicate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'success', true,
    'duplicate', p_duplicate,
    'tomu_order_id', o.order_code,
    'tomu_order_uuid', o.id,
    'status', CASE
      WHEN o.runner_status::text = 'DELIVERED' THEN 'DELIVERED'
      WHEN o.status::text = 'CANCELLED' THEN 'CANCELLED'
      ELSE 'ASSIGNED_AWAITING_DELIVERY'
    END,
    'area_code', o.area,
    'settlement_base', to_char(o.settlement_base_amount, 'FM999999990.00'),
    'actual_pickup_charge', to_char(o.actual_pickup_charge, 'FM999999990.00'),
    'internal_offset', to_char(o.internal_settlement_offset, 'FM999999990.00'),
    'net_runner_payable', to_char(o.runner_payable_amount, 'FM999999990.00'),
    'net_seller_charge', to_char(o.seller_charge_amount, 'FM999999990.00'),
    'content_status', o.content_verification_status
  )
  FROM public.orders o
  WHERE o.id = p_order_id;
$$;

CREATE OR REPLACE FUNCTION public.create_miri_pickup_order(
  p_payload jsonb,
  p_idempotency_key text,
  p_request_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.orders%ROWTYPE;
  v_seller public.seller_accounts%ROWTYPE;
  v_runner public.profiles%ROWTYPE;
  v_external_order_id text := nullif(trim(p_payload->>'external_order_id'), '');
  v_tracking_number text := nullif(trim(p_payload->>'tracking_number'), '');
  v_sniper_seller_id text := nullif(trim(p_payload->>'sniper_seller_id'), '');
  v_tomu_seller_account_id text := nullif(trim(p_payload->>'tomu_seller_account_id'), '');
  v_runner_ref text := nullif(trim(p_payload->>'tomu_runner_id'), '');
  v_runner_id uuid;
  v_charge numeric(12,2);
  v_base numeric(12,2);
  v_offset numeric(12,2);
  v_expected jsonb := COALESCE(p_payload->'expected_items', '[]'::jsonb);
  v_total_qty integer := 0;
  v_order_id uuid;
  v_order_code text;
  v_picked_up_at timestamptz;
BEGIN
  IF NOT public.miri_pickup_is_enabled() THEN
    RAISE EXCEPTION 'Miri pickup integration is disabled';
  END IF;

  SELECT settlement_base_amount INTO v_base
  FROM public.miri_pickup_settings
  WHERE id = true;
  v_base := COALESCE(v_base, 200.00);

  IF v_external_order_id IS NULL OR v_tracking_number IS NULL OR v_sniper_seller_id IS NULL
    OR v_tomu_seller_account_id IS NULL OR p_idempotency_key IS NULL OR trim(p_idempotency_key) = ''
  THEN
    RAISE EXCEPTION 'Missing required Miri pickup fields';
  END IF;

  IF COALESCE(p_payload->>'currency', '') <> 'BND' THEN
    RAISE EXCEPTION 'Only BND is supported';
  END IF;

  v_charge := (p_payload->>'actual_pickup_charge')::numeric(12,2);
  IF v_charge <= 0 THEN
    RAISE EXCEPTION 'Actual pickup charge must be greater than zero';
  END IF;
  IF v_charge > v_base THEN
    RAISE EXCEPTION 'AMOUNT_EXCEEDS_SETTLEMENT_BASE';
  END IF;
  v_offset := v_base - v_charge;

  IF jsonb_typeof(v_expected) <> 'array' THEN
    RAISE EXCEPTION 'expected_items must be an array';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'sku_code', nullif(trim(COALESCE(item->>'sku_code', item->>'sku_id')), ''),
      'quantity', COALESCE(item->>'quantity', item->>'qty'),
      'verification_status', COALESCE(item->>'verification_status', 'UNVERIFIED'),
      'stocked_quantity', 0
    )
  ), '[]'::jsonb)
  INTO v_expected
  FROM jsonb_array_elements(v_expected) item;

  SELECT COALESCE(sum((item->>'quantity')::integer), 0)
    INTO v_total_qty
  FROM jsonb_array_elements(v_expected) item
  WHERE (item->>'sku_code') IS NOT NULL
    AND (item->>'quantity')::integer > 0;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_expected) item
    WHERE COALESCE(nullif(trim(item->>'sku_code'), ''), '') = ''
      OR COALESCE((item->>'quantity')::integer, 0) <= 0
  ) THEN
    RAISE EXCEPTION 'Every expected item needs a positive quantity and sku_code';
  END IF;

  SELECT * INTO v_existing
  FROM public.orders
  WHERE order_type = 'MIRI_INBOUND_PICKUP'
    AND (
      (source_system = 'SNIPER_TELEGRAM' AND external_order_id = v_external_order_id)
      OR miri_request_idempotency_key = p_idempotency_key
    )
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.miri_request_hash IS DISTINCT FROM p_request_hash THEN
      RAISE EXCEPTION 'Idempotency key was already used with a different request';
    END IF;
    RETURN public.miri_pickup_order_response(v_existing.id, true);
  END IF;

  SELECT sa.* INTO v_seller
  FROM public.seller_accounts sa
  WHERE sa.status = 'ACTIVE'
    AND sa.can_create_miri_pickup = true
    AND sa.sniper_seller_id = v_sniper_seller_id
    AND (
      sa.account_code = v_tomu_seller_account_id
      OR sa.id::text = v_tomu_seller_account_id
    )
  LIMIT 1;

  IF v_seller.id IS NULL THEN
    RAISE EXCEPTION 'Seller account is not active or not authorized';
  END IF;

  SELECT * INTO v_runner
  FROM public.profiles
  WHERE (id::text = v_runner_ref OR runner_code = v_runner_ref)
    AND role = 'runner'::app_role
    AND is_active = true
    AND status = 'active'::user_status
    AND can_receive_miri_pickup = true;

  IF v_runner.id IS NULL THEN
    RAISE EXCEPTION 'Runner account is not active or not authorized';
  END IF;

  v_runner_id := v_runner.id;
  v_picked_up_at := nullif(p_payload->>'picked_up_at', '')::timestamptz;
  v_order_id := gen_random_uuid();
  v_order_code := 'MIRI-' || upper(regexp_replace(v_tracking_number, '[^A-Za-z0-9-]', '', 'g'))
    || '-' || upper(substr(md5(v_external_order_id), 1, 6));

  INSERT INTO public.orders (
    id, order_code, order_date, customer_name, phone, address, area, channel, notes,
    payment_method, salesperson_id, order_owner_id, runner_id, status, current_operational_state,
    expected_pickup_date, total_qty, total_amount, runner_status, reconciliation_status,
    stock_deducted, operational_status, order_source, created_by_user_id, runner_assigned_at,
    pickup_fee, inventory_status, area_manual_override, driver_status, runner_accept_status,
    order_type, source_system, external_order_id, external_tracking_number, sniper_seller_id,
    tomu_seller_account_id, tomu_runner_id, actual_pickup_charge, settlement_base_amount,
    internal_settlement_offset, internal_offset_type, cod_type, is_customer_cod,
    seller_charge_amount, runner_payable_amount, telegram_chat_id, telegram_message_id,
    telegram_user_id, expected_items, content_verification_status, integration_status,
    picked_up_at, miri_request_idempotency_key, miri_request_hash
  ) VALUES (
    v_order_id, v_order_code, COALESCE(v_picked_up_at::date, current_date),
    'Miri Pickup - ' || v_seller.store_name, 'N/A', 'Miri inbound pickup · ' || v_tracking_number,
    'P200', 'SNIPER_TELEGRAM', 'MIRI INBOUND PICKUP', 'COD'::payment_method,
    v_seller.profile_id, v_seller.profile_id, v_runner_id, 'READY'::order_status, 'READY',
    COALESCE(v_picked_up_at::date, current_date), v_total_qty, v_charge, 'ASSIGNED'::runner_status,
    'NOT_CLAIMED'::reconciliation_status, false, 'NEW', 'SNIPER_TELEGRAM', v_seller.profile_id,
    now(), 0, 'RECEIVED_SKU_PENDING', true, 'UNASSIGNED', 'PENDING',
    'MIRI_INBOUND_PICKUP', 'SNIPER_TELEGRAM', v_external_order_id, v_tracking_number,
    v_sniper_seller_id, v_tomu_seller_account_id, v_runner_id, v_charge, v_base,
    v_offset, 'MIRI_PICKUP_OFFSET', 'INTERNAL_MIRI_PICKUP_OFFSET', false,
    v_charge, v_charge, p_payload->>'telegram_chat_id', p_payload->>'telegram_message_id',
    p_payload->>'telegram_user_id', v_expected, 'SKU_PENDING', 'CREATED',
    v_picked_up_at, p_idempotency_key, p_request_hash
  );

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
  VALUES (
    'order', v_order_id, 'MIRI_ORDER_CREATED', NULL, NULL,
    jsonb_build_object(
      'source_system', 'SNIPER_TELEGRAM',
      'external_order_id', v_external_order_id,
      'telegram_user_id', p_payload->>'telegram_user_id',
      'settlement_base', v_base,
      'actual_pickup_charge', v_charge,
      'internal_offset', v_offset,
      'runner_id', v_runner_id
    )
  );

  PERFORM public.enqueue_miri_pickup_callback(v_order_id, 'ORDER_CREATED');
  RETURN public.miri_pickup_order_response(v_order_id, false);
END;
$$;

REVOKE ALL ON FUNCTION public.create_miri_pickup_order(jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_miri_pickup_order(jsonb, text, text) TO service_role;

DROP FUNCTION IF EXISTS public.mark_order_delivered_fast(uuid, uuid);
CREATE OR REPLACE FUNCTION public.mark_order_delivered_fast(p_order_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
BEGIN
  IF p_actor_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid actor');
  END IF;

  SELECT id, runner_id, runner_status, driver_status, stock_deducted,
         payment_method, receipt_status, order_type, actual_pickup_charge,
         seller_charge_amount, runner_payable_amount
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.runner_id IS DISTINCT FROM p_actor_id
    AND NOT public.has_runner_assistant_permission(p_actor_id, v_order.runner_id, 'deliver')
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'Delivery access required');
  END IF;

  IF v_order.payment_method = 'TRANSFER'
    AND COALESCE(v_order.receipt_status, '') <> 'confirmed'
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receipt must be confirmed before delivery for transfer orders');
  END IF;

  IF v_order.runner_status = 'DELIVERED' THEN
    RETURN jsonb_build_object('success', true, 'already_delivered', true, 'order_type', v_order.order_type);
  END IF;

  SELECT id, runner_id, runner_status, driver_status, stock_deducted,
         order_type, actual_pickup_charge, seller_charge_amount, runner_payable_amount
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE SKIP LOCKED;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order locked by another process');
  END IF;

  IF v_order.runner_status = 'DELIVERED' THEN
    RETURN jsonb_build_object('success', true, 'already_delivered', true, 'order_type', v_order.order_type);
  END IF;

  IF v_order.order_type = 'MIRI_INBOUND_PICKUP' THEN
    UPDATE public.orders
    SET runner_status = 'DELIVERED',
        delivered_at = now(),
        miri_delivered_at = now(),
        inventory_status = 'RECEIVED_SKU_PENDING',
        content_verification_status = 'SKU_PENDING',
        integration_status = 'DELIVERED',
        stock_deducted = false,
        updated_at = now()
    WHERE id = p_order_id;

    INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
    VALUES (
      'order', p_order_id, 'MIRI_PICKUP_DELIVERED', p_actor_id,
      jsonb_build_object('runner_status', v_order.runner_status),
      jsonb_build_object(
        'runner_status', 'DELIVERED',
        'delivered_at', now(),
        'actual_pickup_charge', v_order.actual_pickup_charge,
        'runner_payable_amount', v_order.runner_payable_amount,
        'seller_charge_amount', v_order.seller_charge_amount,
        'content_status', 'SKU_PENDING'
      )
    );

    PERFORM public.enqueue_miri_pickup_callback(p_order_id, 'DELIVERED');
    RETURN jsonb_build_object(
      'success', true,
      'delivered_at', now(),
      'queued_for_processing', false,
      'order_type', v_order.order_type,
      'content_status', 'SKU_PENDING',
      'runner_payable_amount', v_order.runner_payable_amount,
      'seller_charge_amount', v_order.seller_charge_amount
    );
  END IF;

  IF v_order.driver_status = 'DRIVER_DELIVERED' THEN
    RETURN public.review_driver_delivery(p_order_id, p_actor_id, true, NULL);
  END IF;

  UPDATE public.orders
  SET runner_status = 'DELIVERED', delivered_at = now(), updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
  VALUES (
    'order', p_order_id, 'delivered', p_actor_id,
    jsonb_build_object('runner_status', v_order.runner_status),
    jsonb_build_object('runner_status', 'DELIVERED', 'delivered_at', now())
  );

  INSERT INTO public.delivery_queue (order_id, queued_at, status)
  VALUES (p_order_id, now(), 'PENDING')
  ON CONFLICT (order_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'delivered_at', now(), 'queued_for_processing', true, 'order_type', 'STANDARD');
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_order_delivered_fast(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.adjust_miri_pickup_settlement(
  p_order_id uuid,
  p_actual_pickup_charge numeric,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_base numeric(12,2);
  v_offset numeric(12,2);
BEGIN
  IF v_actor IS NULL OR public.get_user_role(v_actor)::text <> 'admin' THEN
    RAISE EXCEPTION 'Only an admin can adjust Miri settlement';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.order_type <> 'MIRI_INBOUND_PICKUP' THEN
    RAISE EXCEPTION 'Miri pickup order not found';
  END IF;
  IF v_order.runner_status::text = 'DELIVERED' THEN
    RAISE EXCEPTION 'Delivered Miri settlement is immutable';
  END IF;

  SELECT settlement_base_amount INTO v_base
  FROM public.miri_pickup_settings
  WHERE id = true;
  v_base := COALESCE(v_base, 200.00);

  IF p_actual_pickup_charge IS NULL OR p_actual_pickup_charge <= 0 THEN
    RAISE EXCEPTION 'Actual pickup charge must be greater than zero';
  END IF;
  IF p_actual_pickup_charge > v_base THEN
    RAISE EXCEPTION 'AMOUNT_EXCEEDS_SETTLEMENT_BASE';
  END IF;
  v_offset := v_base - p_actual_pickup_charge;

  PERFORM set_config('app.miri_adjustment', 'true', true);
  UPDATE public.orders
  SET actual_pickup_charge = p_actual_pickup_charge,
      total_amount = p_actual_pickup_charge,
      settlement_base_amount = v_base,
      internal_settlement_offset = v_offset,
      seller_charge_amount = p_actual_pickup_charge,
      runner_payable_amount = p_actual_pickup_charge,
      integration_status = 'ADJUSTED',
      integration_error = NULL,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
  VALUES (
    'order', p_order_id, 'MIRI_SETTLEMENT_ADJUSTED', v_actor,
    jsonb_build_object(
      'actual_pickup_charge', v_order.actual_pickup_charge,
      'settlement_base_amount', v_order.settlement_base_amount,
      'internal_settlement_offset', v_order.internal_settlement_offset,
      'reason', p_reason
    ),
    jsonb_build_object(
      'actual_pickup_charge', p_actual_pickup_charge,
      'settlement_base_amount', v_base,
      'internal_settlement_offset', v_offset,
      'reason', p_reason
    )
  );

  RETURN public.miri_pickup_order_response(p_order_id, false);
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_miri_pickup_settlement(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_miri_pickup_settlement(uuid, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_miri_pickup_skus(
  p_order_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item jsonb;
  v_product_id uuid;
  v_qty integer;
  v_actor uuid := auth.uid();
  v_confirmed jsonb := '[]'::jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.order_type <> 'MIRI_INBOUND_PICKUP' THEN
    RAISE EXCEPTION 'Miri pickup order not found';
  END IF;
  IF v_order.runner_status::text <> 'DELIVERED' THEN
    RAISE EXCEPTION 'SKU can only be confirmed after delivery';
  END IF;
  IF v_order.content_verification_status = 'STOCKED' THEN
    RETURN jsonb_build_object('success', true, 'already_stocked', true, 'content_status', 'STOCKED', 'items', v_order.expected_items);
  END IF;
  IF v_order.content_verification_status = 'SKU_CONFIRMED' THEN
    RETURN jsonb_build_object('success', true, 'already_confirmed', true, 'content_status', 'SKU_CONFIRMED', 'items', v_order.expected_items);
  END IF;
  IF public.get_user_role(v_actor) NOT IN ('admin', 'manager')
    AND v_order.salesperson_id IS DISTINCT FROM v_actor
  THEN
    RAISE EXCEPTION 'Only the seller owner, manager, or admin can confirm Miri SKUs';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one SKU confirmation is required';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Confirmed quantity must be positive';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_product_id AND p.is_active = true
        AND p.owner_user_id = v_order.order_owner_id
    ) THEN
      RAISE EXCEPTION 'Product is not active for this seller';
    END IF;

    v_confirmed := v_confirmed || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_product_id,
        'sku_code', v_item->>'sku_code',
        'quantity', v_qty,
        'verification_status', 'CONFIRMED',
        'stocked_quantity', 0
      )
    );
  END LOOP;

  UPDATE public.orders
  SET expected_items = v_confirmed,
      content_verification_status = 'SKU_CONFIRMED',
      miri_sku_confirmed_at = now(),
      miri_sku_confirmed_by = v_actor,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, after_json)
  VALUES ('order', p_order_id, 'MIRI_SKU_CONFIRMED', v_actor,
    jsonb_build_object('items', v_confirmed));

  RETURN jsonb_build_object('success', true, 'content_status', 'SKU_CONFIRMED', 'stocked', false, 'items', v_confirmed);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_miri_pickup_skus(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_miri_pickup_skus(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.stock_miri_pickup_skus(
  p_order_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_warehouse_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty integer;
  v_actor uuid := auth.uid();
  v_stocked jsonb := '[]'::jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.order_type <> 'MIRI_INBOUND_PICKUP' THEN
    RAISE EXCEPTION 'Miri pickup order not found';
  END IF;
  IF v_order.runner_status::text <> 'DELIVERED' THEN
    RAISE EXCEPTION 'SKU can only be stocked after delivery';
  END IF;
  IF v_order.content_verification_status = 'STOCKED' THEN
    RETURN jsonb_build_object('success', true, 'already_stocked', true, 'content_status', 'STOCKED', 'items', v_order.expected_items);
  END IF;
  IF v_order.content_verification_status <> 'SKU_CONFIRMED' THEN
    RAISE EXCEPTION 'SKU must be confirmed before stock in';
  END IF;
  IF public.get_user_role(v_actor) NOT IN ('admin', 'manager')
    AND v_order.salesperson_id IS DISTINCT FROM v_actor
  THEN
    RAISE EXCEPTION 'Only the seller owner, manager, or admin can stock Miri SKUs';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one SKU stock-in item is required';
  END IF;

  SELECT w.id INTO v_warehouse_id
  FROM public.warehouses w
  WHERE w.owner_user_id = v_order.order_owner_id AND w.is_active = true
  ORDER BY w.created_at
  LIMIT 1;
  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Seller warehouse is not configured';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Stocked quantity must be positive';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_product_id AND p.is_active = true
        AND p.owner_user_id = v_order.order_owner_id
    ) THEN
      RAISE EXCEPTION 'Product is not active for this seller';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.stock_movements sm
      WHERE sm.order_id = p_order_id
        AND sm.product_id = v_product_id
        AND sm.movement_type = 'INBOUND_RECEIVE'::movement_type
    ) THEN
      INSERT INTO public.stock_movements (
        warehouse_id, product_id, movement_type, qty_change, reference_type,
        reference_id, created_by, order_id, unique_key
      ) VALUES (
        v_warehouse_id, v_product_id, 'INBOUND_RECEIVE'::movement_type, v_qty,
        'MANUAL'::reference_type, p_order_id, v_actor, p_order_id,
        'miri-sku:' || p_order_id::text || ':' || v_product_id::text
      );
    END IF;

    v_stocked := v_stocked || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_product_id,
        'sku_code', v_item->>'sku_code',
        'quantity', v_qty,
        'verification_status', 'STOCKED',
        'stocked_quantity', v_qty
      )
    );
  END LOOP;

  UPDATE public.orders
  SET expected_items = v_stocked,
      content_verification_status = 'STOCKED',
      miri_stocked_at = now(),
      miri_stocked_by = v_actor,
      inventory_status = 'STOCKED',
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, after_json)
  VALUES ('order', p_order_id, 'MIRI_SKU_STOCKED', v_actor,
    jsonb_build_object('items', v_stocked, 'warehouse_id', v_warehouse_id));

  RETURN jsonb_build_object('success', true, 'content_status', 'STOCKED', 'stocked', true, 'items', v_stocked);
END;
$$;

REVOKE ALL ON FUNCTION public.stock_miri_pickup_skus(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_miri_pickup_skus(uuid, jsonb) TO authenticated;

-- Keep Miri amounts out of the existing delivered and dashboard aggregates.
CREATE OR REPLACE FUNCTION public.get_delivered_orders_fast(
  p_runner_id uuid DEFAULT NULL,
  p_salesperson_id uuid DEFAULT NULL,
  p_salesperson_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, order_code text, order_date date, customer_name text, phone text,
  area text, address text, total_amount numeric, total_qty integer,
  payment_method text, runner_status text, reconciliation_status text,
  delivered_at timestamptz, salesperson_id uuid, salesperson_name text,
  runner_id uuid, runner_name text, driver_id uuid, driver_name text,
  items_summary text, items_json jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT o.id, o.order_code, o.order_date, o.customer_name, o.phone, o.area,
    o.address, o.total_amount, o.total_qty, o.payment_method::text,
    o.runner_status::text, o.reconciliation_status::text, o.delivered_at,
    o.salesperson_id, sp.display_name, o.runner_id, rn.display_name,
    o.driver_id, dr.display_name,
    COALESCE((SELECT string_agg(COALESCE(p.sku_code, oi.sku_label, 'Item') || ' x' || oi.qty::text, ', ')
      FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = o.id), 'No items'),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', oi.id, 'product_id', oi.product_id,
      'sku_code', p.sku_code, 'sku_name', p.sku_name, 'sku_label', oi.sku_label,
      'qty', oi.qty, 'price', oi.price, 'line_total', oi.line_total))
      FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = o.id), '[]'::jsonb)
  FROM orders o
  LEFT JOIN profiles sp ON sp.id = o.salesperson_id
  LEFT JOIN profiles rn ON rn.id = o.runner_id
  LEFT JOIN profiles dr ON dr.id = o.driver_id
  WHERE o.current_operational_state = 'DELIVERED'
    AND o.order_type <> 'MIRI_INBOUND_PICKUP'
    AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
    AND (p_salesperson_id IS NULL OR o.salesperson_id = p_salesperson_id)
    AND (p_salesperson_ids IS NULL OR o.salesperson_id = ANY(p_salesperson_ids))
  ORDER BY o.delivered_at DESC NULLS LAST, o.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION public.get_delivered_summary(
  p_runner_id uuid DEFAULT NULL,
  p_salesperson_id uuid DEFAULT NULL,
  p_salesperson_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(total_delivered bigint, pending_claim bigint, total_amount numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::bigint,
    count(*) FILTER (WHERE o.reconciliation_status = 'NOT_CLAIMED')::bigint,
    coalesce(sum(o.total_amount), 0)::numeric
  FROM orders o
  WHERE o.current_operational_state = 'DELIVERED'
    AND o.order_type <> 'MIRI_INBOUND_PICKUP'
    AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
    AND (p_salesperson_id IS NULL OR o.salesperson_id = p_salesperson_id)
    AND (p_salesperson_ids IS NULL OR o.salesperson_id = ANY(p_salesperson_ids));
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats_runner(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result json;
  today_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Kuala_Lumpur') AT TIME ZONE 'Asia/Kuala_Lumpur';
  tomorrow_start timestamptz;
BEGIN
  tomorrow_start := today_start + interval '1 day';
  SELECT json_build_object(
    'totalActive', count(*) FILTER (WHERE status = 'READY' AND runner_status IN ('ASSIGNED', 'TAKEN')),
    'assignedCount', count(*) FILTER (WHERE status = 'READY' AND runner_status = 'ASSIGNED'),
    'takenCount', count(*) FILTER (WHERE status = 'READY' AND runner_status = 'TAKEN'),
    'noDriverCount', count(*) FILTER (WHERE status = 'READY' AND runner_status IN ('ASSIGNED', 'TAKEN') AND driver_id IS NULL),
    'deliveredToday', count(*) FILTER (WHERE runner_status = 'DELIVERED' AND delivered_at >= today_start AND delivered_at < tomorrow_start),
    'failedToday', count(*) FILTER (WHERE runner_status = 'FAILED_DELIVERY' AND updated_at >= today_start AND updated_at < tomorrow_start),
    'totalDelivered', count(*) FILTER (WHERE runner_status = 'DELIVERED'),
    'totalFailed', count(*) FILTER (WHERE runner_status = 'FAILED_DELIVERY'),
    'activeValue', coalesce(sum(total_amount) FILTER (WHERE status = 'READY' AND runner_status IN ('ASSIGNED', 'TAKEN')), 0),
    'deliveredTodayValue', coalesce(sum(total_amount) FILTER (WHERE runner_status = 'DELIVERED' AND delivered_at >= today_start AND delivered_at < tomorrow_start), 0),
    'pendingClaimCount', count(*) FILTER (WHERE runner_status = 'DELIVERED' AND reconciliation_status = 'NOT_CLAIMED'),
    'pendingClaimValue', coalesce(sum(total_amount) FILTER (WHERE runner_status = 'DELIVERED' AND reconciliation_status = 'NOT_CLAIMED'), 0),
    'submittedClaimCount', count(*) FILTER (WHERE reconciliation_status = 'ADMIN_ACK_PENDING'),
    'submittedClaimValue', coalesce(sum(total_amount) FILTER (WHERE reconciliation_status = 'ADMIN_ACK_PENDING'), 0),
    'approvedClaimValue', coalesce(sum(total_amount) FILTER (WHERE runner_status = 'DELIVERED' AND reconciliation_status::text IN ('CLAIMED', 'SETTLED')), 0),
    'failedOrdersCount', count(*) FILTER (WHERE runner_status = 'FAILED_DELIVERY'),
    'driverIssuesCount', count(*) FILTER (WHERE status = 'READY' AND runner_status IN ('ASSIGNED', 'TAKEN') AND driver_id IS NOT NULL AND updated_at < now() - interval '24 hours'),
    'missingDeliveryChargesCount', (
      SELECT count(DISTINCT pending.area)
      FROM public.orders pending
      WHERE pending.runner_id = p_user_id
        AND pending.order_type <> 'MIRI_INBOUND_PICKUP'
        AND pending.runner_status = 'DELIVERED'
        AND pending.reconciliation_status = 'NOT_CLAIMED'
        AND pending.area IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.delivery_charges charge
          WHERE charge.runner_id = p_user_id AND lower(charge.area) = lower(pending.area)
            AND charge.status = 'APPROVED' AND charge.superseded_at IS NULL
        )
    )
  ) INTO result
  FROM public.orders
  WHERE runner_id = p_user_id
    AND status <> 'CANCELLED'
    AND order_type <> 'MIRI_INBOUND_PICKUP';
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats_admin()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE order_stats json; products_count bigint; claims_count bigint; inbound_count bigint; users_count bigint;
BEGIN
  SELECT json_build_object(
    'bookingOrders', count(*) FILTER (WHERE current_operational_state = 'BOOKING'),
    'readyOrders', count(*) FILTER (WHERE current_operational_state = 'READY'),
    'cancelledOrders', count(*) FILTER (WHERE current_operational_state = 'CANCELLED'),
    'pendingDelivery', count(*) FILTER (WHERE current_operational_state = 'READY' AND runner_status IN ('ASSIGNED', 'TAKEN', 'OUT_FOR_DELIVERY')),
    'deliveredOrders', count(*) FILTER (WHERE current_operational_state = 'DELIVERED'),
    'actionRequired', count(*) FILTER (WHERE current_operational_state = 'ACTION_REQUIRED'),
    'pendingClaimBatches', (SELECT count(*) FROM claim_batches WHERE status = 'ADMIN_ACK_PENDING')
  ) INTO order_stats
  FROM orders WHERE order_type <> 'MIRI_INBOUND_PICKUP';
  SELECT count(*) INTO products_count FROM products;
  SELECT count(*) INTO claims_count FROM claims;
  SELECT count(*) INTO inbound_count FROM inbound_shipments;
  SELECT count(*) INTO users_count FROM profiles WHERE is_active = true;
  RETURN json_build_object(
    'bookingOrders', (order_stats->>'bookingOrders')::int,
    'readyOrders', (order_stats->>'readyOrders')::int,
    'cancelledOrders', (order_stats->>'cancelledOrders')::int,
    'pendingDelivery', (order_stats->>'pendingDelivery')::int,
    'deliveredOrders', (order_stats->>'deliveredOrders')::int,
    'actionRequired', (order_stats->>'actionRequired')::int,
    'pendingClaimBatches', (order_stats->>'pendingClaimBatches')::int,
    'productsCount', products_count, 'totalClaims', claims_count,
    'totalInbounds', inbound_count, 'totalUsers', users_count
  );
END;
$$;
