-- Driver updates must not wait behind unrelated historical Telegram events.
-- Keep the existing general queue drain and add a focused driver drain.

CREATE OR REPLACE FUNCTION public.trigger_telegram_driver_event_drain()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_service_key text;
  v_event_type text;
BEGIN
  SELECT decrypted_secret
  INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_url'
  LIMIT 1;

  SELECT decrypted_secret
  INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_url IS NULL OR v_service_key IS NULL THEN
    RAISE WARNING 'trigger_telegram_driver_event_drain: vault secrets missing';
    RETURN;
  END IF;

  FOREACH v_event_type IN ARRAY ARRAY['driver_delivered', 'driver_failed']::text[] LOOP
    PERFORM net.http_post(
      url := v_url || '/functions/v1/send-telegram-event',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'event_type', v_event_type,
        'drain', true,
        'limit', 10,
        'trigger', 'driver-event-cron'
      )
    );
  END LOOP;
END;
$$;

SELECT cron.unschedule('process-telegram-driver-events')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-telegram-driver-events');

SELECT cron.schedule(
  'process-telegram-driver-events',
  '* * * * *',
  'SELECT public.trigger_telegram_driver_event_drain()'
);

