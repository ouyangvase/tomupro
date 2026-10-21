-- A fully prepaid Transfer order has no COD balance. The previous RPC computed
-- the pending transfer amount as COD before canonicalizing the Driver's choice,
-- which made a valid Transfer submission fail with a false COD-balance error.
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
  v_pure_transfer boolean;
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

  v_pure_transfer := upper(COALESCE(v_order.payment_plan, '')) = 'TRANSFER'
    OR (upper(COALESCE(v_order.payment_method::text, '')) = 'TRANSFER'
      AND upper(COALESCE(v_order.payment_plan, '')) <> 'PARTIAL_TRANSFER_COD')
  ;

  -- The order's payment plan remains authoritative for fully prepaid Transfer
  -- orders. They have no COD balance, even when the customer receipt is still
  -- awaiting Runner review.
  IF v_pure_transfer THEN
    p_payment_method := 'TRANSFER';
    p_cash_amount := 0;
    p_transfer_amount := 0;
    v_cod_due := 0;
  ELSE
    v_cod_due := round(GREATEST(
      COALESCE(private.order_cod_due_amount(p_order_id), 0)
        - GREATEST(COALESCE(v_order.driver_cash_amount, 0), 0)
        - GREATEST(COALESCE(v_order.driver_transfer_amount, 0), 0),
      0
    ), 2);
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

-- A Driver's canonical submission is a review-pending handoff. The Driver
-- receipt is the evidence Runner must review, so a pending customer receipt
-- must not block the handoff. Direct updates and final Runner delivery remain
-- gated by the confirmed customer payment state.
CREATE OR REPLACE FUNCTION public.check_order_payment_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.payment_history_unverified := false;
    IF NEW.payment_plan = 'PARTIAL_TRANSFER_COD'
       AND current_setting('tomupro.payment_update_authorized', true) IS DISTINCT FROM 'true'
       AND COALESCE(auth.role(), '') <> 'service_role' THEN
      RAISE EXCEPTION 'Create partial payments through the payment workflow';
    END IF;
    IF NEW.payment_method::text = 'TRANSFER' AND NEW.payment_plan = 'COD' THEN
      NEW.payment_plan := 'TRANSFER';
    END IF;
    IF NEW.payment_plan = 'COD' THEN NEW.cod_amount := NEW.total_amount; END IF;
    IF NEW.payment_plan = 'TRANSFER' THEN NEW.cod_amount := 0; END IF;
    IF NEW.payment_plan = 'PARTIAL_TRANSFER_COD' AND (NEW.receipt_url IS NULL OR NEW.receipt_url !~ '^https://[^/[:space:]]+') THEN
      RAISE EXCEPTION 'An HTTPS receipt is required for every transfer portion';
    END IF;
    IF NEW.payment_plan = 'PARTIAL_TRANSFER_COD' AND (NEW.cod_amount <= 0 OR NEW.cod_amount >= NEW.total_amount) THEN
      RAISE EXCEPTION 'Partial COD balance must be between zero and the order total';
    END IF;
    IF NEW.payment_plan <> 'COD' THEN NEW.receipt_status := 'pending'; END IF;
  ELSE
    IF NEW.total_amount IS DISTINCT FROM OLD.total_amount
       AND current_setting('tomupro.payment_update_authorized', true) IS DISTINCT FROM 'true' THEN
      IF OLD.payment_plan <> 'COD' OR OLD.driver_status::text = 'DRIVER_DELIVERED'
         OR OLD.runner_status::text = 'DELIVERED' THEN
        RAISE EXCEPTION 'Change the order total through the payment update workflow';
      END IF;
      NEW.cod_amount := NEW.total_amount;
    END IF;

    IF (
      (NEW.driver_status::text = 'DRIVER_DELIVERED'
       AND NEW.driver_status IS DISTINCT FROM OLD.driver_status
       AND current_setting('app.driver_submission', true) IS DISTINCT FROM 'true')
      OR (NEW.runner_status::text = 'DELIVERED' AND NEW.runner_status IS DISTINCT FROM OLD.runner_status)
    ) THEN
      IF NEW.payment_plan <> 'COD' AND (
        NEW.receipt_status IS DISTINCT FROM 'confirmed'
        OR private.order_transfer_paid_amount(NEW.id) <> NEW.total_amount - NEW.cod_amount
      ) THEN
        RAISE EXCEPTION 'Receipt must be confirmed before delivery for transfer payments';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
