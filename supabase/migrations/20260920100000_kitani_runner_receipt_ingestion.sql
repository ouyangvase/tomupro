-- Keep KITANI ingestion additive: the existing three-argument RPC remains
-- available for older callers, while the receiver uses this four-argument
-- entry point to apply the configured Runner assignment.

CREATE INDEX IF NOT EXISTS idx_orders_kitani_runner_assignment
  ON public.orders (runner_id, runner_status)
  WHERE order_source = 'KITANI';

-- The web app already uses this bucket for manually uploaded transfer receipts.
-- Create it only when it is missing; do not change an existing bucket's privacy.
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ingest_kitani_order(
  p_event jsonb,
  p_system_profile_id uuid,
  p_idempotency_key text,
  p_runner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_order_id uuid;
  v_assigned_count integer := 0;
  v_payment_method text := upper(COALESCE(p_event #>> '{financials,payment_method}', ''));
BEGIN
  IF p_runner_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_runner_id
      AND role = 'runner'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'KITANI runner is not an active runner';
  END IF;

  -- Reuse the already-validated, idempotent financial ingestion path.
  v_result := public.ingest_kitani_order(
    p_event,
    p_system_profile_id,
    p_idempotency_key
  );

  v_order_id := NULLIF(v_result->>'order_id', '')::uuid;
  IF v_order_id IS NULL THEN
    RETURN v_result;
  END IF;

  -- This predicate is intentionally narrow. It assigns only new or still
  -- unassigned KITANI orders and never moves a delivered/failed/cancelled or
  -- already-owned order to another Runner.
  UPDATE public.orders
  SET runner_id = p_runner_id,
      runner_status = 'ASSIGNED'::public.runner_status,
      receipt_status = CASE
        WHEN v_payment_method = 'TRANSFER' THEN COALESCE(receipt_status, 'pending')
        ELSE receipt_status
      END
  WHERE id = v_order_id
    AND order_source = 'KITANI'
    AND status = 'READY'::public.order_status
    AND runner_id IS NULL
    AND runner_status = 'UNASSIGNED'::public.runner_status;

  GET DIAGNOSTICS v_assigned_count = ROW_COUNT;

  IF v_assigned_count > 0 THEN
    INSERT INTO public.audit_logs (
      entity_type,
      entity_id,
      actor_id,
      action,
      before_json,
      after_json
    ) VALUES (
      'order',
      v_order_id,
      p_system_profile_id,
      'KITANI_ORDER_AUTO_ASSIGNED',
      jsonb_build_object('runner_id', NULL, 'runner_status', 'UNASSIGNED'),
      jsonb_build_object(
        'runner_id', p_runner_id,
        'runner_status', 'ASSIGNED',
        'payment_method', v_payment_method
      )
    );
  END IF;

  RETURN v_result || jsonb_build_object('runner_id', p_runner_id, 'runner_assigned', v_assigned_count > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_kitani_order(jsonb, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_kitani_order(jsonb, uuid, text, uuid) TO service_role;

-- One-time, explicitly scoped repair for existing KITANI orders. The caller
-- supplies the already verified active Runner UUID; no order outside the safe
-- READY + UNASSIGNED state is touched.
CREATE OR REPLACE FUNCTION public.backfill_kitani_runner_assignments(
  p_runner_id uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count integer := 0;
BEGIN
  IF p_runner_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_runner_id
      AND role = 'runner'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'KITANI runner is not an active runner';
  END IF;

  WITH updated_orders AS (
    UPDATE public.orders
    SET runner_id = p_runner_id,
        runner_status = 'ASSIGNED'::public.runner_status,
        receipt_status = CASE
          WHEN payment_method = 'TRANSFER' THEN COALESCE(receipt_status, 'pending')
          ELSE receipt_status
        END
    WHERE order_source = 'KITANI'
      AND status = 'READY'::public.order_status
      AND runner_id IS NULL
      AND runner_status = 'UNASSIGNED'::public.runner_status
    RETURNING id, payment_method
  )
  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    actor_id,
    action,
    before_json,
    after_json
  )
  SELECT
    'order',
    id,
    p_actor_id,
    'KITANI_ORDER_AUTO_ASSIGNED_BACKFILL',
    jsonb_build_object('runner_id', NULL, 'runner_status', 'UNASSIGNED'),
    jsonb_build_object(
      'runner_id', p_runner_id,
      'runner_status', 'ASSIGNED',
      'payment_method', payment_method
    )
  FROM updated_orders;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN jsonb_build_object('updated_orders', v_updated_count, 'runner_id', p_runner_id);
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_kitani_runner_assignments(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_kitani_runner_assignments(uuid, uuid) TO service_role;
