-- PP132 and FF67 were reported by the Driver as full Transfer orders, but
-- their canonical payment plan was stored as COD. Correct only these two
-- still-actionable orders and keep their rejected Driver attempts immutable.
DO $$
DECLARE
  v_code text;
  v_order public.orders%ROWTYPE;
  v_changed boolean;
  v_now timestamptz := clock_timestamp();
BEGIN
  FOREACH v_code IN ARRAY ARRAY['PP132', 'FF67']::text[] LOOP
    SELECT * INTO v_order
    FROM public.orders
    WHERE upper(order_code) = upper(v_code)
    FOR UPDATE;

    IF v_order.id IS NULL THEN
      RAISE EXCEPTION 'Order % was not found', v_code;
    END IF;

    v_changed := false;

    IF v_order.payment_plan <> 'TRANSFER'
       OR v_order.payment_method::text <> 'TRANSFER'
       OR COALESCE(v_order.cod_amount, 0) <> 0
    THEN
      IF v_order.payment_plan <> 'COD'
         OR v_order.payment_method::text <> 'COD'
      THEN
        RAISE EXCEPTION 'Order % has an unexpected payment plan; correction stopped', v_order.order_code;
      END IF;

      IF v_order.runner_status::text = 'DELIVERED'
         OR v_order.driver_status::text = 'DRIVER_DELIVERED'
         OR COALESCE(v_order.driver_cash_amount, 0) > 0
         OR COALESCE(v_order.driver_transfer_amount, 0) > 0
      THEN
        RAISE EXCEPTION 'Order % has a delivered or collected state; correction stopped', v_order.order_code;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.order_payments
        WHERE order_id = v_order.id
          AND status = 'CONFIRMED'
      ) THEN
        RAISE EXCEPTION 'Order % has a confirmed payment; correction stopped', v_order.order_code;
      END IF;

      PERFORM set_config('tomupro.payment_update_authorized', 'true', true);

      UPDATE public.orders
      SET payment_method = 'TRANSFER'::public.payment_method,
          payment_plan = 'TRANSFER',
          cod_amount = 0,
          is_customer_cod = false,
          receipt_status = CASE
            WHEN receipt_url IS NULL THEN NULL
            ELSE COALESCE(receipt_status, 'pending')
          END,
          updated_at = v_now
      WHERE id = v_order.id;

      v_changed := true;
    END IF;

    -- Keep a pending ledger row so Finance and Runner see the full Transfer
    -- amount, while still requiring an HTTPS receipt before confirmation.
    INSERT INTO public.order_payments (
      order_id,
      payment_type,
      source,
      amount,
      status,
      receipt_url,
      receipt_status,
      recorded_by,
      confirmed_by,
      confirmed_at,
      updated_at
    )
    VALUES (
      v_order.id,
      'TRANSFER',
      'CUSTOMER_PREPAYMENT',
      v_order.total_amount,
      'PENDING',
      v_order.receipt_url,
      CASE WHEN v_order.receipt_url IS NULL THEN NULL ELSE COALESCE(v_order.receipt_status, 'pending') END,
      NULL,
      NULL,
      NULL,
      v_now
    )
    ON CONFLICT (order_id, payment_type, source) DO UPDATE
    SET amount = EXCLUDED.amount,
        updated_at = EXCLUDED.updated_at
    WHERE order_payments.status <> 'CONFIRMED';

    IF v_changed THEN
      INSERT INTO public.audit_logs (
        entity_type,
        entity_id,
        order_id,
        order_ref,
        action,
        action_type,
        action_description,
        actor_id,
        before_json,
        after_json,
        remarks
      )
      VALUES (
        'order',
        v_order.id,
        v_order.id,
        v_order.order_code,
        'ORDER_PAYMENT_PLAN_CORRECTED',
        'FINANCE_CORRECTION',
        'Corrected Driver-reported full Transfer order that was stored as COD',
        NULL,
        jsonb_build_object(
          'payment_method', v_order.payment_method,
          'payment_plan', v_order.payment_plan,
          'cod_amount', v_order.cod_amount,
          'is_customer_cod', v_order.is_customer_cod,
          'receipt_status', v_order.receipt_status
        ),
        jsonb_build_object(
          'payment_method', 'TRANSFER',
          'payment_plan', 'TRANSFER',
          'transfer_amount', v_order.total_amount,
          'cod_amount', 0,
          'is_customer_cod', false,
          'receipt_required', true,
          'receipt_status', CASE WHEN v_order.receipt_url IS NULL THEN NULL ELSE COALESCE(v_order.receipt_status, 'pending') END
        ),
        'Driver reported full Transfer; preserve old rejected delivery attempts and require receipt verification'
      );
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
