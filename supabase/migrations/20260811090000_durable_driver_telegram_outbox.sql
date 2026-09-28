BEGIN;

-- Driver outcome notifications must be created in the same transaction as the
-- order update.  The external Telegram call is intentionally not made here.
-- A failed queue insert rolls back the order update instead of silently losing
-- the notification event.
CREATE OR REPLACE FUNCTION public.queue_telegram_order_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_event_type text;
  v_metadata jsonb;
  v_dedupe_key text;
BEGIN
  IF OLD.receipt_status IS DISTINCT FROM NEW.receipt_status THEN
    v_event_type := NULL;

    IF NEW.receipt_status = 'pending' AND OLD.receipt_status IS NULL THEN
      v_event_type := 'receipt_uploaded';
    ELSIF NEW.receipt_status = 'pending' AND OLD.receipt_status = 'rejected' THEN
      v_event_type := 'receipt_reuploaded';
    ELSIF NEW.receipt_status = 'rejected' THEN
      v_event_type := 'receipt_rejected';
    ELSIF NEW.receipt_status = 'confirmed' THEN
      v_event_type := 'receipt_confirmed';
    END IF;

    IF v_event_type IS NOT NULL THEN
      v_metadata := jsonb_build_object(
        'order_code', NEW.order_code,
        'customer_name', NEW.customer_name,
        'total_amount', NEW.total_amount,
        'payment_method', NEW.payment_method,
        'receipt_status', NEW.receipt_status
      );

      INSERT INTO public.telegram_event_queue (event_type, order_id, runner_id, metadata)
      VALUES (v_event_type, NEW.id, NEW.runner_id, v_metadata);
    END IF;
  END IF;

  IF OLD.runner_status IS DISTINCT FROM NEW.runner_status THEN
    v_event_type := NULL;

    IF NEW.runner_status = 'ASSIGNED' THEN
      v_event_type := 'order_assigned';
    ELSIF NEW.runner_status = 'TAKEN' THEN
      v_event_type := 'order_taken';
    ELSIF NEW.runner_status = 'DELIVERED' THEN
      v_event_type := 'order_delivered';
    ELSIF NEW.runner_status = 'FAILED_DELIVERY' THEN
      v_event_type := 'delivery_failed';
    END IF;

    IF v_event_type IS NOT NULL THEN
      v_metadata := jsonb_build_object(
        'order_code', NEW.order_code,
        'customer_name', NEW.customer_name,
        'total_amount', NEW.total_amount,
        'payment_method', NEW.payment_method,
        'runner_status', NEW.runner_status,
        'prev_runner_status', OLD.runner_status
      );

      INSERT INTO public.telegram_event_queue (event_type, order_id, runner_id, metadata)
      VALUES (v_event_type, NEW.id, NEW.runner_id, v_metadata);
    END IF;
  END IF;

  -- A Driver event is a change to the outcome facts, not only a change to the
  -- status label. This covers retries where the status remains DRIVER_FAILED
  -- but the failure reason, remark, or reschedule date is corrected, as well
  -- as delivered proof timestamps being finalized.
  IF NEW.driver_status IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
    AND (
      OLD.driver_status IS DISTINCT FROM NEW.driver_status
      OR OLD.driver_delivered_at IS DISTINCT FROM NEW.driver_delivered_at
      OR OLD.driver_failed_reason IS DISTINCT FROM NEW.driver_failed_reason
      OR OLD.driver_failed_remark IS DISTINCT FROM NEW.driver_failed_remark
      OR OLD.driver_next_delivery_date IS DISTINCT FROM NEW.driver_next_delivery_date
    )
  THEN
    v_event_type := CASE
      WHEN NEW.driver_status = 'DRIVER_DELIVERED' THEN 'driver_delivered'
      ELSE 'driver_failed'
    END;

    v_dedupe_key := md5(concat_ws('|',
      v_event_type,
      NEW.id::text,
      COALESCE(NEW.driver_status, ''),
      COALESCE(NEW.driver_delivered_at::text, ''),
      COALESCE(NEW.driver_failed_reason, ''),
      COALESCE(NEW.driver_failed_remark, ''),
      COALESCE(NEW.driver_next_delivery_date::text, '')
    ));

    v_metadata := jsonb_build_object(
      'order_code', NEW.order_code,
      'customer_name', NEW.customer_name,
      'total_amount', NEW.total_amount,
      'payment_method', NEW.payment_method,
      'driver_payment_method', NEW.driver_payment_method,
      'driver_status', NEW.driver_status,
      'prev_driver_status', OLD.driver_status,
      'driver_id', NEW.driver_id,
      'salesperson_id', NEW.salesperson_id,
      'order_owner_id', NEW.order_owner_id,
      'owner_salesperson_id_snapshot', NEW.owner_salesperson_id_snapshot,
      'owner_manager_id_snapshot', NEW.owner_manager_id_snapshot,
      'driver_delivered_at', NEW.driver_delivered_at,
      'driver_failed_reason', NEW.driver_failed_reason,
      'driver_failed_remark', NEW.driver_failed_remark,
      'driver_next_delivery_date', NEW.driver_next_delivery_date,
      'updated_at', NEW.updated_at
    );

    INSERT INTO public.telegram_event_queue (event_type, order_id, runner_id, metadata, dedupe_key)
    VALUES (v_event_type, NEW.id, NEW.runner_id, v_metadata, v_dedupe_key)
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- The sender must never leave queue and audit with different states.  This
-- RPC is service-role-only and is called by send-telegram-event for every
-- driver event state transition.
CREATE OR REPLACE FUNCTION public.set_telegram_driver_event_state(
  p_event_id uuid,
  p_status text,
  p_reason text,
  p_eligible_recipient_count integer,
  p_subscribed_recipient_count integer,
  p_destination_count integer,
  p_send_attempt_count integer,
  p_success_count integer,
  p_failed_count integer,
  p_attempt_count integer,
  p_last_error text DEFAULT NULL,
  p_next_retry_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := now();
  v_final boolean;
BEGIN
  IF p_status NOT IN ('pending', 'retrying', 'success', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'Invalid Telegram driver event status: %', p_status;
  END IF;

  v_final := p_status IN ('success', 'failed', 'skipped');

  UPDATE public.telegram_event_queue
  SET notification_status = p_status,
      notification_reason = p_reason,
      notification_attempt_count = GREATEST(COALESCE(p_attempt_count, 0), 0),
      eligible_recipient_count = GREATEST(COALESCE(p_eligible_recipient_count, 0), 0),
      subscribed_recipient_count = GREATEST(COALESCE(p_subscribed_recipient_count, 0), 0),
      destination_count = GREATEST(COALESCE(p_destination_count, 0), 0),
      send_attempt_count = GREATEST(COALESCE(p_send_attempt_count, 0), 0),
      success_count = GREATEST(COALESCE(p_success_count, 0), 0),
      failed_count = GREATEST(COALESCE(p_failed_count, 0), 0),
      last_attempt_at = CASE WHEN p_status = 'pending' THEN NULL ELSE v_now END,
      next_retry_at = p_next_retry_at,
      processed = v_final,
      processed_at = CASE WHEN v_final THEN v_now ELSE NULL END
  WHERE id = p_event_id
    AND event_type IN ('driver_delivered', 'driver_failed');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Telegram driver event % was not found', p_event_id;
  END IF;

  UPDATE public.telegram_driver_event_audit
  SET status = p_status,
      reason = p_reason,
      eligible_recipient_count = GREATEST(COALESCE(p_eligible_recipient_count, 0), 0),
      subscribed_recipient_count = GREATEST(COALESCE(p_subscribed_recipient_count, 0), 0),
      destination_count = GREATEST(COALESCE(p_destination_count, 0), 0),
      send_attempt_count = GREATEST(COALESCE(p_send_attempt_count, 0), 0),
      success_count = GREATEST(COALESCE(p_success_count, 0), 0),
      failed_count = GREATEST(COALESCE(p_failed_count, 0), 0),
      attempt_count = GREATEST(COALESCE(p_attempt_count, 0), 0),
      last_error = p_last_error,
      last_attempt_at = CASE WHEN p_status = 'pending' THEN NULL ELSE v_now END,
      next_retry_at = p_next_retry_at,
      finalized_at = CASE WHEN v_final THEN v_now ELSE NULL END,
      updated_at = v_now
  WHERE event_id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Telegram driver audit row for event % was not found', p_event_id;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_telegram_driver_event_state(
  uuid, text, text, integer, integer, integer, integer, integer, integer, integer, text, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_telegram_driver_event_state(
  uuid, text, text, integer, integer, integer, integer, integer, integer, integer, text, timestamptz
) TO service_role;

COMMIT;
