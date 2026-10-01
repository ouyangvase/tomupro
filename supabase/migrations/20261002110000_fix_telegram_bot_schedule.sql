-- Keep the Telegram daily report schedule configurable from Admin settings.
-- The linked project had the settings table but not the deduplication column
-- or the minute-based cron gate from the original schedule migration.

ALTER TABLE public.telegram_bot_settings
  ADD COLUMN IF NOT EXISTS last_auto_send_date DATE;

CREATE OR REPLACE FUNCTION public.trigger_telegram_daily_report()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.telegram_bot_settings%ROWTYPE;
  v_now_bn TIMESTAMP;
  v_today_bn DATE;
  v_current_time_bn TIME;
  v_service_key TEXT;
  v_url TEXT := 'https://dtcchduronwsyunyakxj.supabase.co';
BEGIN
  SELECT * INTO v_settings
  FROM public.telegram_bot_settings
  LIMIT 1;

  IF v_settings.id IS NULL
     OR v_settings.bot_enabled IS NOT TRUE
     OR v_settings.daily_send_time IS NULL THEN
    RETURN;
  END IF;

  v_now_bn := now() AT TIME ZONE 'Asia/Brunei';
  v_today_bn := v_now_bn::DATE;
  v_current_time_bn := v_now_bn::TIME;

  IF ABS(EXTRACT(EPOCH FROM (v_current_time_bn - v_settings.daily_send_time))) > 120
     AND ABS(EXTRACT(EPOCH FROM (v_current_time_bn - v_settings.daily_send_time))) < 86280 THEN
    RETURN;
  END IF;

  -- Claim today's run atomically so adjacent cron ticks cannot duplicate it.
  UPDATE public.telegram_bot_settings
  SET last_auto_send_date = v_today_bn,
      updated_at = now()
  WHERE id = v_settings.id
    AND last_auto_send_date IS DISTINCT FROM v_today_bn;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_service_role_key'
  LIMIT 1;

  IF v_service_key IS NULL THEN
    UPDATE public.telegram_bot_settings
    SET last_auto_send_date = NULL,
        updated_at = now()
    WHERE id = v_settings.id;
    RAISE WARNING 'trigger_telegram_daily_report: service role secret not found';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/send-telegram-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object('action', 'send_daily', 'trigger', 'cron')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_telegram_daily_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_telegram_daily_report() TO service_role;

DO $$
DECLARE
  v_job RECORD;
BEGIN
  FOR v_job IN
    SELECT jobname
    FROM cron.job
    WHERE jobname IN ('telegram-daily-report', 'send-telegram-daily')
  LOOP
    PERFORM cron.unschedule(v_job.jobname);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'telegram-daily-report',
  '* * * * *',
  'SELECT public.trigger_telegram_daily_report()'
)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'telegram-daily-report'
);

NOTIFY pgrst, 'reload schema';
