-- Automated daily Telegram report via pg_cron + pg_net
-- Runs every minute, checks if current Brunei time (UTC+8) matches the
-- configured daily_send_time in telegram_bot_settings. If it matches
-- (same hour and minute), fires the send-telegram-daily edge function.
-- Uses a dedup flag in telegram_bot_settings.metadata to prevent double-sends.

-- 1. Add metadata column for tracking last auto-send date
ALTER TABLE telegram_bot_settings
ADD COLUMN IF NOT EXISTS last_auto_send_date DATE;

-- 2. Create the check-and-fire function
CREATE OR REPLACE FUNCTION public.trigger_telegram_daily_report()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bot_enabled BOOLEAN;
  v_send_time TIME;
  v_last_send DATE;
  v_now_bn TIMESTAMPTZ;
  v_today_bn DATE;
  v_current_time_bn TIME;
  v_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Get bot settings
  SELECT bot_enabled, daily_send_time, last_auto_send_date
  INTO v_bot_enabled, v_send_time, v_last_send
  FROM telegram_bot_settings
  LIMIT 1;

  -- Exit if bot disabled or no send time configured
  IF v_bot_enabled IS NOT TRUE OR v_send_time IS NULL THEN
    RETURN;
  END IF;

  -- Current Brunei time (UTC+8)
  v_now_bn := NOW() AT TIME ZONE 'Asia/Brunei';
  v_today_bn := v_now_bn::DATE;
  v_current_time_bn := v_now_bn::TIME;

  -- Already sent today? Skip.
  IF v_last_send IS NOT NULL AND v_last_send = v_today_bn THEN
    RETURN;
  END IF;

  -- Check if current time (hour:minute) matches configured send time
  -- Allow a 2-minute window to account for cron timing jitter
  IF ABS(EXTRACT(EPOCH FROM (v_current_time_bn - v_send_time))) > 120 THEN
    -- Also check if we wrapped around midnight (e.g. 23:59 vs 00:01)
    IF ABS(EXTRACT(EPOCH FROM (v_current_time_bn - v_send_time))) < 86280 THEN
      RETURN;
    END IF;
  END IF;

  -- Mark as sent TODAY (before firing, to prevent race conditions)
  UPDATE telegram_bot_settings SET last_auto_send_date = v_today_bn;

  -- Get Supabase URL and service role key from vault
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;

  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF v_url IS NULL OR v_service_key IS NULL THEN
    RAISE WARNING 'trigger_telegram_daily_report: vault secrets not found';
    -- Roll back the date flag so it retries next minute
    UPDATE telegram_bot_settings SET last_auto_send_date = NULL;
    RETURN;
  END IF;

  -- Fire the edge function
  PERFORM net.http_post(
    url := v_url || '/functions/v1/send-telegram-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object('action', 'send_daily', 'trigger', 'cron')
  );

  RAISE LOG 'trigger_telegram_daily_report: fired at % (Brunei), send_time=%', v_current_time_bn, v_send_time;
END;
$$;

-- 3. Schedule the cron job: runs every minute to check if it's time to send
-- pg_cron runs in UTC; the function internally converts to Brunei time
SELECT cron.unschedule('telegram-daily-report')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'telegram-daily-report');

SELECT cron.schedule(
  'telegram-daily-report',
  '* * * * *',
  'SELECT public.trigger_telegram_daily_report()'
);
