-- Driver delivery retries must use the remaining COD balance. The UI already
-- subtracts any collection recorded on the order, while the previous RPC
-- validated against the original COD amount and rejected a zero-balance retry.
-- Pure Transfer orders are canonicalized from the order's payment plan before
-- accepting driver input, so a stale client cannot record prepaid sales as cash.
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
  v_total_cash numeric;
  v_total_transfer numeric;
  v_collection_total numeric;
  v_effective_payment_method text;
  v_existing_attempt_id uuid;
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

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role::text = 'driver' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Only an active Driver can submit a delivery result';
  END IF;

  -- A successful submission may still be visible while the Driver retries
  -- after a network timeout. Treat that retry as idempotent and preserve the
  -- existing collection instead of running the payment validation again.
  IF v_order.driver_status::text = 'DRIVER_DELIVERED'
    AND COALESCE(v_order.runner_accept_status::text, 'PENDING') = 'PENDING'
    AND COALESCE(v_order.runner_review_status::text, 'NOT_REVIEWED') = 'NOT_REVIEWED'
  THEN
    SELECT da.id INTO v_existing_attempt_id
    FROM public.delivery_attempts da
    WHERE da.order_id = v_order.id
      AND da.driver_id = auth.uid()
      AND da.result_type = 'DRIVER_DELIVERED_SUBMITTED'
      AND da.runner_decision = 'PENDING'
    ORDER BY da.submitted_at DESC
    LIMIT 1;

    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'attempt_id', v_existing_attempt_id,
      'order_id', v_order.id,
      'result_type', 'DRIVER_DELIVERED_SUBMITTED'
    );
  END IF;

  v_cod_due := round(GREATEST(
    COALESCE(private.order_cod_due_amount(p_order_id), 0)
      - GREATEST(COALESCE(v_order.driver_cash_amount, 0), 0)
      - GREATEST(COALESCE(v_order.driver_transfer_amount, 0), 0),
    0
  ), 2);

  -- The order's payment plan remains authoritative for fully prepaid Transfer orders. The Driver may still report the actual payment choice for COD and mixed orders.
  -- has no COD balance and must never be accepted as CASH or CASH_TRANSFER.
  -- Keep the zero collection arguments so the delivery-result RPC derives the
  -- full prepaid amount as transfer without creating a cash liability.
  IF upper(COALESCE(v_order.payment_plan, '')) = 'TRANSFER'
    OR (upper(COALESCE(v_order.payment_method::text, '')) = 'TRANSFER'
      AND upper(COALESCE(v_order.payment_plan, '')) <> 'PARTIAL_TRANSFER_COD')
  THEN
    p_payment_method := 'TRANSFER';
    p_cash_amount := 0;
    p_transfer_amount := 0;
  END IF;

  IF p_cash_amount IS NULL OR p_transfer_amount IS NULL
    OR p_cash_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_transfer_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_cash_amount < 0
    OR p_transfer_amount < 0
    OR round(p_cash_amount, 2) <> p_cash_amount
    OR round(p_transfer_amount, 2) <> p_transfer_amount
    OR p_cash_amount + p_transfer_amount > v_cod_due
  THEN
    RAISE EXCEPTION 'The COD balance changed or the collection amount is invalid. Refresh before collecting.';
  END IF;

  IF p_payment_method NOT IN ('CASH', 'TRANSFER', 'CASH_TRANSFER')
    OR (p_payment_method = 'CASH' AND p_transfer_amount <> 0)
    OR (p_payment_method = 'TRANSFER' AND p_cash_amount <> 0)
  THEN
    RAISE EXCEPTION 'Collection amounts do not match the payment method';
  END IF;

  -- A Driver Transfer delivery must account for the full remaining COD balance.
  -- Customer-prepaid orders and already-collected COD orders have v_cod_due = 0.
  IF p_payment_method = 'TRANSFER'
    AND v_cod_due > 0
    AND p_transfer_amount <> v_cod_due
  THEN
    RAISE EXCEPTION 'Transfer collection must equal the current COD balance of %; refresh before submitting.', v_cod_due;
  END IF;

  IF v_order.payment_history_unverified
  THEN
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

  IF (p_payment_method = 'TRANSFER'
      OR (p_payment_method = 'CASH_TRANSFER' AND p_transfer_amount > 0))
    AND (jsonb_typeof(COALESCE(v_proofs, '[]'::jsonb)) <> 'array'
      OR jsonb_array_length(COALESCE(v_proofs, '[]'::jsonb)) < 1)
  THEN
    RAISE EXCEPTION 'A transfer receipt photo is required before submitting delivery';
  END IF;

  -- Store cumulative driver collection values. This keeps a partial cash or
  -- transfer collection intact when the Driver submits the remaining balance.
  v_total_cash := round(GREATEST(COALESCE(v_order.driver_cash_amount, 0), 0) + p_cash_amount, 2);
  v_total_transfer := round(GREATEST(COALESCE(v_order.driver_transfer_amount, 0), 0) + p_transfer_amount, 2);
  v_collection_total := round(v_total_cash + v_total_transfer, 2);
  v_effective_payment_method := CASE
    WHEN v_total_cash > 0 AND v_total_transfer > 0 THEN 'CASH_TRANSFER'
    WHEN v_total_transfer > 0 THEN 'TRANSFER'
    WHEN v_total_cash > 0 THEN 'CASH'
    ELSE p_payment_method
  END;

  PERFORM set_config('tomupro.collection_total', v_collection_total::text, true);
  v_result := public.submit_driver_delivery_result(
    p_order_id,
    'DRIVER_DELIVERED_SUBMITTED',
    v_effective_payment_method,
    v_total_cash,
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

-- Delivery writes must go through the payment wrapper above. The underlying
-- result function remains available to trusted server-side workflows only.
REVOKE ALL ON FUNCTION public.submit_driver_delivery_result(uuid, text, text, numeric, text, text, date, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_driver_delivery_result(uuid, text, text, numeric, text, text, date, uuid, jsonb, text) TO service_role;

NOTIFY pgrst, 'reload schema';
