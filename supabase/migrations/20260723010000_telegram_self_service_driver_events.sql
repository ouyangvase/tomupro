-- Align Telegram settings, driver-event delivery, and PostgREST schema cache.
-- Fixes app writes to missing columns and prevents duplicate pending driver
-- delivered/failed Telegram events.

ALTER TABLE public.user_telegram_settings
  ADD COLUMN IF NOT EXISTS receive_failed_delivery boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS receive_delivered_order boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS receive_receipt_events boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS receive_delivery_events boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS receive_team_delivery_events boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receive_team_order_updates boolean NOT NULL DEFAULT false;

UPDATE public.user_telegram_settings
SET
  receive_team_order_updates = receive_team_order_updates OR receive_team_delivery_events,
  receive_team_delivery_events = receive_team_delivery_events OR receive_team_order_updates;

ALTER TABLE public.telegram_event_queue
  ADD COLUMN IF NOT EXISTS dedupe_key text;

UPDATE public.telegram_event_queue
SET dedupe_key = event_type || ':' || order_id::text
WHERE dedupe_key IS NULL
  AND event_type IN ('driver_delivered', 'driver_failed');

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY event_type, order_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.telegram_event_queue
  WHERE processed = false
    AND event_type IN ('driver_delivered', 'driver_failed')
)
UPDATE public.telegram_event_queue q
SET
  processed = true,
  metadata = coalesce(q.metadata, '{}'::jsonb)
    || jsonb_build_object('skipped_duplicate', true, 'skipped_at', now())
FROM ranked
WHERE q.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_event_queue_pending_driver_unique
  ON public.telegram_event_queue (event_type, order_id)
  WHERE processed = false
    AND event_type IN ('driver_delivered', 'driver_failed');

CREATE OR REPLACE FUNCTION public.queue_telegram_order_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type TEXT;
  v_metadata JSONB;
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
      DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_telegram_order_event ON public.orders;
CREATE TRIGGER trg_queue_telegram_order_event
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_telegram_order_event();

NOTIFY pgrst, 'reload schema';
