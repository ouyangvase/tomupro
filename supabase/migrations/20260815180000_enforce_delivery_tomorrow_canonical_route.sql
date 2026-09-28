-- Enforce the complete Delivery Tomorrow invariant at the database boundary.
-- The latest reschedule reason wins; an older Delivery Tomorrow history row
-- must not reclassify a later customer/salesperson reschedule.

CREATE OR REPLACE FUNCTION private.is_delivery_tomorrow_runner_requeue(
  p_order_id uuid,
  p_runner_final_outcome text,
  p_runner_review_status text,
  p_salesperson_action_required boolean,
  p_runner_comment text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, private, pg_temp
AS $$
  SELECT upper(coalesce(p_runner_final_outcome, '')) = 'RESCHEDULE'
    AND upper(coalesce(p_runner_review_status, '')) = 'REVIEWED'
    AND coalesce(p_salesperson_action_required, false) = false
    AND (
      EXISTS (
        SELECT 1
        FROM public.reschedule_history rh
        WHERE rh.order_id = p_order_id
          AND upper(coalesce(rh.to_status::text, '')) = 'DELIVERY_TOMORROW'
          AND NOT EXISTS (
            SELECT 1
            FROM public.reschedule_history newer
            WHERE newer.order_id = rh.order_id
              AND (newer.rescheduled_at, newer.id) > (rh.rescheduled_at, rh.id)
          )
      )
      OR (
        lower(trim(regexp_replace(coalesce(p_runner_comment, ''), '\s+', ' ', 'g'))) = 'delivery tomorrow'
        AND NOT EXISTS (
          SELECT 1
          FROM public.reschedule_history rh
          WHERE rh.order_id = p_order_id
        )
      )
    );
$$;

-- This helper is used by the final trigger and read RPCs. It deliberately
-- includes current status/runner status so a later Delivered or Cancelled
-- result can never be moved back to Ready by an old reschedule history row.
CREATE OR REPLACE FUNCTION private.is_delivery_tomorrow_route(
  p_order_id uuid,
  p_order_status text,
  p_runner_status text,
  p_runner_final_outcome text,
  p_runner_review_status text,
  p_runner_comment text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, private, pg_temp
AS $$
  SELECT upper(coalesce(p_order_status, '')) NOT IN ('DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED')
    AND upper(coalesce(p_runner_status, '')) NOT IN ('DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'RETURNED', 'REFUNDED')
    AND upper(coalesce(p_runner_final_outcome, '')) = 'RESCHEDULE'
    AND upper(coalesce(p_runner_review_status, '')) = 'REVIEWED'
    AND (
      EXISTS (
        SELECT 1
        FROM public.reschedule_history rh
        WHERE rh.order_id = p_order_id
          AND upper(coalesce(rh.to_status::text, '')) = 'DELIVERY_TOMORROW'
          AND NOT EXISTS (
            SELECT 1
            FROM public.reschedule_history newer
            WHERE newer.order_id = rh.order_id
              AND (newer.rescheduled_at, newer.id) > (rh.rescheduled_at, rh.id)
          )
      )
      OR (
        lower(trim(regexp_replace(coalesce(p_runner_comment, ''), '\s+', ' ', 'g'))) = 'delivery tomorrow'
        AND NOT EXISTS (
          SELECT 1
          FROM public.reschedule_history rh
          WHERE rh.order_id = p_order_id
        )
      )
    );
$$;

-- Run after the existing order triggers so every write path converges to the
-- same state: READY, no Salesperson action, no active Driver, Runner queue.
CREATE OR REPLACE FUNCTION private.enforce_delivery_tomorrow_canonical_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF private.is_delivery_tomorrow_route(
    NEW.id,
    NEW.status::text,
    NEW.runner_status::text,
    NEW.runner_final_outcome::text,
    NEW.runner_review_status::text,
    NEW.runner_comment
  ) THEN
    NEW.status := 'READY'::public.order_status;
    NEW.operational_status := 'NEW';
    NEW.reschedule_flag := false;
    NEW.salesperson_action_required := false;
    NEW.salesperson_action_type := NULL;
    NEW.salesperson_action_due_date := NULL;
    NEW.runner_accept_status := NULL;
    NEW.runner_review_status := 'REVIEWED';
    NEW.runner_final_outcome := 'RESCHEDULE';
    NEW.runner_comment := 'Delivery Tomorrow';
    NEW.driver_id := NULL;
    NEW.driver_status := 'UNASSIGNED';
    NEW.driver_assignment_batch_id := NULL;
    NEW.driver_assigned_at := NULL;
    NEW.driver_assigned_by := NULL;
    NEW.driver_started_at := NULL;
    NEW.driver_started_by := NULL;
    NEW.driver_delivered_at := NULL;
    NEW.driver_failed_reason := NULL;
    NEW.driver_failed_remark := NULL;
    NEW.driver_next_delivery_date := NULL;
    NEW.delivered_at := NULL;
    NEW.last_status_note := CASE
      WHEN NEW.next_delivery_date IS NULL THEN 'Delivery deferred to tomorrow; returned to Runner Dispatch.'
      ELSE 'Delivery deferred to ' || to_char(NEW.next_delivery_date, 'DD Mon YYYY')
        || '; returned to Runner Dispatch.'
    END;
  END IF;

  NEW.current_operational_state := private.order_current_operational_state(
    NEW.status::text,
    NEW.operational_status,
    NEW.runner_status::text,
    NEW.runner_review_status,
    NEW.runner_final_outcome,
    NEW.salesperson_action_required
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_enforce_delivery_tomorrow_canonical_route ON public.orders;
CREATE TRIGGER zz_enforce_delivery_tomorrow_canonical_route
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION private.enforce_delivery_tomorrow_canonical_route();

-- Point all Runner Dispatch read paths at the same canonical route helper.
DO $$
DECLARE
  v_signature text;
  v_definition text;
  v_old text;
  v_new text;
  v_signatures text[] := ARRAY[
    'public.get_runner_dispatch_area_summary(date)',
    'public.get_runner_dispatch_locality_summary(date,text)',
    'public.get_runner_dispatch_area_order_ids(date,text,boolean)'
  ];
BEGIN
  FOREACH v_signature IN ARRAY v_signatures LOOP
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    v_old := $old$private.is_delivery_tomorrow_runner_requeue(
          o.id,
          o.runner_final_outcome::text,
          o.runner_review_status::text,
          o.salesperson_action_required,
          o.runner_comment
        )$old$;
    v_new := $new$private.is_delivery_tomorrow_route(
          o.id,
          o.status::text,
          o.runner_status::text,
          o.runner_final_outcome::text,
          o.runner_review_status::text,
          o.runner_comment
        )$new$;
    IF strpos(v_definition, v_old) = 0 THEN
      RAISE EXCEPTION 'Delivery Tomorrow dispatch helper call was not found in %', v_signature;
    END IF;
    v_definition := replace(v_definition, v_old, v_new);
    EXECUTE v_definition;
  END LOOP;
END;
$$;

-- Undo only the prior migration's accidental rewrite of records whose latest
-- reason is not Delivery Tomorrow but whose comment was overwritten during
-- the broad historical repair. This is intentionally scoped and auditable.
WITH latest AS (
  SELECT DISTINCT ON (rh.order_id)
    rh.order_id,
    upper(coalesce(rh.to_status::text, '')) AS latest_to_status,
    rh.next_delivery_date,
    rh.comment
  FROM public.reschedule_history rh
  ORDER BY rh.order_id, rh.rescheduled_at DESC, rh.id DESC
)
UPDATE public.orders o
SET status = 'BOOKING',
    operational_status = 'RESCHEDULED',
    reschedule_flag = true,
    salesperson_action_required = true,
    salesperson_action_type = 'RESCHEDULE_DELIVERY',
    salesperson_action_due_date = latest.next_delivery_date,
    runner_comment = COALESCE(NULLIF(trim(latest.comment), ''), 'Customer requested reschedule'),
    updated_at = now()
FROM latest
WHERE o.id = latest.order_id
  AND latest.latest_to_status <> 'DELIVERY_TOMORROW'
  AND lower(trim(regexp_replace(coalesce(o.runner_comment, ''), '\s+', ' ', 'g'))) = 'delivery tomorrow'
  AND upper(coalesce(o.runner_final_outcome::text, '')) = 'RESCHEDULE'
  AND upper(coalesce(o.runner_review_status::text, '')) = 'REVIEWED'
  AND upper(coalesce(o.runner_status::text, '')) NOT IN ('DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'RETURNED', 'REFUNDED');

-- Repair all currently accepted Delivery Tomorrow records using the latest
-- reason only. Final Delivered/Cancelled orders are excluded.
WITH latest AS (
  SELECT DISTINCT ON (rh.order_id)
    rh.order_id,
    rh.next_delivery_date
  FROM public.reschedule_history rh
  WHERE upper(coalesce(rh.to_status::text, '')) = 'DELIVERY_TOMORROW'
  ORDER BY rh.order_id, rh.rescheduled_at DESC, rh.id DESC
)
UPDATE public.orders o
SET status = 'READY',
    operational_status = 'NEW',
    next_delivery_date = COALESCE(o.next_delivery_date, latest.next_delivery_date),
    reschedule_flag = false,
    salesperson_action_required = false,
    salesperson_action_type = NULL,
    salesperson_action_due_date = NULL,
    runner_comment = 'Delivery Tomorrow',
    driver_id = NULL,
    driver_status = 'UNASSIGNED',
    driver_assignment_batch_id = NULL,
    driver_assigned_at = NULL,
    driver_assigned_by = NULL,
    runner_accept_status = NULL,
    runner_review_status = 'REVIEWED',
    runner_final_outcome = 'RESCHEDULE',
    updated_at = now()
FROM latest
WHERE o.id = latest.order_id
  AND EXISTS (
    SELECT 1
    FROM public.audit_logs a
    WHERE a.entity_type = 'order'
      AND a.entity_id = o.id
      AND a.action = 'DRIVER_DELIVERY_DEFERRED'
      AND a.after_json->>'accepted' = 'true'
  )
  AND upper(coalesce(o.status::text, '')) NOT IN ('CANCELLED', 'DELIVERED')
  AND upper(coalesce(o.runner_status::text, '')) NOT IN (
    'DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'RETURNED', 'REFUNDED'
  )
  AND upper(coalesce(o.runner_review_status::text, '')) = 'REVIEWED'
  AND upper(coalesce(o.runner_final_outcome::text, '')) = 'RESCHEDULE';
