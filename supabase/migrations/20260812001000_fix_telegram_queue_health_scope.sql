BEGIN;

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
  WHERE (
    q.notification_status IN ('pending', 'processing', 'retrying')
    AND q.processed = false
  ) OR (
    q.notification_status IN ('success', 'failed', 'skipped')
    AND q.processed = true
  )
  GROUP BY q.notification_status
  ORDER BY q.notification_status;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_telegram_queue_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_telegram_queue_health() TO authenticated, service_role;

COMMIT;
