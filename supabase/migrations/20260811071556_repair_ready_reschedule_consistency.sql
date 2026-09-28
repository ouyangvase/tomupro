-- Keep READY orders in one canonical state. This repairs only unambiguous rows:
--   * Runner final Delivered + not Driver Failed -> DELIVERED_FINAL
--   * Runner final Failed + Driver Failed -> FAILED_FINAL
--   * active READY rows carrying stale reschedule/driver state -> NEW/unassigned
-- Known Driver/Runner conflicts are deliberately left for manual review.

CREATE OR REPLACE FUNCTION public.normalize_ready_reschedule_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text = 'READY'
     AND (
       COALESCE(NEW.reschedule_flag, false)
       OR NEW.operational_status IN ('RESCHEDULED', 'BOOKING_AUTO_RESCHEDULE')
     ) THEN
    IF NEW.runner_status::text = 'DELIVERED'
       AND NEW.driver_status IS DISTINCT FROM 'DRIVER_FAILED' THEN
      NEW.operational_status := 'DELIVERED_FINAL';
      NEW.reschedule_flag := false;
    ELSIF NEW.runner_status::text = 'FAILED_DELIVERY'
       AND NEW.driver_status = 'DRIVER_FAILED' THEN
      NEW.operational_status := 'FAILED_FINAL';
      NEW.reschedule_flag := false;
    ELSIF COALESCE(NEW.runner_status::text, 'UNASSIGNED') NOT IN ('DELIVERED', 'FAILED_DELIVERY')
       AND NEW.driver_status IS DISTINCT FROM 'DRIVER_DELIVERED'
       AND NEW.driver_status IS DISTINCT FROM 'DRIVER_FAILED'
       AND (
         NEW.operational_status IN ('RESCHEDULED', 'BOOKING_AUTO_RESCHEDULE')
         OR NEW.driver_id IS NOT NULL
       ) THEN
      NEW.operational_status := 'NEW';
      NEW.reschedule_flag := false;
      NEW.driver_id := NULL;
      NEW.driver_status := 'UNASSIGNED';
      NEW.driver_failed_reason := NULL;
      NEW.driver_failed_remark := NULL;
      NEW.driver_next_delivery_date := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_guard_ready_reschedule_consistency ON public.orders;

CREATE TRIGGER orders_guard_ready_reschedule_consistency
BEFORE INSERT OR UPDATE OF status, operational_status, reschedule_flag, driver_id, driver_status
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.normalize_ready_reschedule_consistency();

DO $$
DECLARE
  r public.orders%ROWTYPE;
  after_row public.orders%ROWTYPE;
  repair_kind text;
  new_operational_status text;
  clear_driver boolean;
BEGIN
  FOR r IN
    SELECT o.*
    FROM public.orders o
    WHERE o.status::text = 'READY'
      AND o.reschedule_flag = true
      AND (
        (
          o.runner_status::text = 'DELIVERED'
          AND o.driver_status IS DISTINCT FROM 'DRIVER_FAILED'
          AND o.operational_status IS DISTINCT FROM 'DELIVERED_FINAL'
        )
        OR (
          o.runner_status::text = 'FAILED_DELIVERY'
          AND o.driver_status = 'DRIVER_FAILED'
          AND o.operational_status IS DISTINCT FROM 'FAILED_FINAL'
        )
        OR (
          COALESCE(o.runner_status::text, 'UNASSIGNED') IN ('ASSIGNED', 'TAKEN', 'UNASSIGNED')
          AND o.driver_status IS DISTINCT FROM 'DRIVER_DELIVERED'
          AND o.driver_status IS DISTINCT FROM 'DRIVER_FAILED'
          AND (
            o.operational_status IN ('RESCHEDULED', 'BOOKING_AUTO_RESCHEDULE')
            OR o.driver_id IS NOT NULL
          )
        )
      )
    ORDER BY o.order_code
    FOR UPDATE
  LOOP
    repair_kind := NULL;
    new_operational_status := r.operational_status;
    clear_driver := false;

    IF r.runner_status::text = 'DELIVERED'
       AND r.driver_status IS DISTINCT FROM 'DRIVER_FAILED'
       AND r.operational_status IS DISTINCT FROM 'DELIVERED_FINAL' THEN
      repair_kind := 'DELIVERED_FINAL';
      new_operational_status := 'DELIVERED_FINAL';
    ELSIF r.runner_status::text = 'FAILED_DELIVERY'
       AND r.driver_status = 'DRIVER_FAILED'
       AND r.operational_status IS DISTINCT FROM 'FAILED_FINAL' THEN
      repair_kind := 'FAILED_FINAL';
      new_operational_status := 'FAILED_FINAL';
    ELSIF COALESCE(r.runner_status::text, 'UNASSIGNED') IN ('ASSIGNED', 'TAKEN', 'UNASSIGNED')
       AND r.driver_status IS DISTINCT FROM 'DRIVER_DELIVERED'
       AND r.driver_status IS DISTINCT FROM 'DRIVER_FAILED'
       AND (
         r.operational_status IN ('RESCHEDULED', 'BOOKING_AUTO_RESCHEDULE')
         OR r.driver_id IS NOT NULL
       ) THEN
      repair_kind := 'ACTIVE_READY_RESCHEDULE';
      new_operational_status := 'NEW';
      clear_driver := true;
    END IF;

    IF repair_kind IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.orders
    SET operational_status = new_operational_status,
        reschedule_flag = false,
        driver_id = CASE WHEN clear_driver THEN NULL ELSE driver_id END,
        driver_status = CASE WHEN clear_driver THEN 'UNASSIGNED' ELSE driver_status END,
        driver_failed_reason = CASE WHEN clear_driver THEN NULL ELSE driver_failed_reason END,
        driver_failed_remark = CASE WHEN clear_driver THEN NULL ELSE driver_failed_remark END,
        driver_next_delivery_date = CASE WHEN clear_driver THEN NULL ELSE driver_next_delivery_date END
    WHERE id = r.id
    RETURNING * INTO after_row;

    INSERT INTO public.reschedule_history (
      order_id,
      cycle_no,
      from_status,
      to_status,
      next_delivery_date,
      comment,
      rescheduled_by
    )
    VALUES (
      r.id,
      COALESCE(r.reschedule_cycle_no, 0) + 1,
      COALESCE(r.operational_status, r.status::text),
      CASE repair_kind
        WHEN 'DELIVERED_FINAL' THEN 'DELIVERED_FINAL_CONSISTENCY_REPAIRED'
        WHEN 'FAILED_FINAL' THEN 'FAILED_FINAL_CONSISTENCY_REPAIRED'
        ELSE 'READY_CONSISTENCY_REPAIRED'
      END,
      r.next_delivery_date,
      'Database consistency repair on 2026-08-11 Malaysia time. Previous operational_status='
        || COALESCE(r.operational_status, 'NULL')
        || ', reschedule_flag=true.'
        || CASE WHEN clear_driver
          THEN ' Driver assignment cleared because the order is back in Ready dispatch.'
          ELSE ''
        END,
      NULL
    );

    INSERT INTO public.audit_logs (
      entity_type,
      entity_id,
      action,
      actor_id,
      order_id,
      order_ref,
      action_type,
      action_description,
      assigned_runner_id,
      previous_status,
      new_status,
      performed_by_name,
      performed_by_role,
      remarks,
      before_json,
      after_json
    )
    VALUES (
      'order',
      r.id,
      'status_consistency_repaired',
      NULL,
      r.id,
      r.order_code,
      'READY_RESCHEDULE_CONSISTENCY_REPAIR',
      'Canonicalized stale Ready/reschedule state (' || repair_kind || ').',
      r.runner_id,
      r.operational_status,
      new_operational_status,
      'System (Consistency Repair)',
      'system',
      'No order history was deleted. Driver assignment was cleared only for active Ready-reschedule rows.',
      jsonb_build_object(
        'status', r.status::text,
        'operational_status', r.operational_status,
        'reschedule_flag', r.reschedule_flag,
        'runner_status', r.runner_status::text,
        'driver_status', r.driver_status,
        'driver_id', r.driver_id,
        'next_delivery_date', r.next_delivery_date
      ),
      jsonb_build_object(
        'status', after_row.status::text,
        'operational_status', after_row.operational_status,
        'reschedule_flag', after_row.reschedule_flag,
        'runner_status', after_row.runner_status::text,
        'driver_status', after_row.driver_status,
        'driver_id', after_row.driver_id,
        'next_delivery_date', after_row.next_delivery_date
      )
    );
  END LOOP;
END;
$$;
