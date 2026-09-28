-- Preserve current Driver photo selection and correction mode while validating partial collections.
DROP FUNCTION public.submit_driver_payment_result(uuid, text, numeric, numeric, uuid);
CREATE OR REPLACE FUNCTION public.submit_driver_payment_result(
  p_order_id uuid, p_payment_method text, p_cash_amount numeric,
  p_transfer_amount numeric, p_submission_id uuid,
  p_proof_images jsonb DEFAULT NULL, p_submission_mode text DEFAULT 'NEW'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_result jsonb;
  v_proofs jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role(auth.uid())::text <> 'driver' THEN
    RAISE EXCEPTION 'Only a Driver can submit delivery collection';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.driver_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'This order is not assigned to you';
  END IF;
  IF p_cash_amount IS NULL OR p_transfer_amount IS NULL
    OR p_cash_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_transfer_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_cash_amount < 0 OR p_transfer_amount < 0
    OR round(p_cash_amount, 2) <> p_cash_amount OR round(p_transfer_amount, 2) <> p_transfer_amount
    OR p_cash_amount + p_transfer_amount > private.order_cod_due_amount(p_order_id) THEN
    RAISE EXCEPTION 'The COD balance changed or the collection amount is invalid. Refresh before collecting.';
  END IF;
  IF p_payment_method NOT IN ('CASH', 'TRANSFER', 'CASH_TRANSFER')
    OR (p_payment_method = 'CASH' AND p_transfer_amount <> 0)
    OR (p_payment_method = 'TRANSFER' AND p_cash_amount <> 0) THEN
    RAISE EXCEPTION 'Collection amounts do not match the payment method';
  END IF;
  IF v_order.payment_history_unverified OR
    (v_order.payment_plan <> 'COD' AND v_order.receipt_status IS DISTINCT FROM 'confirmed') THEN
    RAISE EXCEPTION 'Transfer payment must be confirmed before delivery';
  END IF;
  IF p_proof_images IS NULL THEN
    SELECT COALESCE(jsonb_agg(a.url), '[]'::jsonb) INTO v_proofs
      FROM public.attachments a WHERE a.order_id = p_order_id AND a.type::text = 'delivery_photo';
  ELSE
    v_proofs := p_proof_images;
  END IF;
  PERFORM set_config('tomupro.collection_total', (p_cash_amount + p_transfer_amount)::text, true);
  v_result := public.submit_driver_delivery_result(p_order_id, 'DRIVER_DELIVERED_SUBMITTED',
    p_payment_method, p_cash_amount, NULL, NULL, NULL, p_submission_id, v_proofs, p_submission_mode);
  PERFORM set_config('tomupro.collection_total', '', true);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_driver_payment_result(uuid, text, numeric, numeric, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_driver_payment_result(uuid, text, numeric, numeric, uuid, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
