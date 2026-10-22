-- A Driver Transfer proof is stored on the delivery attempt. When a Runner
-- accepts that delivered report, confirm the matching customer Transfer
-- payment in the same transaction so the delivery-state trigger can pass.
-- A missing proof still blocks acceptance.
DO $$
DECLARE
  v_definition text;
  v_rewritten text;
  v_pattern text;
  v_replacement text;
BEGIN
  SELECT pg_get_functiondef(
    'public.review_driver_delivery(uuid,uuid,boolean,text)'::regprocedure
  ) INTO v_definition;

  v_pattern := $pattern$v_previous_driver_id uuid;[[:space:]]+BEGIN$pattern$;
  v_replacement := $replacement$v_previous_driver_id uuid;
  v_transfer_payment_id uuid;
  v_transfer_payment_amount numeric;
  v_transfer_receipt_url text;
  v_expected_transfer_amount numeric;
BEGIN$replacement$;
  v_rewritten := regexp_replace(v_definition, v_pattern, v_replacement, 'g');
  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'Unable to add Driver Transfer receipt review variables';
  END IF;

  v_pattern := $pattern$  IF p_accept THEN$pattern$;
  v_replacement := $replacement$  IF p_accept THEN
    IF v_order.driver_status = 'DRIVER_DELIVERED'
      AND COALESCE(v_order.payment_plan::text, 'COD') <> 'COD'
      AND private.order_transfer_paid_amount(v_order.id)
        < round(GREATEST(COALESCE(v_order.total_amount, 0) - COALESCE(v_order.cod_amount, 0), 0), 2)
    THEN
      SELECT op.id, op.amount, op.receipt_url
      INTO v_transfer_payment_id, v_transfer_payment_amount, v_transfer_receipt_url
      FROM public.order_payments op
      WHERE op.order_id = v_order.id
        AND op.payment_type = 'TRANSFER'
        AND op.source = 'CUSTOMER_PREPAYMENT'
      ORDER BY op.created_at DESC NULLS LAST
      LIMIT 1
      FOR UPDATE;

      v_expected_transfer_amount := round(
        GREATEST(COALESCE(v_order.total_amount, 0) - COALESCE(v_order.cod_amount, 0), 0),
        2
      );

      IF v_transfer_payment_id IS NULL
        OR round(COALESCE(v_transfer_payment_amount, 0), 2) <> v_expected_transfer_amount
      THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Transfer payment amount does not match the order total'
        );
      END IF;

      IF v_transfer_receipt_url IS NULL
        OR v_transfer_receipt_url !~ '^https://[^/[:space:]]+'
      THEN
        SELECT NULLIF(trim(proof.value), '')
        INTO v_transfer_receipt_url
        FROM public.delivery_attempts da
        CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(COALESCE(da.proof_images, '[]'::jsonb)) = 'array'
              THEN da.proof_images
            ELSE '[]'::jsonb
          END
        ) AS proof(value)
        WHERE da.order_id = v_order.id
          AND da.driver_id = v_order.driver_id
          AND da.result_type = 'DRIVER_DELIVERED_SUBMITTED'
          AND da.runner_decision = 'PENDING'
          AND da.superseded_at IS NULL
          AND upper(COALESCE(da.driver_payment_method, '')) IN ('TRANSFER', 'CASH_TRANSFER')
          AND trim(proof.value) ~ '^https://[^/[:space:]]+'
        ORDER BY da.submitted_at DESC NULLS LAST, da.created_at DESC NULLS LAST
        LIMIT 1;
      END IF;

      IF v_transfer_receipt_url IS NULL
        OR v_transfer_receipt_url !~ '^https://[^/[:space:]]+'
      THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'A Transfer receipt photo is required before accepting delivery'
        );
      END IF;

      UPDATE public.order_payments
      SET receipt_url = v_transfer_receipt_url,
          status = 'CONFIRMED',
          receipt_status = 'confirmed',
          confirmed_by = p_actor_id,
          confirmed_at = now(),
          updated_at = now()
      WHERE id = v_transfer_payment_id;

      PERFORM set_config('tomupro.payment_update_authorized', 'true', true);
      UPDATE public.orders
      SET receipt_url = COALESCE(v_order.receipt_url, v_transfer_receipt_url),
          receipt_status = 'confirmed',
          receipt_confirmed_by = p_actor_id,
          receipt_confirmed_at = now(),
          receipt_rejected_reason = NULL,
          updated_at = now()
      WHERE id = v_order.id;

      INSERT INTO public.audit_logs (
        entity_type,
        entity_id,
        action,
        actor_id,
        before_json,
        after_json
      )
      VALUES (
        'order',
        v_order.id,
        'receipt_confirmed',
        p_actor_id,
        jsonb_build_object(
          'receipt_status', v_order.receipt_status,
          'transfer_amount', v_transfer_payment_amount
        ),
        jsonb_build_object(
          'receipt_status', 'confirmed',
          'transfer_amount', v_transfer_payment_amount,
          'receipt_source', 'driver_delivery_proof'
        )
      );
    END IF;$replacement$;
  v_rewritten := regexp_replace(v_rewritten, v_pattern, v_replacement, 'g');
  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'Unable to add Driver Transfer receipt review flow';
  END IF;

  EXECUTE v_rewritten;
END $$;

GRANT EXECUTE ON FUNCTION public.review_driver_delivery(uuid, uuid, boolean, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
