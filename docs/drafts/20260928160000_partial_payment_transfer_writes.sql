-- Draft companion to the payment foundation. Not ready for production release.
BEGIN;

CREATE FUNCTION private.save_order_transfer(
  p_order_id uuid, p_amount numeric, p_receipt_url text, p_reference text,
  p_reason text, p_expected_revision bigint, p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_existing public.order_payments%ROWTYPE;
  v_previous public.order_payments%ROWTYPE;
  v_payment_id uuid := gen_random_uuid();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO STRICT v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_actor AND is_active) OR (
    public.get_user_role(v_actor)::text = 'admin' OR v_order.salesperson_id = v_actor OR v_order.runner_id = v_actor
  ) IS NOT TRUE THEN RAISE EXCEPTION 'Payment edit access required'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'A save request ID is required'; END IF;
  SELECT * INTO v_existing FROM public.order_payments WHERE order_id = p_order_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.created_by <> v_actor OR v_existing.amount IS DISTINCT FROM p_amount
      OR v_existing.receipt_url IS DISTINCT FROM p_receipt_url OR v_existing.reference IS DISTINCT FROM p_reference THEN
      RAISE EXCEPTION 'Save request ID was already used for different payment details';
    END IF;
    RETURN jsonb_build_object('payment_id', v_existing.id, 'already_saved', true, 'payment_revision', v_order.payment_revision);
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_order.payment_revision THEN RAISE EXCEPTION 'Payment details changed. Refresh the order before saving.'; END IF;
  IF p_amount IS NULL OR p_amount < 0 OR p_amount > v_order.total_amount OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'Transfer amount must be between zero and the order total, with at most two decimal places';
  END IF;
  IF p_amount > 0 AND nullif(btrim(p_receipt_url), '') IS NULL THEN RAISE EXCEPTION 'Upload a transfer receipt'; END IF;
  IF v_order.driver_id IS NOT NULL THEN
    RAISE EXCEPTION 'Driver is already assigned. Unassign the driver before changing payment details that affect the COD amount.';
  END IF;
  IF v_order.payment_picked_up_at IS NOT NULL OR v_order.driver_started_at IS NOT NULL
    OR v_order.payment_delivered_at IS NOT NULL OR v_order.delivered_at IS NOT NULL THEN
    RAISE EXCEPTION 'Payment editing is locked after pickup or delivery. Use a Finance Payment Correction.';
  END IF;
  IF NOT v_order.payment_ledger_enabled THEN
    IF v_order.payment_method::text <> 'COD' OR v_order.receipt_status IS NOT NULL THEN
      RAISE EXCEPTION 'Historical transfer requires Finance review before payment editing';
    END IF;
    UPDATE public.orders SET payment_ledger_enabled = true WHERE id = p_order_id;
  END IF;
  FOR v_previous IN SELECT p.* FROM public.order_payments p WHERE p.order_id = p_order_id
    AND p.payment_type = 'BANK_TRANSFER' AND p.status IN ('pending','confirmed') AND p.reverses_payment_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.order_payments r WHERE r.reverses_payment_id = p.id AND r.status = 'confirmed')
  LOOP
    IF v_previous.status = 'confirmed' THEN
      IF (public.get_user_role(v_actor)::text = 'admin' OR v_order.runner_id = v_actor) IS NOT TRUE THEN
        RAISE EXCEPTION 'Receipt reviewer access is required to reverse a confirmed transfer';
      END IF;
      IF nullif(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'A reason is required to replace a confirmed transfer'; END IF;
      INSERT INTO public.order_payments(order_id,payment_type,amount,status,reverses_payment_id,reason,created_by,confirmed_by,confirmed_at,request_id)
        VALUES (p_order_id,'BANK_TRANSFER',v_previous.amount,'confirmed',v_previous.id,p_reason,v_actor,v_actor,now(),gen_random_uuid());
    ELSE
      UPDATE public.order_payments SET status = 'voided', reason = coalesce(nullif(btrim(p_reason), ''), 'Replaced pending transfer') WHERE id = v_previous.id;
    END IF;
  END LOOP;
  INSERT INTO public.order_payments(id,order_id,payment_type,amount,status,receipt_url,reference,reason,created_by,request_id)
    VALUES (v_payment_id,p_order_id,'BANK_TRANSFER',p_amount,CASE WHEN p_amount = 0 THEN 'voided' ELSE 'pending' END,
      p_receipt_url,p_reference,p_reason,v_actor,p_request_id);
  UPDATE public.orders SET
    payment_method = CASE WHEN p_amount > 0 AND p_amount = total_amount THEN 'TRANSFER' ELSE 'COD' END::public.payment_method,
    receipt_url = p_receipt_url, receipt_status = CASE WHEN p_amount > 0 THEN 'pending' ELSE NULL END,
    receipt_confirmed_by = NULL, receipt_confirmed_at = NULL, receipt_rejected_reason = NULL
    WHERE id = p_order_id;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  RETURN jsonb_build_object('payment_id',v_payment_id,'already_saved',false,'payment_revision',v_order.payment_revision,'cod_due',v_order.cod_due);
END;
$$;

CREATE FUNCTION public.save_order_transfer(
  p_order_id uuid, p_amount numeric, p_receipt_url text, p_reference text,
  p_reason text, p_expected_revision bigint, p_request_id uuid
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.save_order_transfer(p_order_id,p_amount,p_receipt_url,p_reference,p_reason,p_expected_revision,p_request_id);
$$;
REVOKE ALL ON FUNCTION private.save_order_transfer(uuid,numeric,text,text,text,bigint,uuid),
  public.save_order_transfer(uuid,numeric,text,text,text,bigint,uuid) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.save_order_transfer(uuid,numeric,text,text,text,bigint,uuid),
  public.save_order_transfer(uuid,numeric,text,text,text,bigint,uuid) TO authenticated;

COMMIT;
