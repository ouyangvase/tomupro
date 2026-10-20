-- Stop the Kitani points cron from building a failed request every minute.
-- The original job referenced Vault names that do not exist in production
-- (supabase_url and service_role_key). Keep the job only when both a due
-- event and a usable service key are present.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'send-kitani-points'
  LOOP
    PERFORM cron.alter_job(
      job_id := v_job_id,
      command := $cron$
        SELECT net.http_post(
          url := 'https://dtcchduronwsyunyakxj.supabase.co/functions/v1/send-kitani-points',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || COALESCE(
              NULLIF((
                SELECT decrypted_secret
                FROM vault.decrypted_secrets
                WHERE name = 'supabase_service_role_key'
                LIMIT 1
              ), ''),
              NULLIF((
                SELECT decrypted_secret
                FROM vault.decrypted_secrets
                WHERE name = 'tomupro_service_role_key'
                LIMIT 1
              ), '')
            )
          ),
          body := '{}'::jsonb
        )
        WHERE EXISTS (
          SELECT 1
          FROM public.kitani_point_events
          WHERE delivery_status = 'pending'
            AND next_retry_at <= now()
        )
        AND EXISTS (
          SELECT 1
          FROM vault.decrypted_secrets
          WHERE name IN ('supabase_service_role_key', 'tomupro_service_role_key')
            AND decrypted_secret IS NOT NULL
            AND decrypted_secret <> ''
        );
      $cron$
    );
  END LOOP;
END;
$$;
