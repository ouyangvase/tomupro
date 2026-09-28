BEGIN;

ALTER TABLE public.telegram_event_queue
  ADD COLUMN IF NOT EXISTS driver_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS event_created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS processor_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS immediate_invoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS immediate_invocation_request_id bigint,
  ADD COLUMN IF NOT EXISTS immediate_invocation_error text,
  ADD COLUMN IF NOT EXISTS delayed_processing_alerted_at timestamptz;

ALTER TABLE public.telegram_driver_event_audit
  ADD COLUMN IF NOT EXISTS driver_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS processor_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_success_at timestamptz;

ALTER TABLE public.telegram_notification_logs
  ADD COLUMN IF NOT EXISTS attempted_at timestamptz;

UPDATE public.telegram_event_queue
SET driver_submitted_at = COALESCE(driver_submitted_at, submitted_at),
    event_created_at = created_at;

UPDATE public.telegram_driver_event_audit
SET driver_submitted_at = COALESCE(driver_submitted_at, submitted_at),
    processor_started_at = COALESCE(processor_started_at, last_attempt_at),
    telegram_attempt_at = CASE
      WHEN send_attempt_count > 0 THEN COALESCE(telegram_attempt_at, last_attempt_at)
      ELSE telegram_attempt_at
    END,
    telegram_success_at = CASE
      WHEN status = 'success' AND success_count > 0 THEN COALESCE(telegram_success_at, finalized_at, last_attempt_at)
      ELSE telegram_success_at
    END
WHERE driver_submitted_at IS NULL
   OR processor_started_at IS NULL
   OR (send_attempt_count > 0 AND telegram_attempt_at IS NULL)
   OR (status = 'success' AND success_count > 0 AND telegram_success_at IS NULL);

UPDATE public.telegram_event_queue q
SET processor_started_at = COALESCE(q.processor_started_at, a.processor_started_at, a.last_attempt_at),
    event_created_at = q.created_at,
    telegram_attempt_at = CASE WHEN a.send_attempt_count > 0 THEN COALESCE(q.telegram_attempt_at, a.telegram_attempt_at) ELSE NULL END,
    telegram_success_at = CASE
      WHEN a.status = 'success' AND a.success_count > 0 THEN COALESCE(q.telegram_success_at, a.telegram_success_at)
      ELSE NULL
    END
FROM public.telegram_driver_event_audit a
WHERE a.event_id = q.id
  AND q.event_type IN ('driver_delivered', 'driver_failed');

CREATE INDEX IF NOT EXISTS idx_telegram_event_queue_watchdog
  ON public.telegram_event_queue (created_at, notification_status)
  WHERE processed = false
    AND notification_status IN ('pending', 'retrying');

CREATE OR REPLACE FUNCTION public.record_telegram_immediate_processor_failure(
  p_event_id uuid,
  p_error text,
  p_failed_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  UPDATE public.telegram_event_queue
  SET driver_submitted_at = COALESCE(driver_submitted_at, submitted_at),
      event_created_at = created_at,
      immediate_invoked_at = p_failed_at,
      immediate_invocation_error = left(COALESCE(p_error, 'Unknown immediate processor failure'), 2000),
      notification_status = CASE
        WHEN notification_status = 'processing' THEN 'retrying'
        WHEN notification_status IN ('success', 'failed', 'skipped') THEN notification_status
        ELSE 'pending'
      END,
      notification_reason = 'IMMEDIATE_PROCESSOR_INVOKE_FAILED',
      next_retry_at = p_failed_at,
      processed = CASE WHEN notification_status IN ('success', 'failed', 'skipped') THEN processed ELSE false END,
      processor_last_error = left(COALESCE(p_error, 'Unknown immediate processor failure'), 2000)
  WHERE id = p_event_id
    AND processed = false;

  UPDATE public.telegram_driver_event_audit
  SET driver_submitted_at = COALESCE(driver_submitted_at, submitted_at),
      reason = 'IMMEDIATE_PROCESSOR_INVOKE_FAILED',
      last_error = left(COALESCE(p_error, 'Unknown immediate processor failure'), 2000),
      updated_at = p_failed_at
  WHERE event_id = p_event_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not persist IMMEDIATE_PROCESSOR_INVOKE_FAILED for event %: %', p_event_id, SQLERRM;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_telegram_immediate_processor_failure(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_telegram_immediate_processor_failure(uuid, text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_telegram_event_processor(
  p_event_id uuid DEFAULT NULL,
  p_trigger text DEFAULT 'telegram-event',
  p_driver_only boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_url text;
  v_service_key text;
  v_request_id bigint;
  v_now timestamptz := clock_timestamp();
  v_error text;
BEGIN
  v_url := COALESCE(
    NULLIF((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1), ''),
    NULLIF(current_setting('app.settings.supabase_url', true), ''),
    'https://dtcchduronwsyunyakxj.supabase.co'
  );

  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'tomupro_service_role_key'
  LIMIT 1;

  IF v_service_key IS NULL THEN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_service_role_key'
    LIMIT 1;
  END IF;

  IF v_service_key IS NULL THEN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  END IF;

  IF v_url IS NULL OR v_service_key IS NULL THEN
    v_error := 'Supabase URL or service key is missing';
    RAISE WARNING 'IMMEDIATE_PROCESSOR_INVOKE_FAILED event_id=% error=% timestamp=%', p_event_id, v_error, v_now;
    IF p_event_id IS NOT NULL THEN
      PERFORM public.record_telegram_immediate_processor_failure(p_event_id, v_error, v_now);
    END IF;
    RETURN NULL;
  END IF;

  BEGIN
    SELECT net.http_post(
      url := v_url || '/functions/v1/send-telegram-event',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_strip_nulls(jsonb_build_object(
        'event_id', p_event_id,
        'drain', true,
        'driver_only', p_driver_only,
        'limit', CASE WHEN p_driver_only THEN 25 ELSE 10 END,
        'trigger', p_trigger
      ))
    ) INTO v_request_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    RAISE WARNING 'IMMEDIATE_PROCESSOR_INVOKE_FAILED event_id=% error=% timestamp=%', p_event_id, v_error, v_now;
    IF p_event_id IS NOT NULL THEN
      PERFORM public.record_telegram_immediate_processor_failure(p_event_id, v_error, v_now);
    END IF;
    RETURN NULL;
  END;

  IF p_event_id IS NOT NULL THEN
    BEGIN
      UPDATE public.telegram_event_queue
      SET driver_submitted_at = COALESCE(driver_submitted_at, submitted_at),
          event_created_at = created_at,
          immediate_invoked_at = v_now,
          immediate_invocation_request_id = v_request_id,
          immediate_invocation_error = NULL,
          notification_reason = CASE
            WHEN notification_status IN ('pending', 'retrying') THEN 'immediate_processor_invoked'
            ELSE notification_reason
          END
      WHERE id = p_event_id
        AND processed = false;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not persist immediate processor request for event %: %', p_event_id, SQLERRM;
    END;
  END IF;

  RETURN v_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.invoke_telegram_event_processor(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_telegram_event_processor(uuid, text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.watchdog_telegram_event_queue()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_event record;
  v_count bigint := 0;
  v_reason text;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'Only the server-side Telegram worker can run the queue watchdog';
  END IF;

  FOR v_event IN
    SELECT q.id, q.created_at
    FROM public.telegram_event_queue q
    WHERE q.processed = false
      AND q.notification_status IN ('pending', 'retrying')
      AND (q.notification_status = 'pending' OR q.next_retry_at IS NULL OR q.next_retry_at <= v_now)
      AND q.created_at <= v_now - interval '30 seconds'
      AND (
        q.delayed_processing_alerted_at IS NULL
        OR q.delayed_processing_alerted_at <= v_now - interval '5 minutes'
      )
    ORDER BY q.created_at, q.id
    FOR UPDATE SKIP LOCKED
  LOOP
    v_reason := CASE
      WHEN v_event.created_at <= v_now - interval '2 minutes' THEN 'DELAYED_PROCESSING_OVER_2_MINUTES'
      ELSE 'DELAYED_PROCESSING'
    END;

    UPDATE public.telegram_event_queue
    SET notification_reason = v_reason,
        delayed_processing_alerted_at = v_now,
        processor_last_error = format('%s: event created at %s', v_reason, v_event.created_at)
    WHERE id = v_event.id;

    UPDATE public.telegram_driver_event_audit
    SET reason = v_reason,
        last_error = format('%s: event created at %s', v_reason, v_event.created_at),
        updated_at = v_now
    WHERE event_id = v_event.id;

    IF v_reason = 'DELAYED_PROCESSING_OVER_2_MINUTES' THEN
      RAISE WARNING 'DELAYED_PROCESSING operational alert event_id=% created_at=% now=%', v_event.id, v_event.created_at, v_now;
    ELSE
      RAISE WARNING 'DELAYED_PROCESSING event_id=% created_at=% now=%', v_event.id, v_event.created_at, v_now;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.watchdog_telegram_event_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.watchdog_telegram_event_queue() TO service_role;

CREATE OR REPLACE FUNCTION public.claim_telegram_event_batch(
  p_limit integer DEFAULT 25,
  p_event_type text DEFAULT NULL,
  p_event_id uuid DEFAULT NULL,
  p_driver_only boolean DEFAULT false,
  p_order_id uuid DEFAULT NULL,
  p_event_ids uuid[] DEFAULT NULL
)
RETURNS SETOF public.telegram_event_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_run_id uuid := gen_random_uuid();
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 25), 100));
BEGIN
  IF current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'Only the server-side Telegram worker can claim queue events';
  END IF;

  UPDATE public.telegram_event_queue
  SET notification_status = 'retrying',
      notification_reason = 'processor_lease_expired',
      next_retry_at = v_now,
      processed = false,
      processing_lease_until = NULL,
      processing_started_at = NULL,
      processor_run_id = NULL,
      processor_last_error = 'The previous worker lease expired before finalization'
  WHERE processed = false
    AND notification_status = 'processing'
    AND COALESCE(processing_lease_until, processing_started_at + interval '5 minutes') <= v_now;

  RETURN QUERY
  WITH candidates AS (
    SELECT q.id
    FROM public.telegram_event_queue q
    WHERE q.processed = false
      AND q.notification_status IN ('pending', 'retrying')
      AND (q.next_retry_at IS NULL OR q.next_retry_at <= v_now)
      AND (p_event_type IS NULL OR q.event_type = p_event_type)
      AND (p_event_id IS NULL OR q.id = p_event_id)
      AND (p_order_id IS NULL OR q.order_id = p_order_id)
      AND (p_event_ids IS NULL OR q.id = ANY(p_event_ids))
      AND (NOT p_driver_only OR q.event_type IN ('driver_delivered', 'driver_failed'))
    ORDER BY q.created_at, q.id
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  ), claimed AS (
    UPDATE public.telegram_event_queue q
    SET notification_status = 'processing',
        notification_reason = 'processor_claimed',
        notification_attempt_count = COALESCE(q.notification_attempt_count, 0) + 1,
        last_attempt_at = v_now,
        processing_started_at = v_now,
        processor_started_at = COALESCE(q.processor_started_at, v_now),
        processing_lease_until = v_now + interval '5 minutes',
        processor_run_id = v_run_id,
        processor_last_error = NULL
    FROM candidates c
    WHERE q.id = c.id
    RETURNING q.*
  )
  SELECT * FROM claimed ORDER BY created_at, id;

  UPDATE public.telegram_driver_event_audit a
  SET status = 'processing',
      reason = 'processor_claimed',
      processor_started_at = COALESCE(a.processor_started_at, v_now),
      updated_at = v_now
  WHERE a.event_id IN (
    SELECT q.id
    FROM public.telegram_event_queue q
    WHERE q.processor_run_id = v_run_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_telegram_event_batch(integer, text, uuid, boolean, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_telegram_event_batch(integer, text, uuid, boolean, uuid, uuid[]) TO service_role;

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
  v_now timestamptz := clock_timestamp();
  v_final boolean;
  v_event public.telegram_event_queue%ROWTYPE;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'Only the server-side Telegram worker can update driver event state';
  END IF;

  IF p_status NOT IN ('pending', 'processing', 'retrying', 'success', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'Invalid Telegram driver event status: %', p_status;
  END IF;

  SELECT * INTO v_event
  FROM public.telegram_event_queue
  WHERE id = p_event_id
    AND event_type IN ('driver_delivered', 'driver_failed')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Telegram driver event % was not found', p_event_id;
  END IF;

  INSERT INTO public.telegram_driver_event_audit (
    event_id, order_id, order_ref, event_type, runner_id,
    delivery_attempt_id, active_assignment_id, driver_id, event_source,
    source_function, submitted_at, driver_submitted_at, actor_id,
    event_created_at, processor_started_at, telegram_attempt_at,
    telegram_success_at, metadata
  )
  VALUES (
    v_event.id, v_event.order_id,
    COALESCE(v_event.metadata->>'order_code', v_event.metadata->>'order_ref'),
    v_event.event_type, v_event.runner_id, v_event.delivery_attempt_id,
    v_event.active_assignment_id, v_event.driver_id, v_event.event_source,
    v_event.source_function, v_event.submitted_at,
    COALESCE(v_event.driver_submitted_at, v_event.submitted_at),
    v_event.driver_id, COALESCE(v_event.event_created_at, v_event.created_at),
    COALESCE(v_event.processor_started_at, v_event.processing_started_at),
    v_event.telegram_attempt_at, v_event.telegram_success_at,
    COALESCE(v_event.metadata, '{}'::jsonb)
  )
  ON CONFLICT (event_id) DO NOTHING;

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
      driver_submitted_at = COALESCE(driver_submitted_at, submitted_at),
      event_created_at = created_at,
      processor_started_at = COALESCE(processor_started_at, processing_started_at, created_at),
      telegram_attempt_at = CASE
        WHEN COALESCE(p_send_attempt_count, 0) > 0 THEN COALESCE(telegram_attempt_at, v_now)
        ELSE telegram_attempt_at
      END,
      telegram_success_at = CASE
        WHEN p_status = 'success' AND COALESCE(p_success_count, 0) > 0 THEN COALESCE(telegram_success_at, v_now)
        ELSE telegram_success_at
      END,
      last_attempt_at = CASE WHEN p_status IN ('pending', 'processing') THEN last_attempt_at ELSE v_now END,
      next_retry_at = p_next_retry_at,
      processed = v_final,
      processed_at = CASE WHEN v_final THEN v_now ELSE NULL END,
      processing_started_at = CASE WHEN v_final OR p_status IN ('pending', 'retrying') THEN NULL ELSE processing_started_at END,
      processing_lease_until = CASE WHEN v_final OR p_status IN ('pending', 'retrying') THEN NULL ELSE processing_lease_until END,
      processor_run_id = CASE WHEN v_final OR p_status IN ('pending', 'retrying') THEN NULL ELSE processor_run_id END,
      processor_last_error = CASE WHEN p_status = 'retrying' THEN p_last_error ELSE NULL END
  WHERE id = p_event_id;

  UPDATE public.telegram_driver_event_audit
  SET status = p_status,
      reason = p_reason,
      driver_submitted_at = COALESCE(driver_submitted_at, v_event.driver_submitted_at, v_event.submitted_at),
      processor_started_at = COALESCE(processor_started_at, v_event.processor_started_at, v_event.processing_started_at, v_now),
      telegram_attempt_at = CASE
        WHEN COALESCE(p_send_attempt_count, 0) > 0 THEN COALESCE(telegram_attempt_at, v_event.telegram_attempt_at, v_now)
        ELSE telegram_attempt_at
      END,
      telegram_success_at = CASE
        WHEN p_status = 'success' AND COALESCE(p_success_count, 0) > 0 THEN COALESCE(telegram_success_at, v_event.telegram_success_at, v_now)
        ELSE telegram_success_at
      END,
      eligible_recipient_count = GREATEST(COALESCE(p_eligible_recipient_count, 0), 0),
      subscribed_recipient_count = GREATEST(COALESCE(p_subscribed_recipient_count, 0), 0),
      destination_count = GREATEST(COALESCE(p_destination_count, 0), 0),
      send_attempt_count = GREATEST(COALESCE(p_send_attempt_count, 0), 0),
      success_count = GREATEST(COALESCE(p_success_count, 0), 0),
      failed_count = GREATEST(COALESCE(p_failed_count, 0), 0),
      attempt_count = GREATEST(COALESCE(p_attempt_count, 0), 0),
      last_error = p_last_error,
      last_attempt_at = CASE WHEN p_status IN ('pending', 'processing') THEN last_attempt_at ELSE v_now END,
      next_retry_at = p_next_retry_at,
      finalized_at = CASE WHEN v_final THEN v_now ELSE NULL END,
      updated_at = v_now
  WHERE event_id = p_event_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_telegram_driver_event_state(
  uuid, text, text, integer, integer, integer, integer, integer, integer, integer, text, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_telegram_driver_event_state(
  uuid, text, text, integer, integer, integer, integer, integer, integer, integer, text, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_telegram_driver_event_processor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  UPDATE public.telegram_event_queue
  SET driver_submitted_at = COALESCE(driver_submitted_at, NEW.submitted_at),
      event_created_at = NEW.created_at
  WHERE id = NEW.id;

  IF NEW.event_type IN ('driver_delivered', 'driver_failed')
     AND NEW.delivery_attempt_id IS NOT NULL
     AND NEW.event_source = 'DRIVER_APP'
     AND NEW.source_function = 'public.submit_driver_delivery_result'
  THEN
    PERFORM public.invoke_telegram_event_processor(NEW.id, 'driver-event-insert', true);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.record_telegram_immediate_processor_failure(
    NEW.id,
    SQLERRM,
    clock_timestamp()
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_telegram_driver_event_processor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_telegram_driver_event_processor() TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_telegram_driver_event_drain()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  BEGIN
    PERFORM public.watchdog_telegram_event_queue();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Telegram queue watchdog failed: %', SQLERRM;
  END;

  PERFORM public.invoke_telegram_event_processor(NULL, 'driver-event-cron', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.trigger_telegram_driver_event_drain() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_telegram_driver_event_drain() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
