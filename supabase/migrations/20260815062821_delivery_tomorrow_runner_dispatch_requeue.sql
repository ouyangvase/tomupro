-- Delivery Tomorrow is a completed Runner decision, not a Salesperson action.
-- Keep later/customer-requested reschedules in Action Required.

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
      lower(trim(regexp_replace(coalesce(p_runner_comment, ''), '\s+', ' ', 'g'))) = 'delivery tomorrow'
      OR EXISTS (
        SELECT 1
        FROM public.reschedule_history rh
        WHERE rh.order_id = p_order_id
          AND upper(coalesce(rh.to_status::text, '')) = 'DELIVERY_TOMORROW'
      )
    );
$$;

-- Restore the original next-day branch in the review RPC. The future-date
-- branch is intentionally left as Salesperson Action Required.
DO $$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
  v_position integer;
BEGIN
  v_definition := pg_get_functiondef(
    'public.review_driver_delivery(uuid,uuid,boolean,text)'::regprocedure
  );

  v_old := $old$      SET status = 'BOOKING',
          operational_status = 'RESCHEDULED',$old$;
  v_new := $new$      SET status = 'READY',
          operational_status = 'NEW',$new$;
  v_position := strpos(v_definition, v_old);
  IF v_position = 0 THEN
    RAISE EXCEPTION 'Delivery Tomorrow review status branch was not found';
  END IF;
  v_definition := left(v_definition, v_position - 1)
    || v_new
    || substr(v_definition, v_position + length(v_old));

  v_old := $old$          reschedule_flag = true,$old$;
  v_new := $new$          reschedule_flag = false,$new$;
  v_position := strpos(v_definition, v_old);
  IF v_position = 0 THEN
    RAISE EXCEPTION 'Delivery Tomorrow review reschedule flag was not found';
  END IF;
  v_definition := left(v_definition, v_position - 1)
    || v_new
    || substr(v_definition, v_position + length(v_old));

  v_old := $old$          salesperson_action_required = true,
          salesperson_action_type = 'RESCHEDULE_DELIVERY',
          salesperson_action_due_date = v_requested_date,$old$;
  v_new := $new$          salesperson_action_required = false,
          salesperson_action_type = NULL,
          salesperson_action_due_date = NULL,$new$;
  v_position := strpos(v_definition, v_old);
  IF v_position = 0 THEN
    RAISE EXCEPTION 'Delivery Tomorrow review action-required branch was not found';
  END IF;
  v_definition := left(v_definition, v_position - 1)
    || v_new
    || substr(v_definition, v_position + length(v_old));

  v_old := $old$          runner_comment = COALESCE(p_reason, v_order.driver_failed_remark),$old$;
  v_new := $new$          runner_comment = 'Delivery Tomorrow',$new$;
  v_position := strpos(v_definition, v_old);
  IF v_position = 0 THEN
    RAISE EXCEPTION 'Delivery Tomorrow review canonical reason was not found';
  END IF;
  v_definition := left(v_definition, v_position - 1)
    || v_new
    || substr(v_definition, v_position + length(v_old));

  EXECUTE v_definition;
END;
$$;

-- The lifecycle trigger must not turn this one canonical route back into
-- Booking merely because its scheduled date is in the future.
DO $$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_definition := pg_get_functiondef('private.enforce_final_order_lifecycle()'::regprocedure);
  v_old := $old$    AND coalesce(NEW.salesperson_action_required, false) = false
    AND upper(coalesce(NEW.runner_status::text, '')) NOT IN ($old$;
  v_new := $new$    AND coalesce(NEW.salesperson_action_required, false) = false
    AND NOT private.is_delivery_tomorrow_runner_requeue(
      NEW.id,
      NEW.runner_final_outcome::text,
      NEW.runner_review_status::text,
      NEW.salesperson_action_required,
      NEW.runner_comment
    )
    AND upper(coalesce(NEW.runner_status::text, '')) NOT IN ($new$;
  IF strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Future reschedule lifecycle guard was not found';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  EXECUTE v_definition;
END;
$$;

-- Runner Dispatch uses the same canonical boundary as the order lifecycle.
-- This keeps Delivery Tomorrow in the normal Ready/Runner line while the
-- scheduled-date guard still prevents early delivery work.
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

    IF strpos(v_definition, 'private.is_delivery_tomorrow_runner_requeue(') = 0 THEN
      v_old := $old$      AND private.is_runner_dispatch_date_due(o.next_delivery_date, o.expected_pickup_date, o.order_date, p_operational_date)$old$;
      v_new := $new$      AND (
        private.is_runner_dispatch_date_due(o.next_delivery_date, o.expected_pickup_date, o.order_date, p_operational_date)
        OR private.is_delivery_tomorrow_runner_requeue(
          o.id,
          o.runner_final_outcome::text,
          o.runner_review_status::text,
          o.salesperson_action_required,
          o.runner_comment
        )
      )$new$;
      IF strpos(v_definition, v_old) = 0 THEN
        RAISE EXCEPTION 'Dispatch due-date predicate was not found in %', v_signature;
      END IF;
      v_definition := replace(v_definition, v_old, v_new);

      v_old := $old$        OR (p_operational_date IS NOT NULL AND public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) = p_operational_date)$old$;
      v_new := $new$        OR (p_operational_date IS NOT NULL AND (
          public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) = p_operational_date
          OR private.is_delivery_tomorrow_runner_requeue(
            o.id,
            o.runner_final_outcome::text,
            o.runner_review_status::text,
            o.salesperson_action_required,
            o.runner_comment
          )
        ))$new$;
      IF strpos(v_definition, v_old) = 0 THEN
        v_old := $old$        OR (
          p_operational_date IS NOT NULL
          AND public.order_operational_date(
            o.next_delivery_date,
            o.expected_pickup_date,
            o.order_date
          ) = p_operational_date
        )$old$;
        v_new := $new$        OR (
          p_operational_date IS NOT NULL
          AND (
            public.order_operational_date(
              o.next_delivery_date,
              o.expected_pickup_date,
              o.order_date
            ) = p_operational_date
            OR private.is_delivery_tomorrow_runner_requeue(
              o.id,
              o.runner_final_outcome::text,
              o.runner_review_status::text,
              o.salesperson_action_required,
              o.runner_comment
            )
          )
        )$new$;
      END IF;
      IF strpos(v_definition, v_old) = 0 THEN
        RAISE EXCEPTION 'Dispatch operational-date predicate was not found in %', v_signature;
      END IF;
      v_definition := replace(v_definition, v_old, v_new);

      EXECUTE v_definition;
    END IF;
  END LOOP;
END;
$$;

-- Repair only already accepted, non-final Delivery Tomorrow records. No
-- stock, payment, or delivered totals are changed by this repair.
WITH latest_tomorrow AS (
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
    next_delivery_date = COALESCE(o.next_delivery_date, latest_tomorrow.next_delivery_date),
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
    runner_review_status = 'REVIEWED',
    runner_final_outcome = 'RESCHEDULE',
    updated_at = now()
FROM latest_tomorrow
WHERE o.id = latest_tomorrow.order_id
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
