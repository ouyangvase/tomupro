-- A Runner-approved Driver reschedule is a pending Salesperson decision.
-- It must not surface in Booking Sales, Ready Sales, or Runner Inbox until
-- Sales resolves it. This applies to both tomorrow and later reschedules.

DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.review_driver_delivery(uuid,uuid,boolean,text)'::regprocedure;
  v_definition text;
  v_before_next_day constant text := $before_next_day$
          salesperson_action_required = false,
          salesperson_action_type = NULL,
          salesperson_action_due_date = NULL,
          reschedule_flag = false,
$before_next_day$;
  v_after_next_day constant text := $after_next_day$
          salesperson_action_required = true,
          salesperson_action_type = 'RESCHEDULE_DELIVERY',
          salesperson_action_due_date = v_requested_date,
          reschedule_flag = false,
$after_next_day$;
  v_before_future constant text := $before_future$
          salesperson_action_required = false,
          salesperson_action_type = NULL,
          salesperson_action_due_date = NULL,
          reschedule_flag = true,
$before_future$;
  v_after_future constant text := $after_future$
          salesperson_action_required = true,
          salesperson_action_type = 'RESCHEDULE_DELIVERY',
          salesperson_action_due_date = v_requested_date,
          reschedule_flag = true,
$after_future$;
BEGIN
  SELECT pg_get_functiondef(v_signature)
  INTO v_definition;

  IF strpos(v_definition, v_before_next_day) = 0
    OR strpos(v_definition, v_before_future) = 0 THEN
    RAISE EXCEPTION
      'review_driver_delivery reschedule branches no longer match expected definition';
  END IF;

  v_definition := replace(v_definition, v_before_next_day, v_after_next_day);
  v_definition := replace(v_definition, v_before_future, v_after_future);
  EXECUTE v_definition;
END;
$migration$;

-- Keep the boolean action flag as the canonical query boundary for all
-- existing and future runner-review markers.
UPDATE public.orders
SET salesperson_action_required = true
WHERE status::text <> 'CANCELLED'
  AND runner_status::text <> 'DELIVERED'
  AND (
    runner_review_status::text = 'ACTION_REQUIRED'
    OR runner_final_outcome::text = 'NEED_SALESPERSON_FOLLOWUP'
  )
  AND salesperson_action_required IS NOT TRUE;

UPDATE public.orders
SET salesperson_action_required = false
WHERE salesperson_action_required IS NULL;

-- Repair existing Runner-approved Driver reschedules that were written into
-- Booking/Ready without the action flag.
UPDATE public.orders AS o
SET
  salesperson_action_required = true,
  salesperson_action_type = 'RESCHEDULE_DELIVERY',
  salesperson_action_due_date = o.next_delivery_date,
  updated_at = now()
WHERE o.status::text IN ('BOOKING', 'READY')
  AND o.runner_review_status::text = 'REVIEWED'
  AND o.runner_final_outcome::text = 'RESCHEDULE'
  AND o.next_delivery_date IS NOT NULL
  AND COALESCE(o.salesperson_action_required, false) IS NOT TRUE
  AND EXISTS (
    SELECT 1
    FROM public.audit_logs AS audit
    WHERE audit.entity_type = 'order'
      AND audit.entity_id = o.id
      AND audit.action = 'DRIVER_RESCHEDULE_ACCEPTED'
  );

-- Keep Runner Inbox workload cards aligned with the same exclusion boundary.
DO $stats_migration$
DECLARE
  v_signature regprocedure :=
    'public.get_dashboard_stats_runner(uuid)'::regprocedure;
  v_definition text;
  v_before_active constant text := $before_active$
      WHERE status = 'READY'
        AND runner_status IN ('ASSIGNED', 'TAKEN')
$before_active$;
  v_after_active constant text := $after_active$
      WHERE status = 'READY'
        AND runner_status IN ('ASSIGNED', 'TAKEN')
        AND salesperson_action_required IS NOT TRUE
        AND runner_review_status::text IS DISTINCT FROM 'ACTION_REQUIRED'
        AND runner_final_outcome::text IS DISTINCT FROM 'NEED_SALESPERSON_FOLLOWUP'
$after_active$;
  v_before_assigned constant text := $before_assigned$
      WHERE status = 'READY'
        AND runner_status = 'ASSIGNED'
$before_assigned$;
  v_after_assigned constant text := $after_assigned$
      WHERE status = 'READY'
        AND runner_status = 'ASSIGNED'
        AND salesperson_action_required IS NOT TRUE
        AND runner_review_status::text IS DISTINCT FROM 'ACTION_REQUIRED'
        AND runner_final_outcome::text IS DISTINCT FROM 'NEED_SALESPERSON_FOLLOWUP'
$after_assigned$;
  v_before_taken constant text := $before_taken$
      WHERE status = 'READY'
        AND runner_status = 'TAKEN'
$before_taken$;
  v_after_taken constant text := $after_taken$
      WHERE status = 'READY'
        AND runner_status = 'TAKEN'
        AND salesperson_action_required IS NOT TRUE
        AND runner_review_status::text IS DISTINCT FROM 'ACTION_REQUIRED'
        AND runner_final_outcome::text IS DISTINCT FROM 'NEED_SALESPERSON_FOLLOWUP'
$after_taken$;
BEGIN
  SELECT pg_get_functiondef(v_signature)
  INTO v_definition;

  IF strpos(v_definition, v_before_active) = 0
    OR strpos(v_definition, v_before_assigned) = 0
    OR strpos(v_definition, v_before_taken) = 0 THEN
    RAISE EXCEPTION
      'get_dashboard_stats_runner no longer matches expected workload filters';
  END IF;

  v_definition := replace(v_definition, v_before_active, v_after_active);
  v_definition := replace(v_definition, v_before_assigned, v_after_assigned);
  v_definition := replace(v_definition, v_before_taken, v_after_taken);
  EXECUTE v_definition;
END;
$stats_migration$;

NOTIFY pgrst, 'reload schema';
