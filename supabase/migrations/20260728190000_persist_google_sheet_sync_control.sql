-- Persist the Google Sheet sync toggle and stop its cron job while disabled.
CREATE OR REPLACE FUNCTION public.set_google_sheet_sync_enabled(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_job_id bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can change Google Sheet sync settings';
  END IF;

  INSERT INTO public.integration_settings (
    integration_name,
    webhook_enabled,
    webhook_url,
    updated_at
  )
  VALUES ('google_sheet', p_enabled, '', now())
  ON CONFLICT (integration_name) DO UPDATE
  SET webhook_enabled = EXCLUDED.webhook_enabled,
      updated_at = EXCLUDED.updated_at;

  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'sync-google-sheet'
  LOOP
    PERFORM cron.alter_job(
      job_id := v_job_id,
      active := p_enabled
    );
  END LOOP;

  RETURN p_enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.set_google_sheet_sync_enabled(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_google_sheet_sync_enabled(boolean) TO authenticated;

INSERT INTO public.integration_settings (
  integration_name,
  webhook_enabled,
  webhook_url,
  updated_at
)
VALUES ('google_sheet', false, '', now())
ON CONFLICT (integration_name) DO UPDATE
SET webhook_enabled = false,
    updated_at = EXCLUDED.updated_at;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'sync-google-sheet'
  LOOP
    PERFORM cron.alter_job(
      job_id := v_job_id,
      active := false
    );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
