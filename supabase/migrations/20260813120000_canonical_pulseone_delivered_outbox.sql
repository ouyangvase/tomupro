-- Keep Pulse One delivery canonical: only runner_status = DELIVERED enters
-- snipers_delivery_events; this migration only repairs the receiver config and
-- restores a bounded, row-locked outbox drain.

-- Preserve the existing receiver secret. The legacy sender reads
-- webhook_enabled, so disable that path while the durable outbox sender uses
-- the same stored secret and the real receiver URL.
UPDATE public.integration_settings
SET webhook_url = 'https://vegwxtqfrltghvtgocqd.supabase.co/functions/v1/tomupro-webhook',
    webhook_enabled = false,
    updated_at = now()
WHERE integration_name = 'pulseone'
  AND NULLIF(shared_secret, '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trigger_snipers_delivered_drain()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_service_key text;
  v_trigger_secret text;
BEGIN
  v_url := COALESCE(
    NULLIF((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1), ''),
    NULLIF(current_setting('app.settings.supabase_url', true), ''),
    'https://dtcchduronwsyunyakxj.supabase.co'
  );

  SELECT decrypted_secret
  INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'tomupro_service_role_key'
  LIMIT 1;

  IF v_service_key IS NULL THEN
    SELECT decrypted_secret
    INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_service_role_key'
    LIMIT 1;
  END IF;

  SELECT decrypted_secret
  INTO v_trigger_secret
  FROM vault.decrypted_secrets
  WHERE name = 'tomupro_delivered_function_secret'
  LIMIT 1;

  IF v_service_key IS NULL THEN
    SELECT decrypted_secret
    INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  END IF;

  IF NULLIF(v_url, '') IS NULL OR NULLIF(v_service_key, '') IS NULL THEN
    RAISE WARNING 'trigger_snipers_delivered_drain: Supabase URL or service key missing';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/send-snipers-delivered',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key,
      'X-TOMUPRO-DELIVERY-TRIGGER-SECRET', v_trigger_secret
    ),
    body := jsonb_build_object(
      'drain', true,
      'limit', 25,
      'maxBatches', 1,
      'maxEvents', 25,
      'trigger', 'snipers-delivered-cron'
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_snipers_delivery_events(
  p_limit integer DEFAULT 1
)
RETURNS SETOF public.snipers_delivery_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.snipers_delivery_events
  SET delivery_status = 'failed',
      next_retry_at = now(),
      last_error = COALESCE(last_error, 'Recovered stale SNIPERS delivery claim'),
      updated_at = now()
  WHERE delivery_status = 'sending'
    AND last_attempt_at < now() - interval '10 minutes'
    AND attempt_count < 8;

  RETURN QUERY
  WITH due AS (
    SELECT event_id
    FROM public.snipers_delivery_events
    WHERE delivery_status IN ('pending', 'failed')
      AND (next_retry_at IS NULL OR next_retry_at <= now())
      AND attempt_count < 8
    ORDER BY created_at ASC, event_id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 5)
  )
  UPDATE public.snipers_delivery_events e
  SET delivery_status = 'sending',
      last_attempt_at = now(),
      updated_at = now()
  FROM due
  WHERE e.event_id = due.event_id
  RETURNING e.*;
END;
$$;

SELECT cron.unschedule('snipers-delivered-drain')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'snipers-delivered-drain');

SELECT cron.schedule(
  'snipers-delivered-drain',
  '* * * * *',
  'SELECT public.trigger_snipers_delivered_drain()'
);

NOTIFY pgrst, 'reload schema';
