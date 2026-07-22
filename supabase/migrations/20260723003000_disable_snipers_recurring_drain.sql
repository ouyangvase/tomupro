-- Disable the recurring TOMUPRO -> SNIPERS backlog drain.
-- Direct per-order sends still work through send-snipers-delivered with an
-- orderId/eventId. Historical catch-up must be run as a targeted one-time task.

SELECT cron.unschedule('snipers-delivered-drain')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'snipers-delivered-drain');

CREATE OR REPLACE FUNCTION public.trigger_snipers_delivered_drain()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE LOG 'trigger_snipers_delivered_drain is disabled; use targeted snipers-backfill-delivered instead.';
END;
$$;
