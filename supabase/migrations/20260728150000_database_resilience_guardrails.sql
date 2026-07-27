-- Reduce repeated RLS lookups and recurring background load on the Small
-- production database without changing Runner Assistant access semantics.

CREATE OR REPLACE FUNCTION public.has_any_runner_assistant_permission(
  p_assistant_id uuid,
  p_runner_id uuid,
  p_permissions text[]
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.runner_assistants ra
    WHERE ra.assistant_id = p_assistant_id
      AND ra.runner_id = p_runner_id
      AND ra.is_active = true
      AND (
        (ra.can_manage_cash_settlement AND 'cash_settlement' = ANY (p_permissions))
        OR (ra.can_manage_driver_operations AND 'driver_operations' = ANY (p_permissions))
        OR (ra.can_view_stock_audit AND 'stock_audit' = ANY (p_permissions))
        OR (ra.can_manage_inbound_stock AND 'inbound_stock' = ANY (p_permissions))
        OR (ra.can_view_driver_workload AND 'driver_workload' = ANY (p_permissions))
        OR (ra.can_manage_driver_inbox AND 'driver_inbox' = ANY (p_permissions))
        OR (ra.can_manage_driver_stock AND 'driver_stock' = ANY (p_permissions))
        OR (ra.can_deliver AND 'deliver' = ANY (p_permissions))
        OR (ra.can_confirm_receipt AND 'confirm_receipt' = ANY (p_permissions))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_any_runner_assistant_permission(uuid, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_any_runner_assistant_permission(uuid, uuid, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_runner_assistant_runner_ids(
  p_assistant_id uuid,
  p_permissions text[]
)
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(ra.runner_id), ARRAY[]::uuid[])
  FROM public.runner_assistants ra
  WHERE ra.assistant_id = p_assistant_id
    AND ra.is_active = true
    AND (
      (ra.can_manage_cash_settlement AND 'cash_settlement' = ANY (p_permissions))
      OR (ra.can_manage_driver_operations AND 'driver_operations' = ANY (p_permissions))
      OR (ra.can_view_stock_audit AND 'stock_audit' = ANY (p_permissions))
      OR (ra.can_manage_inbound_stock AND 'inbound_stock' = ANY (p_permissions))
      OR (ra.can_view_driver_workload AND 'driver_workload' = ANY (p_permissions))
      OR (ra.can_manage_driver_inbox AND 'driver_inbox' = ANY (p_permissions))
      OR (ra.can_manage_driver_stock AND 'driver_stock' = ANY (p_permissions))
      OR (ra.can_deliver AND 'deliver' = ANY (p_permissions))
      OR (ra.can_confirm_receipt AND 'confirm_receipt' = ANY (p_permissions))
    );
$$;

REVOKE ALL ON FUNCTION public.get_runner_assistant_runner_ids(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_runner_assistant_runner_ids(uuid, text[]) TO authenticated;

DROP POLICY IF EXISTS "Runner assistants can view bound runner drivers"
  ON public.runner_drivers;

CREATE POLICY "Runner assistants can view bound runner drivers"
  ON public.runner_drivers
  FOR SELECT
  USING (
    runner_id = ANY (
      COALESCE(
        (
          SELECT public.get_runner_assistant_runner_ids(
            (SELECT auth.uid()),
            ARRAY[
              'driver_inbox',
              'driver_stock',
              'driver_operations',
              'driver_workload',
              'cash_settlement'
            ]::text[]
          )
        ),
        ARRAY[]::uuid[]
      )
    )
  );

DROP POLICY IF EXISTS "Runner assistant can view assigned runner orders"
  ON public.orders;

CREATE POLICY "Runner assistant can view assigned runner orders"
  ON public.orders
  FOR SELECT
  USING (
    runner_id = ANY (
      COALESCE(
        (
          SELECT public.get_runner_assistant_runner_ids(
            (SELECT auth.uid()),
            ARRAY[
              'deliver',
              'confirm_receipt',
              'driver_inbox',
              'driver_stock',
              'cash_settlement',
              'driver_operations',
              'stock_audit',
              'inbound_stock',
              'driver_workload'
            ]::text[]
          )
        ),
        ARRAY[]::uuid[]
      )
    )
  );

DROP POLICY IF EXISTS "Runner assistant can update assigned runner orders"
  ON public.orders;

CREATE POLICY "Runner assistant can update assigned runner orders"
  ON public.orders
  FOR UPDATE
  USING (
    runner_id = ANY (
      COALESCE(
        (
          SELECT public.get_runner_assistant_runner_ids(
            (SELECT auth.uid()),
            ARRAY[
              'deliver',
              'confirm_receipt',
              'driver_inbox',
              'driver_operations'
            ]::text[]
          )
        ),
        ARRAY[]::uuid[]
      )
    )
  )
  WITH CHECK (
    runner_id = ANY (
      COALESCE(
        (
          SELECT public.get_runner_assistant_runner_ids(
            (SELECT auth.uid()),
            ARRAY[
              'deliver',
              'confirm_receipt',
              'driver_inbox',
              'driver_operations'
            ]::text[]
          )
        ),
        ARRAY[]::uuid[]
      )
    )
  );

DROP POLICY IF EXISTS "Admin can view all orders"
  ON public.orders;

CREATE POLICY "Admin can view all orders"
  ON public.orders
  FOR SELECT
  USING (
    (SELECT public.get_user_role((SELECT auth.uid()))) = 'admin'
  );

DROP POLICY IF EXISTS "Driver can view assigned orders"
  ON public.orders;

CREATE POLICY "Driver can view assigned orders"
  ON public.orders
  FOR SELECT
  USING (driver_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view their orders"
  ON public.orders;

CREATE POLICY "Users can view their orders"
  ON public.orders
  FOR SELECT
  USING (
    salesperson_id = (SELECT auth.uid())
    OR runner_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Shared viewer can view subject orders"
  ON public.orders;

CREATE POLICY "Shared viewer can view subject orders"
  ON public.orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_data_shares
      WHERE user_data_shares.viewer_user_id = (SELECT auth.uid())
        AND user_data_shares.subject_user_id = orders.salesperson_id
        AND user_data_shares.active = true
        AND user_data_shares.scope_orders = true
    )
  );

DROP POLICY IF EXISTS "Manager can view team orders including inactive"
  ON public.orders;

CREATE POLICY "Manager can view team orders including inactive"
  ON public.orders
  FOR SELECT
  USING (
    (SELECT public.get_user_role((SELECT auth.uid()))) = 'manager'
    AND (
      created_by_user_id = (SELECT auth.uid())
      OR salesperson_id = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.manager_groups mg
        JOIN public.group_members gm ON gm.group_id = mg.id
        WHERE mg.manager_user_id = (SELECT auth.uid())
          AND (
            gm.member_user_id = orders.salesperson_id
            OR gm.member_user_id = orders.created_by_user_id
          )
      )
      OR public.is_in_manager_team(salesperson_id, (SELECT auth.uid()))
      OR public.is_in_manager_team(created_by_user_id, (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS manager_view_orders_needing_intervention
  ON public.orders;

CREATE POLICY manager_view_orders_needing_intervention
  ON public.orders
  FOR SELECT
  USING (
    (SELECT public.get_user_role((SELECT auth.uid()))) = 'manager'
    AND EXISTS (
      SELECT 1
      FROM public.manager_groups mg
      JOIN public.group_members gm ON gm.group_id = mg.id
      WHERE mg.manager_user_id = (SELECT auth.uid())
        AND gm.member_user_id = orders.salesperson_id
    )
    AND (
      status = 'CANCELLED'
      OR salesperson_action_required = true
      OR dispute_reason IS NOT NULL
      OR operational_status IN ('failed', 'pending')
    )
  );

DROP POLICY IF EXISTS "Driver can update assigned orders"
  ON public.orders;

CREATE POLICY "Driver can update assigned orders"
  ON public.orders
  FOR UPDATE
  USING (driver_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Only admin can delete orders"
  ON public.orders;

CREATE POLICY "Only admin can delete orders"
  ON public.orders
  FOR DELETE
  USING (
    (SELECT public.get_user_role((SELECT auth.uid()))) = 'admin'
  );

DROP POLICY IF EXISTS "Users can create orders"
  ON public.orders;

CREATE POLICY "Users can create orders"
  ON public.orders
  FOR INSERT
  WITH CHECK (
    salesperson_id = (SELECT auth.uid())
    OR runner_id = (SELECT auth.uid())
    OR (SELECT public.get_user_role((SELECT auth.uid()))) IN ('admin', 'manager')
  );

DROP POLICY IF EXISTS "Users can update their orders based on role"
  ON public.orders;

CREATE POLICY "Users can update their orders based on role"
  ON public.orders
  FOR UPDATE
  USING (
    salesperson_id = (SELECT auth.uid())
    OR runner_id = (SELECT auth.uid())
    OR (SELECT public.get_user_role((SELECT auth.uid()))) = 'admin'
  );

-- This policy duplicated both actor access and delegated order access already
-- provided by the two policies below it.
DROP POLICY IF EXISTS "Runner assistants can view runner audit logs"
  ON public.audit_logs;

DROP POLICY IF EXISTS runners_view_own_order_audit_logs
  ON public.audit_logs;

CREATE POLICY runners_view_own_order_audit_logs
  ON public.audit_logs
  FOR SELECT
  USING (
    entity_type = 'order'
    AND EXISTS (
      SELECT 1
      FROM public.orders order_row
      WHERE order_row.id = audit_logs.entity_id
        AND (
          order_row.runner_id = (SELECT auth.uid())
          OR order_row.runner_id = ANY (
            COALESCE(
              (
                SELECT public.get_runner_assistant_runner_ids(
                  (SELECT auth.uid()),
                  ARRAY[
                    'deliver',
                    'confirm_receipt',
                    'driver_inbox',
                    'driver_operations'
                  ]::text[]
                )
              ),
              ARRAY[]::uuid[]
            )
          )
        )
    )
  );

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
      schedule := '*/15 * * * *'
    );
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_gsheet_sync_logs_created_at
  ON public.gsheet_sync_logs (created_at);

CREATE INDEX IF NOT EXISTS idx_telegram_event_queue_processed_created_at
  ON public.telegram_event_queue (created_at)
  WHERE processed = true;

ALTER TABLE public.gsheet_sync_logs SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 250,
  autovacuum_analyze_threshold = 100
);

ALTER TABLE public.telegram_event_queue SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 250,
  autovacuum_analyze_threshold = 100
);

ALTER TABLE public.orders SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 500,
  autovacuum_analyze_threshold = 250
);

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
  WHERE created_at < now() - interval '14 days'
    AND status <> 'pending';

  DELETE FROM public.telegram_event_queue
  WHERE created_at < now() - interval '7 days'
    AND processed = true;

  DELETE FROM cron.job_run_details
  WHERE start_time < now() - interval '30 days';
END;
$$;

NOTIFY pgrst, 'reload schema';
