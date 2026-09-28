-- Correct the historical repair boundary: only the latest reschedule reason
-- controls the current route.
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

-- Re-assert the canonical route only when the latest history row is actually
-- Delivery Tomorrow. The CTE intentionally selects all history first and
-- filters after DISTINCT ON.
WITH latest AS (
  SELECT DISTINCT ON (rh.order_id)
    rh.order_id,
    upper(coalesce(rh.to_status::text, '')) AS latest_to_status,
    rh.next_delivery_date
  FROM public.reschedule_history rh
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
  AND latest.latest_to_status = 'DELIVERY_TOMORROW'
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
