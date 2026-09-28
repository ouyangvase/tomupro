BEGIN;

-- Only the canonical Driver submission RPC may create Driver Telegram events.
-- Older versions of this trigger also inferred Driver events from any order
-- update, which produced unproven queue rows that the sender correctly skipped.
CREATE OR REPLACE FUNCTION public.queue_telegram_order_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_event_type text;
  v_metadata jsonb;
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

  RETURN NEW;
END;
$function$;

-- Some deployments contained canonical Driver metadata before the provenance
-- columns were added. Restore only rows that carry the complete canonical
-- marker; rows without it remain un-sendable by design.
UPDATE public.telegram_event_queue q
SET delivery_attempt_id = COALESCE(q.delivery_attempt_id, CASE
      WHEN q.metadata->>'delivery_attempt_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN (q.metadata->>'delivery_attempt_id')::uuid
    END),
    active_assignment_id = COALESCE(q.active_assignment_id, CASE
      WHEN q.metadata->>'active_assignment_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN (q.metadata->>'active_assignment_id')::uuid
    END),
    driver_id = COALESCE(q.driver_id, CASE
      WHEN q.metadata->>'driver_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN (q.metadata->>'driver_id')::uuid
    END),
    event_source = COALESCE(q.event_source, q.metadata->>'event_source'),
    source_function = COALESCE(q.source_function, q.metadata->>'source_function'),
    submitted_at = COALESCE(q.submitted_at, CASE
      WHEN pg_input_is_valid(q.metadata->>'submitted_at', 'timestamptz'::regtype)
      THEN (q.metadata->>'submitted_at')::timestamptz
    END)
WHERE q.event_type IN ('driver_delivered', 'driver_failed')
  AND q.metadata->>'event_source' = 'DRIVER_APP'
  AND q.metadata->>'source_function' = 'public.submit_driver_delivery_result'
  AND q.metadata->>'delivery_attempt_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND q.metadata->>'active_assignment_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND q.metadata->>'driver_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND q.metadata->>'submitted_at' IS NOT NULL
  AND pg_input_is_valid(q.metadata->>'submitted_at', 'timestamptz'::regtype);

-- Re-open only canonical events that were previously skipped for missing or
-- wrong provenance, so the worker can deliver them after the backfill above.
UPDATE public.telegram_event_queue
SET processed = false,
    processed_at = NULL,
    notification_status = 'pending',
    notification_reason = 'canonical_driver_provenance_repaired',
    next_retry_at = NULL,
    processing_started_at = NULL,
    processing_lease_until = NULL,
    processor_run_id = NULL,
    processor_last_error = NULL
WHERE event_type IN ('driver_delivered', 'driver_failed')
  AND processed = true
  AND notification_reason LIKE 'SKIPPED_INVALID_SOURCE%'
  AND event_source = 'DRIVER_APP'
  AND source_function = 'public.submit_driver_delivery_result'
  AND delivery_attempt_id IS NOT NULL
  AND active_assignment_id IS NOT NULL
  AND driver_id IS NOT NULL
  AND submitted_at IS NOT NULL;

-- Keep the immediate path restricted to canonical Driver submissions. The
-- cron watchdog remains the durable fallback when pg_net is temporarily down.
CREATE OR REPLACE FUNCTION public.enqueue_telegram_driver_event_processor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.event_type IN ('driver_delivered', 'driver_failed')
     AND NEW.delivery_attempt_id IS NOT NULL
     AND NEW.active_assignment_id IS NOT NULL
     AND NEW.driver_id IS NOT NULL
     AND NEW.event_source = 'DRIVER_APP'
     AND NEW.source_function = 'public.submit_driver_delivery_result'
     AND NEW.submitted_at IS NOT NULL
  THEN
    PERFORM public.invoke_telegram_event_processor(NEW.id, 'driver-event-insert', true);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_invoke_telegram_driver_event_processor ON public.telegram_event_queue;
CREATE TRIGGER trg_invoke_telegram_driver_event_processor
  AFTER INSERT ON public.telegram_event_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_telegram_driver_event_processor();

NOTIFY pgrst, 'reload schema';

COMMIT;
