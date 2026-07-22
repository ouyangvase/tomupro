-- Keep TOMUPRO -> SNIPERS delivery draining bounded and non-overlapping.
-- The Edge Function calls this RPC to claim due events with row locks before
-- sending them, preventing concurrent invocations from processing the same row.

CREATE OR REPLACE FUNCTION public.claim_snipers_delivery_events(
  p_limit integer DEFAULT 1
)
RETURNS SETOF public.snipers_delivery_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
  SET
    delivery_status = 'sending',
    last_attempt_at = now(),
    updated_at = now()
  FROM due
  WHERE e.event_id = due.event_id
  RETURNING e.*;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_snipers_events_due_queue
  ON public.snipers_delivery_events (next_retry_at, created_at, event_id)
  WHERE delivery_status IN ('pending', 'failed') AND attempt_count < 8;

SELECT cron.unschedule('snipers-delivered-drain')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'snipers-delivered-drain');

-- Recurring SNIPERS backlog drains were disabled after causing production load.
-- This migration intentionally keeps only the safe claim RPC and unschedules any
-- previous drain job. Targeted admin pushes process selected events through the
-- Edge Function/API without a database backlog loop.
