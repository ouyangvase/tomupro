-- Reduce recurring database pressure and ensure zero-permission assistants
-- cannot retain runner data access.

DROP TRIGGER IF EXISTS orders_gsheet_sync ON public.orders;
DROP FUNCTION IF EXISTS public.notify_gsheet_sync();

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid FROM cron.job WHERE jobname = 'sync-google-sheet'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'sync-google-sheet',
  '*/5 * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://dtcchduronwsyunyakxj.supabase.co/functions/v1/sync-google-sheet',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'supabase_service_role_key'
          LIMIT 1
        )
      ),
      body := '{"trigger":"scheduled"}'::jsonb
    );
  $cron$
);

CREATE INDEX IF NOT EXISTS idx_gsheet_sync_logs_status_completed_at
  ON public.gsheet_sync_logs (status, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_runner_assistants_active_lookup
  ON public.runner_assistants (assistant_id, runner_id)
  WHERE is_active = true;

UPDATE public.gsheet_sync_logs
SET status = 'failed',
    error_message = 'Timed out before project health remediation',
    completed_at = now()
WHERE status = 'pending'
  AND created_at < now() - interval '10 minutes';

CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.driver_locations
  WHERE recorded_at < now() - interval '30 days';

  DELETE FROM public.audit_logs
  WHERE created_at < now() - interval '90 days';

  DELETE FROM public.notifications
  WHERE created_at < now() - interval '60 days'
    AND is_read = true;

  DELETE FROM public.gsheet_sync_logs
  WHERE created_at < now() - interval '30 days';
END;
$$;

DROP POLICY IF EXISTS "Runner assistant can view assigned runner orders" ON public.orders;
CREATE POLICY "Runner assistant can view assigned runner orders"
  ON public.orders FOR SELECT
  USING (
    public.has_runner_assistant_permission(auth.uid(), runner_id, 'deliver')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'confirm_receipt')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'driver_inbox')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'driver_stock')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'cash_settlement')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'driver_operations')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'stock_audit')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'inbound_stock')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'driver_workload')
  );

DROP POLICY IF EXISTS "Runner assistant can update assigned runner orders" ON public.orders;
CREATE POLICY "Runner assistant can update assigned runner orders"
  ON public.orders FOR UPDATE
  USING (
    public.has_runner_assistant_permission(auth.uid(), runner_id, 'deliver')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'confirm_receipt')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'driver_inbox')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'driver_operations')
  )
  WITH CHECK (
    public.has_runner_assistant_permission(auth.uid(), runner_id, 'deliver')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'confirm_receipt')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'driver_inbox')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'driver_operations')
  );

DROP POLICY IF EXISTS "Runner assistants can view runner audit logs" ON public.audit_logs;
CREATE POLICY "Runner assistants can view runner audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    actor_id = auth.uid()
    OR (
      entity_type = 'order'
      AND EXISTS (
        SELECT 1
        FROM public.orders order_row
        WHERE order_row.id = audit_logs.entity_id
          AND (
            public.has_runner_assistant_permission(auth.uid(), order_row.runner_id, 'deliver')
            OR public.has_runner_assistant_permission(auth.uid(), order_row.runner_id, 'confirm_receipt')
            OR public.has_runner_assistant_permission(auth.uid(), order_row.runner_id, 'driver_inbox')
            OR public.has_runner_assistant_permission(auth.uid(), order_row.runner_id, 'driver_operations')
          )
      )
    )
  );

DROP POLICY IF EXISTS runners_view_own_order_audit_logs ON public.audit_logs;
CREATE POLICY runners_view_own_order_audit_logs
  ON public.audit_logs FOR SELECT
  USING (
    entity_type = 'order'
    AND EXISTS (
      SELECT 1
      FROM public.orders order_row
      WHERE order_row.id = audit_logs.entity_id
        AND (
          order_row.runner_id = auth.uid()
          OR public.has_runner_assistant_permission(auth.uid(), order_row.runner_id, 'deliver')
          OR public.has_runner_assistant_permission(auth.uid(), order_row.runner_id, 'confirm_receipt')
          OR public.has_runner_assistant_permission(auth.uid(), order_row.runner_id, 'driver_inbox')
          OR public.has_runner_assistant_permission(auth.uid(), order_row.runner_id, 'driver_operations')
        )
    )
  );

NOTIFY pgrst, 'reload schema';
