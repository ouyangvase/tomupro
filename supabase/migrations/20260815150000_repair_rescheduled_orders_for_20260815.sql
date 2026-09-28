-- Repair only the explicitly reported 15 Aug 2026 reschedule cases.
-- Historical audit rows are retained. A real current Driver result is never
-- cleared by this repair; those rows remain in the review workflow.

DO $$
DECLARE
  r public.orders%ROWTYPE;
  v_codes text[] := ARRAY[
    'MK00598', 'JLL001', 'XT2452', 'AP1109', 'EV1407', 'AA718', 'AP889',
    'PL4685', 'SL138', 'XT1899', 'SL186', 'EV1402', 'SL183'
  ];
BEGIN
  FOR r IN
    SELECT o.*
    FROM public.orders o
    WHERE upper(o.order_code) = ANY(v_codes)
      AND upper(coalesce(o.status::text, '')) = 'READY'
      AND upper(coalesce(o.current_operational_state, '')) = 'ACTION_REQUIRED'
      AND upper(coalesce(o.runner_final_outcome::text, '')) = 'RESCHEDULE'
      AND o.runner_id IS NOT NULL
      AND upper(coalesce(o.driver_status::text, 'UNASSIGNED')) NOT IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
    FOR UPDATE
  LOOP
    UPDATE public.orders
    SET
      status = 'READY',
      operational_status = 'NEW',
      next_delivery_date = NULL,
      reschedule_flag = false,
      runner_status = 'ASSIGNED',
      runner_accept_status = NULL,
      runner_review_status = 'NOT_REVIEWED',
      runner_final_outcome = NULL,
      runner_failed_reason_id = NULL,
      runner_comment = NULL,
      runner_reviewed_at = NULL,
      runner_reviewed_by = NULL,
      driver_id = NULL,
      driver_status = 'UNASSIGNED',
      driver_assignment_batch_id = NULL,
      driver_assigned_at = NULL,
      driver_assigned_by = NULL,
      driver_started_at = NULL,
      driver_started_by = NULL,
      driver_delivered_at = NULL,
      driver_failed_reason = NULL,
      driver_failed_remark = NULL,
      driver_next_delivery_date = NULL,
      failed_reason = NULL,
      failed_remark = NULL,
      failed_next_step = NULL,
      delivered_at = NULL,
      salesperson_action_required = false,
      salesperson_action_type = NULL,
      salesperson_action_due_date = NULL,
      last_status_note = 'Repair: rescheduled for 15 Aug 2026 and returned to assigned Runner queue'
    WHERE id = r.id;

    INSERT INTO public.audit_logs (
      entity_type, entity_id, action, actor_id, before_json, after_json
    )
    SELECT
      'order', r.id, 'RESCHEDULED_ORDER_REPAIRED', NULL,
      to_jsonb(r), to_jsonb(o_after)
    FROM public.orders o_after
    WHERE o_after.id = r.id;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
