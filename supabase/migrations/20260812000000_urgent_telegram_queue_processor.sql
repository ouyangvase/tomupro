BEGIN;

ALTER TABLE public.telegram_event_queue
  ADD COLUMN IF NOT EXISTS processor_run_id uuid,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS processor_last_error text;

ALTER TABLE public.telegram_event_queue
  DROP CONSTRAINT IF EXISTS telegram_event_queue_notification_status_check;

ALTER TABLE public.telegram_event_queue
  ADD CONSTRAINT telegram_event_queue_notification_status_check
  CHECK (notification_status IN ('pending', 'processing', 'retrying', 'success', 'failed', 'skipped'));

ALTER TABLE public.telegram_driver_event_audit
  DROP CONSTRAINT IF EXISTS telegram_driver_event_audit_status_check;

ALTER TABLE public.telegram_driver_event_audit
  ADD CONSTRAINT telegram_driver_event_audit_status_check
  CHECK (status IN ('pending', 'processing', 'retrying', 'success', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_telegram_event_queue_processor_claim
  ON public.telegram_event_queue (notification_status, next_retry_at, created_at)
  WHERE processed = false;

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
    RAISE WARNING 'invoke_telegram_event_processor: Supabase URL or service key is missing';
    RETURN NULL;
  END IF;

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

  RETURN v_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.invoke_telegram_event_processor(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_telegram_event_processor(uuid, text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_telegram_driver_event_drain()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  PERFORM public.invoke_telegram_event_processor(NULL, 'driver-event-cron', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.trigger_telegram_driver_event_drain() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_telegram_driver_event_drain() TO service_role;

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
    source_function, submitted_at, actor_id, event_created_at, metadata
  )
  VALUES (
    v_event.id, v_event.order_id,
    COALESCE(v_event.metadata->>'order_code', v_event.metadata->>'order_ref'),
    v_event.event_type, v_event.runner_id, v_event.delivery_attempt_id,
    v_event.active_assignment_id, v_event.driver_id, v_event.event_source,
    v_event.source_function, v_event.submitted_at, v_event.driver_id,
    v_event.created_at, COALESCE(v_event.metadata, '{}'::jsonb)
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

CREATE OR REPLACE FUNCTION public.get_telegram_queue_health()
RETURNS TABLE(
  status text,
  event_count bigint,
  oldest_at timestamptz,
  oldest_age_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role')
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only administrators can read Telegram queue health';
  END IF;

  RETURN QUERY
  SELECT q.notification_status,
         count(*)::bigint,
         min(q.created_at),
         GREATEST(0, EXTRACT(EPOCH FROM (clock_timestamp() - min(q.created_at)))::integer)
  FROM public.telegram_event_queue q
  GROUP BY q.notification_status
  ORDER BY q.notification_status;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_telegram_queue_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_telegram_queue_health() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enqueue_telegram_driver_event_processor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.event_type IN ('driver_delivered', 'driver_failed')
     AND NEW.delivery_attempt_id IS NOT NULL
     AND NEW.event_source = 'DRIVER_APP'
     AND NEW.source_function = 'public.submit_driver_delivery_result'
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

DO $function$
BEGIN
  BEGIN
    PERFORM cron.unschedule('process-telegram-driver-events');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  PERFORM cron.schedule(
    'process-telegram-driver-events',
    '* * * * *',
    'SELECT public.trigger_telegram_driver_event_drain()'
  );

  BEGIN
    PERFORM cron.unschedule('process-telegram-events');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  PERFORM cron.schedule(
    'process-telegram-events',
    '*/2 * * * *',
    'SELECT public.invoke_telegram_event_processor(NULL, ''generic-cron'', false)'
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
