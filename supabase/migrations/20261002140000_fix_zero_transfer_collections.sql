-- Existing accepted rows are protected by the finance-correction trigger. Their
-- zero-valued legacy records are repaired in reporting code instead of bypassing
-- that audit boundary or rewriting an approved claim.

DROP FUNCTION IF EXISTS public.submit_driver_payment_result(uuid, text, numeric, numeric, uuid, jsonb, text);

CREATE OR REPLACE FUNCTION public.submit_driver_payment_result(
  p_order_id uuid,
  p_payment_method text,
  p_cash_amount numeric,
  p_transfer_amount numeric,
  p_submission_id uuid,
  p_proof_images jsonb DEFAULT NULL,
  p_submission_mode text DEFAULT 'NEW'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_result jsonb;
  v_proofs jsonb;
  v_cod_due numeric;
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role(auth.uid())::text <> 'driver' THEN
    RAISE EXCEPTION 'Only a Driver can submit delivery collection';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL OR v_order.driver_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'This order is not assigned to you';
  END IF;

  v_cod_due := round(private.order_cod_due_amount(p_order_id), 2);

  IF p_cash_amount IS NULL OR p_transfer_amount IS NULL
    OR p_cash_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_transfer_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_cash_amount < 0
    OR p_transfer_amount < 0
    OR round(p_cash_amount, 2) <> p_cash_amount
    OR round(p_transfer_amount, 2) <> p_transfer_amount
    OR p_cash_amount + p_transfer_amount > v_cod_due THEN
    RAISE EXCEPTION 'The COD balance changed or the collection amount is invalid. Refresh before collecting.';
  END IF;

  IF p_payment_method NOT IN ('CASH', 'TRANSFER', 'CASH_TRANSFER')
    OR (p_payment_method = 'CASH' AND p_transfer_amount <> 0)
    OR (p_payment_method = 'TRANSFER' AND p_cash_amount <> 0) THEN
    RAISE EXCEPTION 'Collection amounts do not match the payment method';
  END IF;

  -- A Driver Transfer delivery must account for the full remaining COD balance.
  -- Customer-prepaid orders have v_cod_due = 0 and legitimately submit zero.
  IF p_payment_method = 'TRANSFER'
    AND v_cod_due > 0
    AND p_transfer_amount <> v_cod_due THEN
    RAISE EXCEPTION 'Transfer collection must equal the current COD balance of %; refresh before submitting.', v_cod_due;
  END IF;

  IF v_order.payment_history_unverified
    OR (v_order.payment_plan <> 'COD' AND v_order.receipt_status IS DISTINCT FROM 'confirmed') THEN
    RAISE EXCEPTION 'Transfer payment must be confirmed before delivery';
  END IF;

  IF p_proof_images IS NULL THEN
    SELECT COALESCE(jsonb_agg(a.url), '[]'::jsonb) INTO v_proofs
    FROM public.attachments a
    WHERE a.order_id = p_order_id
      AND a.type::text = 'delivery_photo';
  ELSE
    v_proofs := p_proof_images;
  END IF;

  PERFORM set_config('tomupro.collection_total', (p_cash_amount + p_transfer_amount)::text, true);
  v_result := public.submit_driver_delivery_result(
    p_order_id,
    'DRIVER_DELIVERED_SUBMITTED',
    p_payment_method,
    p_cash_amount,
    NULL,
    NULL,
    NULL,
    p_submission_id,
    v_proofs,
    p_submission_mode
  );
  PERFORM set_config('tomupro.collection_total', '', true);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_driver_payment_result(uuid, text, numeric, numeric, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_driver_payment_result(uuid, text, numeric, numeric, uuid, jsonb, text) TO authenticated;

-- Cash Settlement reporting must use the same legacy Transfer fallback as the
-- Runner UI. This changes the read projection only; it does not create a new
-- payment or alter an accepted claim.
CREATE OR REPLACE FUNCTION public.get_runner_accepted_driver_deliveries(
  p_runner_id uuid,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_driver_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  order_code text,
  customer_name text,
  total_amount numeric,
  driver_id uuid,
  driver_payment_method text,
  driver_cash_amount numeric,
  driver_transfer_amount numeric,
  driver_delivered_at timestamptz,
  delivered_at timestamptz,
  delivery_event_at timestamptz,
  payment_method text,
  driver_name text,
  order_items jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF public.get_user_role(v_actor_id)::text <> 'admin'
    AND v_actor_id <> p_runner_id
    AND NOT public.has_runner_assistant_permission(v_actor_id, p_runner_id, 'cash_settlement')
  THEN
    RAISE EXCEPTION 'Cash Settlement access required';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.order_code,
    o.customer_name,
    o.total_amount,
    o.driver_id,
    o.driver_payment_method,
    coalesce(o.driver_cash_amount, CASE WHEN upper(o.payment_method::text) IN ('COD', 'CASH') THEN o.total_amount ELSE 0 END),
    CASE
      WHEN upper(coalesce(o.driver_payment_method::text, '')) = 'TRANSFER'
        AND coalesce(o.driver_transfer_amount, 0) = 0
        AND upper(coalesce(o.payment_plan::text, '')) = 'COD'
      THEN greatest(
        coalesce(private.order_cod_due_amount(o.id), 0),
        coalesce(o.cod_amount, 0),
        coalesce(o.total_amount, 0)
      )
      ELSE coalesce(o.driver_transfer_amount, CASE WHEN upper(o.payment_method::text) IN ('TRANSFER', 'BANK_TRANSFER') THEN o.total_amount ELSE 0 END)
    END,
    o.driver_delivered_at,
    o.delivered_at,
    coalesce(liability.delivered_at, o.delivered_at, o.driver_delivered_at),
    o.payment_method::text,
    coalesce(driver.display_name, driver.email, 'Unknown Driver')::text,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object('qty', oi.qty) ORDER BY oi.created_at, oi.id)
      FROM public.order_items oi
      WHERE oi.order_id = o.id
    ), '[]'::jsonb)
  FROM public.orders o
  LEFT JOIN public.profiles driver ON driver.id = o.driver_id
  LEFT JOIN public.cash_liabilities liability ON liability.order_id = o.id
  WHERE o.runner_id = p_runner_id
    AND o.driver_status = 'DRIVER_DELIVERED'
    AND o.runner_accept_status = 'ACCEPTED'
    AND o.runner_status = 'DELIVERED'
    AND o.driver_id IS NOT NULL
    AND upper(coalesce(o.status::text, '')) NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
    AND (p_driver_id IS NULL OR o.driver_id = p_driver_id)
    AND (
      p_date_from IS NULL
      OR (coalesce(liability.delivered_at, o.delivered_at, o.driver_delivered_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= p_date_from
    )
    AND (
      p_date_to IS NULL
      OR (coalesce(liability.delivered_at, o.delivered_at, o.driver_delivered_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= p_date_to
    )
  ORDER BY coalesce(liability.delivered_at, o.delivered_at, o.driver_delivered_at) DESC, o.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_runner_accepted_driver_deliveries(uuid, date, date, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
