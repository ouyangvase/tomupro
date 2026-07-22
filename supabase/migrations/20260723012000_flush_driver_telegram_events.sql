-- Fire the Telegram event sender immediately after driver delivered/failed
-- events are queued. pg_net sends after transaction commit, so driver status
-- updates are not blocked by Telegram delivery.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.queue_telegram_order_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type TEXT;
  v_metadata JSONB;
  v_inserted_event_id UUID;
  v_should_flush_driver_event BOOLEAN := false;
  v_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Receipt status changes.
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

  -- Runner status changes.
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

  -- Driver status changes go directly to the order owner and opted-in managers.
  IF OLD.driver_status IS DISTINCT FROM NEW.driver_status THEN
    v_event_type := NULL;
    v_inserted_event_id := NULL;

    IF NEW.driver_status = 'DRIVER_DELIVERED' THEN
      v_event_type := 'driver_delivered';
    ELSIF NEW.driver_status = 'DRIVER_FAILED' THEN
      v_event_type := 'driver_failed';
    END IF;

    IF v_event_type IS NOT NULL THEN
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
        'updated_at', NEW.updated_at
      );

      INSERT INTO public.telegram_event_queue (event_type, order_id, runner_id, metadata, dedupe_key)
      VALUES (v_event_type, NEW.id, NEW.runner_id, v_metadata, v_event_type || ':' || NEW.id::text)
      ON CONFLICT (event_type, order_id)
        WHERE processed = false
          AND event_type IN ('driver_delivered', 'driver_failed')
      DO NOTHING
      RETURNING id INTO v_inserted_event_id;

      IF v_inserted_event_id IS NOT NULL THEN
        v_should_flush_driver_event := true;
      END IF;
    END IF;
  END IF;

  IF v_should_flush_driver_event THEN
    SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url'
    LIMIT 1;

    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF v_url IS NOT NULL AND v_service_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_url || '/functions/v1/send-telegram-event',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'trigger', 'driver_status_update',
          'event_type', v_event_type,
          'order_id', NEW.id
        )
      );
    ELSE
      RAISE WARNING 'queue_telegram_order_event: vault secrets missing; driver Telegram event queued but not flushed immediately';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
