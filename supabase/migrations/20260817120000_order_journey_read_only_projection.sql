-- Phase 2: read-only Runner Order Journey projection.
-- This function reads existing immutable/history sources and never changes orders.
CREATE OR REPLACE FUNCTION public.get_order_journey(
  p_order_codes text[],
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_snapshot_at timestamptz DEFAULT NULL
)
RETURNS TABLE(order_id uuid, order_code text, journey jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_codes text[];
  v_runner_ids uuid[] := ARRAY[]::uuid[];
  v_from_ts timestamptz := COALESCE(
    (p_date_from::text || ' 00:00:00 Asia/Brunei')::timestamptz,
    '-infinity'::timestamptz
  );
  v_to_ts timestamptz := COALESCE(
    ((p_date_to + 1)::text || ' 00:00:00 Asia/Brunei')::timestamptz,
    'infinity'::timestamptz
  );
  v_event_to_ts timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT upper(btrim(code))), ARRAY[]::text[])
  INTO v_codes
  FROM unnest(COALESCE(p_order_codes, ARRAY[]::text[])) AS input(code)
  WHERE btrim(code) <> '';

  IF COALESCE(array_length(v_codes, 1), 0) = 0 THEN
    RETURN;
  END IF;

  IF array_length(v_codes, 1) > 50 THEN
    RAISE EXCEPTION 'A maximum of 50 order codes can be queried at once';
  END IF;

  v_role := public.get_user_role(v_user_id)::text;
  IF v_role NOT IN ('admin', 'manager', 'runner', 'runner_assistant') THEN
    RAISE EXCEPTION 'Order Journey is not available for this role';
  END IF;

  IF v_role = 'runner_assistant' THEN
    v_runner_ids := public.get_runner_assistant_runner_ids(
      v_user_id,
      ARRAY['deliver', 'confirm_receipt', 'driver_inbox', 'driver_operations']::text[]
    );
    IF COALESCE(array_length(v_runner_ids, 1), 0) = 0 THEN
      RETURN;
    END IF;
  END IF;

  v_event_to_ts := LEAST(v_to_ts, COALESCE(p_snapshot_at, v_to_ts));

  RETURN QUERY
  WITH scoped_orders AS (
    SELECT o.*
    FROM public.orders o
    WHERE upper(o.order_code) = ANY (v_codes)
      AND (
        v_role = 'admin'
        OR (
          v_role = 'manager'
          AND (
            o.created_by_user_id = v_user_id
            OR o.salesperson_id = v_user_id
            OR o.order_owner_id = v_user_id
            OR public.is_in_manager_team(o.salesperson_id, v_user_id)
            OR public.is_in_manager_team(o.created_by_user_id, v_user_id)
            OR public.is_in_manager_team(o.order_owner_id, v_user_id)
          )
        )
        OR (
          v_role = 'runner'
          AND (
            o.runner_id = v_user_id
            OR EXISTS (
              SELECT 1 FROM public.runner_assignment_history rah
              WHERE rah.order_id = o.id AND rah.runner_id = v_user_id
            )
            OR EXISTS (
              SELECT 1 FROM public.audit_logs al
              WHERE (al.entity_id = o.id OR al.order_id = o.id)
                AND (
                  al.assigned_runner_id = v_user_id
                  OR al.after_json ->> 'runner_id' = v_user_id::text
                )
            )
          )
        )
        OR (
          v_role = 'runner_assistant'
          AND (
            o.runner_id = ANY (v_runner_ids)
            OR EXISTS (
              SELECT 1 FROM public.runner_assignment_history rah
              WHERE rah.order_id = o.id AND rah.runner_id = ANY (v_runner_ids)
            )
            OR EXISTS (
              SELECT 1 FROM public.audit_logs al
              WHERE (al.entity_id = o.id OR al.order_id = o.id)
                AND (
                  al.assigned_runner_id = ANY (v_runner_ids)
                  OR (al.after_json ->> 'runner_id')::uuid = ANY (v_runner_ids)
                )
            )
          )
        )
      )
  ),
  journey_rows AS (
    SELECT
      so.id,
      so.order_code,
      jsonb_build_object(
        'order', jsonb_build_object(
          'id', so.id,
          'order_code', so.order_code,
          'customer_name', so.customer_name,
          'phone', so.phone,
          'address', so.address,
          'area', so.area,
          'total_amount', so.total_amount,
          'total_qty', so.total_qty,
          'payment_method', so.payment_method::text,
          'order_date', so.order_date,
          'expected_pickup_date', so.expected_pickup_date,
          'scheduled_delivery_datetime', so.scheduled_delivery_datetime,
          'status', so.status::text,
          'runner_status', so.runner_status::text,
          'current_operational_state', so.current_operational_state,
          'operational_status', so.operational_status,
          'current_runner_id', so.runner_id,
          'current_driver_id', so.driver_id,
          'current_driver_status', so.driver_status,
          'runner_accept_status', so.runner_accept_status,
          'driver_payment_method', so.driver_payment_method,
          'driver_cash_amount', so.driver_cash_amount,
          'driver_transfer_amount', so.driver_transfer_amount,
          'next_delivery_date', so.next_delivery_date,
          'driver_next_delivery_date', so.driver_next_delivery_date,
          'created_at', so.created_at,
          'updated_at', so.updated_at
        ),
        'source_runner', (
          SELECT jsonb_build_object(
            'runner_id', first_rah.runner_id,
            'runner_name', first_runner.display_name,
            'assigned_at', first_rah.assigned_at,
            'assignment_source', first_rah.assignment_source
          )
          FROM public.runner_assignment_history first_rah
          LEFT JOIN public.profiles first_runner ON first_runner.id = first_rah.runner_id
          WHERE first_rah.order_id = so.id
          ORDER BY first_rah.assigned_at ASC, first_rah.created_at ASC
          LIMIT 1
        ),
        'current_runner', (
          SELECT jsonb_build_object('id', current_runner.id, 'name', current_runner.display_name, 'email', current_runner.email)
          FROM public.profiles current_runner
          WHERE current_runner.id = so.runner_id
        ),
        'current_driver', (
          SELECT jsonb_build_object('id', current_driver.id, 'name', current_driver.display_name, 'email', current_driver.email)
          FROM public.profiles current_driver
          WHERE current_driver.id = so.driver_id
        ),
        'runner_assignments', COALESCE((
          SELECT jsonb_agg(to_jsonb(r) ORDER BY r.occurred_at)
          FROM (
            SELECT
              rah.id,
              rah.runner_id,
              rp.display_name AS runner_name,
              rah.assigned_at AS occurred_at,
              rah.effective_assignment_date,
              rah.action,
              rah.assignment_source,
              rah.actor_id,
              actor.display_name AS actor_name,
              LEAD(rah.assigned_at) OVER (ORDER BY rah.assigned_at, rah.created_at, rah.id) AS ended_at
            FROM public.runner_assignment_history rah
            LEFT JOIN public.profiles rp ON rp.id = rah.runner_id
            LEFT JOIN public.profiles actor ON actor.id = rah.actor_id
            WHERE rah.order_id = so.id
              AND rah.assigned_at >= v_from_ts
              AND rah.assigned_at < v_event_to_ts
          ) r
        ), '[]'::jsonb),
        'driver_assignments', COALESCE((
          SELECT jsonb_agg(to_jsonb(d) ORDER BY d.occurred_at)
          FROM (
            SELECT
              al.id AS assignment_id,
              NULLIF(al.after_json ->> 'driver_id', '')::uuid AS driver_id,
              dp.display_name AS driver_name,
              COALESCE(al.performed_by_user_id, al.actor_id) AS assigned_by_id,
              COALESCE(al.performed_by_name, ap.display_name) AS assigned_by_name,
              COALESCE(al.performed_by_role, ap.role::text) AS assigned_by_role,
              al.assigned_runner_id AS source_runner_id,
              al.assigned_runner_name AS source_runner_name,
              al.action,
              COALESCE(al.action_type, al.action) AS event_type,
              al.created_at AS occurred_at,
              LEAD(al.created_at) OVER (ORDER BY al.created_at, al.id) AS superseded_at,
              (NULLIF(al.after_json ->> 'driver_id', '')::uuid = so.driver_id) AS is_current
            FROM public.audit_logs al
            LEFT JOIN public.profiles dp ON dp.id = NULLIF(al.after_json ->> 'driver_id', '')::uuid
            LEFT JOIN public.profiles ap ON ap.id = COALESCE(al.performed_by_user_id, al.actor_id)
            WHERE (al.entity_id = so.id OR al.order_id = so.id)
              AND al.created_at >= v_from_ts
              AND al.created_at < v_event_to_ts
              AND (
                lower(COALESCE(al.action_type, al.action, '')) LIKE '%driver%assign%'
                OR lower(COALESCE(al.action, '')) IN ('driver assigned', 'driver reassigned', 'driver unassigned')
              )
          ) d
        ), '[]'::jsonb),
        'driver_actions', COALESCE((
          SELECT jsonb_agg(to_jsonb(a) ORDER BY a.submitted_at)
          FROM (
            SELECT
              da.id,
              da.active_assignment_id AS assignment_id,
              da.driver_id,
              dp.display_name AS driver_name,
              da.result_type,
              da.failure_reason,
              da.remark,
              da.reschedule_date,
              da.driver_payment_method,
              da.cash_amount,
              da.transfer_amount,
              CASE WHEN jsonb_typeof(da.proof_images) = 'array' THEN jsonb_array_length(da.proof_images) ELSE 0 END AS photo_count,
              da.submitted_at,
              da.runner_decision,
              da.runner_decision_at,
              da.superseded_at,
              (
                da.active_assignment_id IS NOT NULL
                AND EXISTS (
                  SELECT 1 FROM public.audit_logs assign_log
                  WHERE (assign_log.entity_id = so.id OR assign_log.order_id = so.id)
                    AND assign_log.created_at <= da.submitted_at
                    AND lower(COALESCE(assign_log.action_type, assign_log.action, '')) LIKE '%driver%assign%'
                    AND NULLIF(assign_log.after_json ->> 'driver_id', '')::uuid = da.driver_id
                )
              ) AS valid_assignment
            FROM public.delivery_attempts da
            LEFT JOIN public.profiles dp ON dp.id = da.driver_id
            WHERE da.order_id = so.id
              AND da.submitted_at >= v_from_ts
              AND da.submitted_at < v_event_to_ts
          ) a
        ), '[]'::jsonb),
        'runner_decisions', COALESCE((
          SELECT jsonb_agg(to_jsonb(rd) ORDER BY rd.decided_at)
          FROM (
            SELECT
              da.id AS attempt_id,
              da.runner_decision AS decision,
              da.runner_decision_at AS decided_at,
              da.driver_id,
              dp.display_name AS driver_name,
              da.result_type,
              da.reschedule_date,
              'delivery_attempt' AS source
            FROM public.delivery_attempts da
            LEFT JOIN public.profiles dp ON dp.id = da.driver_id
            WHERE da.order_id = so.id
              AND da.runner_decision IS NOT NULL
              AND da.runner_decision <> 'PENDING'
              AND da.runner_decision_at >= v_from_ts
              AND da.runner_decision_at < v_event_to_ts
          ) rd
        ), '[]'::jsonb),
        'lifecycle', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', al.id,
            'occurred_at', al.created_at,
            'action', al.action,
            'event_type', COALESCE(al.action_type, al.action),
            'description', COALESCE(al.action_description, al.remarks, al.action),
            'actor_id', COALESCE(al.performed_by_user_id, al.actor_id),
            'actor_name', COALESCE(al.performed_by_name, actor.display_name),
            'actor_role', COALESCE(al.performed_by_role, actor.role::text),
            'assigned_runner_id', al.assigned_runner_id,
            'assigned_runner_name', al.assigned_runner_name,
            'previous_status', al.previous_status,
            'new_status', al.new_status,
            'metadata', jsonb_build_object('before', al.before_json, 'after', al.after_json)
          ) ORDER BY al.created_at, al.id)
          FROM public.audit_logs al
          LEFT JOIN public.profiles actor ON actor.id = COALESCE(al.performed_by_user_id, al.actor_id)
          WHERE (al.entity_id = so.id OR al.order_id = so.id)
            AND al.created_at >= v_from_ts
            AND al.created_at < v_event_to_ts
        ), '[]'::jsonb),
        'stock_movements', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', sm.id,
            'occurred_at', sm.created_at,
            'movement_type', sm.movement_type::text,
            'qty_change', sm.qty_change,
            'warehouse_id', sm.warehouse_id,
            'warehouse_name', w.name,
            'product_id', sm.product_id,
            'product_sku', p.sku_code,
            'product_name', p.sku_name,
            'reference_type', sm.reference_type::text,
            'reference_id', sm.reference_id
          ) ORDER BY sm.created_at, sm.id)
          FROM public.stock_movements sm
          LEFT JOIN public.warehouses w ON w.id = sm.warehouse_id
          LEFT JOIN public.products p ON p.id = sm.product_id
          WHERE sm.order_id = so.id
            AND sm.created_at >= v_from_ts
            AND sm.created_at < v_event_to_ts
        ), '[]'::jsonb),
        'payments', jsonb_build_object(
          'cash_liabilities', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', cl.id, 'created_at', cl.created_at, 'delivered_at', cl.delivered_at,
              'cash_amount', cl.cash_amount, 'status', cl.status,
              'runner_id', cl.runner_id, 'driver_id', cl.driver_id, 'settled_at', cl.settled_at
            ) ORDER BY cl.created_at)
            FROM public.cash_liabilities cl
            WHERE cl.order_id = so.id
              AND cl.created_at >= v_from_ts
              AND cl.created_at < v_event_to_ts
          ), '[]'::jsonb),
          'claims', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', c.id, 'created_at', c.created_at, 'amount', c.amount,
              'method', c.method::text, 'proof_url', c.proof_url,
              'note', c.note, 'gross_amount', c.gross_amount, 'net_claim_amount', c.net_claim_amount
            ) ORDER BY c.created_at)
            FROM public.claims c
            WHERE c.order_id = so.id
              AND c.created_at >= v_from_ts
              AND c.created_at < v_event_to_ts
          ), '[]'::jsonb)
        ),
        'notifications', jsonb_build_object(
          'driver_events', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', t.id, 'event_id', t.event_id, 'event_type', t.event_type,
              'created_at', t.created_at, 'event_created_at', t.event_created_at,
              'status', t.status, 'reason', t.reason, 'destination_count', t.destination_count,
              'send_attempt_count', t.send_attempt_count, 'success_count', t.success_count,
              'failed_count', t.failed_count, 'last_error', t.last_error,
              'telegram_attempt_at', t.telegram_attempt_at, 'telegram_success_at', t.telegram_success_at,
              'delivery_attempt_id', t.delivery_attempt_id, 'active_assignment_id', t.active_assignment_id,
              'driver_id', t.driver_id
            ) ORDER BY t.created_at)
            FROM public.telegram_driver_event_audit t
            WHERE t.order_id = so.id
              AND t.created_at >= v_from_ts
              AND t.created_at < v_event_to_ts
          ), '[]'::jsonb),
          'queue', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', q.id, 'event_type', q.event_type, 'created_at', q.created_at,
              'processed', q.processed, 'notification_status', q.notification_status,
              'notification_reason', q.notification_reason, 'send_attempt_count', q.send_attempt_count,
              'success_count', q.success_count, 'failed_count', q.failed_count,
              'last_attempt_at', q.last_attempt_at, 'processed_at', q.processed_at,
              'processor_last_error', q.processor_last_error, 'delivery_attempt_id', q.delivery_attempt_id,
              'active_assignment_id', q.active_assignment_id, 'driver_id', q.driver_id
            ) ORDER BY q.created_at)
            FROM public.telegram_event_queue q
            WHERE q.order_id = so.id
              AND q.created_at >= v_from_ts
              AND q.created_at < v_event_to_ts
          ), '[]'::jsonb)
        ),
        'snapshot', CASE WHEN p_snapshot_at IS NULL THEN NULL ELSE jsonb_build_object(
          'at', p_snapshot_at,
          'last_lifecycle_event', (
            SELECT jsonb_build_object(
              'occurred_at', al.created_at,
              'action', al.action,
              'event_type', COALESCE(al.action_type, al.action),
              'description', COALESCE(al.action_description, al.remarks, al.action),
              'actor_name', COALESCE(al.performed_by_name, actor.display_name),
              'after', al.after_json
            )
            FROM public.audit_logs al
            LEFT JOIN public.profiles actor ON actor.id = COALESCE(al.performed_by_user_id, al.actor_id)
            WHERE (al.entity_id = so.id OR al.order_id = so.id)
              AND al.created_at < p_snapshot_at
            ORDER BY al.created_at DESC, al.id DESC
            LIMIT 1
          )
        ) END,
        'summary', jsonb_build_object(
          'canonical_state', COALESCE(so.current_operational_state, so.operational_status, so.status::text),
          'runner_status', so.runner_status::text,
          'driver_status', so.driver_status,
          'current_runner_id', so.runner_id,
          'current_driver_id', so.driver_id,
          'last_driver_action_at', (SELECT max(da.submitted_at) FROM public.delivery_attempts da WHERE da.order_id = so.id),
          'last_runner_decision_at', (SELECT max(da.runner_decision_at) FROM public.delivery_attempts da WHERE da.order_id = so.id AND da.runner_decision IS NOT NULL),
          'stock_warehouse', (SELECT jsonb_build_object('id', w.id, 'name', w.name) FROM public.warehouses w WHERE w.id = so.fulfillment_warehouse_id),
          'cash_amount', so.driver_cash_amount,
          'transfer_amount', so.driver_transfer_amount
        ),
        'anomalies', COALESCE((
          SELECT jsonb_agg(anomaly ORDER BY code)
          FROM (
            SELECT jsonb_build_object(
              'code', 'DRIVER_ACTION_WITHOUT_ACTIVE_ASSIGNMENT',
              'severity', 'warning',
              'message', 'A driver submitted an action without a matching historical driver assignment.',
              'attempt_ids', jsonb_agg(da.id)
            ) AS anomaly, 'DRIVER_ACTION_WITHOUT_ACTIVE_ASSIGNMENT' AS code
            FROM public.delivery_attempts da
            WHERE da.order_id = so.id
              AND da.active_assignment_id IS NULL
              AND da.submitted_at >= v_from_ts
              AND da.submitted_at < v_event_to_ts
            HAVING count(*) > 0
            UNION ALL
            SELECT jsonb_build_object(
              'code', 'MISSING_ASSIGNMENT_HISTORY',
              'severity', 'warning',
              'message', 'The current driver field exists but no historical assignment event was found.',
              'driver_id', so.driver_id
            ), 'MISSING_ASSIGNMENT_HISTORY'
            WHERE so.driver_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM public.audit_logs al
                WHERE (al.entity_id = so.id OR al.order_id = so.id)
                  AND lower(COALESCE(al.action_type, al.action, '')) LIKE '%driver%assign%'
                  AND NULLIF(al.after_json ->> 'driver_id', '')::uuid = so.driver_id
              )
            UNION ALL
            SELECT jsonb_build_object(
              'code', 'MISSING_DELIVERY_ATTEMPT',
              'severity', 'error',
              'message', 'The order has a final driver result but no immutable delivery attempt.',
              'driver_status', so.driver_status
            ), 'MISSING_DELIVERY_ATTEMPT'
            WHERE so.driver_status IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
              AND NOT EXISTS (SELECT 1 FROM public.delivery_attempts da WHERE da.order_id = so.id)
            UNION ALL
            SELECT jsonb_build_object(
              'code', 'RUNNER_DECISION_WITHOUT_ATTEMPT',
              'severity', 'error',
              'message', 'A Runner decision audit exists without a linked delivery attempt.'
            ), 'RUNNER_DECISION_WITHOUT_ATTEMPT'
            WHERE EXISTS (
              SELECT 1 FROM public.audit_logs al
              WHERE (al.entity_id = so.id OR al.order_id = so.id)
                AND upper(COALESCE(al.action_type, al.action, '')) IN ('DRIVER_DELIVERY_ACCEPTED', 'DRIVER_FAILURE_ACCEPTED', 'DRIVER_REPORT_REJECTED')
            )
              AND NOT EXISTS (SELECT 1 FROM public.delivery_attempts da WHERE da.order_id = so.id)
            UNION ALL
            SELECT jsonb_build_object(
              'code', 'CURRENT_DRIVER_FIELD_STALE',
              'severity', 'warning',
              'message', 'The current driver field remains populated after the order left active dispatch.',
              'driver_id', so.driver_id
            ), 'CURRENT_DRIVER_FIELD_STALE'
            WHERE so.driver_id IS NOT NULL
              AND (so.runner_status::text = 'UNASSIGNED' OR COALESCE(so.current_operational_state, so.operational_status, so.status::text) IN ('CANCELLED', 'DELIVERED'))
            UNION ALL
            SELECT jsonb_build_object(
              'code', 'ACTION_AFTER_FINAL_DELIVERED',
              'severity', 'error',
              'message', 'A later driver attempt exists after an accepted delivered result.'
            ), 'ACTION_AFTER_FINAL_DELIVERED'
            WHERE EXISTS (
              SELECT 1 FROM public.delivery_attempts delivered_attempt
              WHERE delivered_attempt.order_id = so.id
                AND delivered_attempt.result_type IN ('DRIVER_DELIVERED_SUBMITTED', 'DRIVER_DELIVERED')
                AND delivered_attempt.runner_decision IN ('ACCEPTED', 'ACCEPT')
                AND EXISTS (
                  SELECT 1 FROM public.delivery_attempts later_attempt
                  WHERE later_attempt.order_id = so.id
                    AND later_attempt.submitted_at > delivered_attempt.submitted_at
                )
            )
            UNION ALL
            SELECT jsonb_build_object(
              'code', 'CURRENT_STATE_UNSUPPORTED',
              'severity', 'error',
              'message', 'The canonical lifecycle state is outside the supported destination set.',
              'state', COALESCE(so.current_operational_state, so.operational_status, so.status::text)
            ), 'CURRENT_STATE_UNSUPPORTED'
            WHERE COALESCE(so.current_operational_state, so.operational_status, so.status::text) NOT IN ('BOOKING', 'READY', 'ACTION_REQUIRED', 'DELIVERED', 'CANCELLED')
          ) anomalies_for_order
        ), '[]'::jsonb)
      ) AS journey
    FROM scoped_orders so
  )
  SELECT jr.id, jr.order_code, jr.journey
  FROM journey_rows jr
  ORDER BY jr.order_code;
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_journey(text[], date, date, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_order_journey(text[], date, date, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_order_journey(text[], date, date, timestamptz) TO authenticated;
