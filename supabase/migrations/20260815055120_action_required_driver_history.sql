-- Action Required must show the last real Driver even after a Runner review
-- intentionally releases the current driver assignment. Keep the current
-- orders.driver_id path authoritative when it exists; this RPC only supplies
-- historical evidence for the visible orders whose current assignment is gone.

CREATE OR REPLACE FUNCTION public.get_action_required_driver_history(
  p_order_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS TABLE(
  order_id uuid,
  driver_id uuid,
  driver_name text,
  assignment_timestamp timestamptz,
  evidence_action text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH requested AS (
    SELECT o.id
    FROM public.orders o
    WHERE auth.uid() IS NOT NULL
      AND o.id = ANY(COALESCE(p_order_ids, ARRAY[]::uuid[]))
      AND o.current_operational_state = 'ACTION_REQUIRED'
      AND (
        public.get_user_role(auth.uid())::text = 'admin'
        OR (
          public.get_user_role(auth.uid())::text IN ('manager', 'salesperson')
          AND o.salesperson_id = ANY(COALESCE(public.get_visible_owner_ids(), ARRAY[]::uuid[]))
        )
        OR (
          public.get_user_role(auth.uid())::text = 'runner'
          AND o.runner_id = auth.uid()
        )
        OR (
          public.get_user_role(auth.uid())::text = 'runner_assistant'
          AND EXISTS (
            SELECT 1
            FROM public.runner_assistants ra
            WHERE ra.assistant_id = auth.uid()
              AND ra.runner_id = o.runner_id
              AND ra.is_active = true
              AND (
                ra.can_manage_driver_inbox = true
                OR ra.can_view_driver_workload = true
                OR ra.can_manage_driver_stock = true
              )
          )
        )
      )
  ),
  evidence AS (
    SELECT
      audit.id,
      audit.entity_id AS order_id,
      audit.created_at AS assignment_timestamp,
      audit.action AS evidence_action,
      NULLIF(
        COALESCE(
          audit.after_json->>'driver_id',
          audit.after_json->>'previous_driver_id',
          audit.before_json->>'driver_id',
          audit.before_json->>'previous_driver_id'
        ),
        ''
      )::uuid AS driver_id
    FROM public.audit_logs audit
    JOIN requested ON requested.id = audit.entity_id
    WHERE audit.entity_type = 'order'
      AND UPPER(REPLACE(COALESCE(audit.action, ''), ' ', '_')) IN (
        'DRIVER_ASSIGNED',
        'DRIVER_REASSIGNED',
        'ORDER_ASSIGNED_TO_DRIVER',
        'DRIVER_CHANGED',
        'DRIVER_DELIVERY_ATTEMPT_SUBMITTED',
        'DRIVER_DELIVERY_DEFERRED',
        'RUNNER_TAKE_DRIVER_RELEASED'
      )
  ),
  ranked AS (
    SELECT
      evidence.*,
      ROW_NUMBER() OVER (
        PARTITION BY evidence.order_id
        ORDER BY evidence.assignment_timestamp DESC, evidence.id DESC
      ) AS row_number
    FROM evidence
    WHERE evidence.driver_id IS NOT NULL
  )
  SELECT
    ranked.order_id,
    ranked.driver_id,
    COALESCE(profile.display_name, profile.email, 'Driver')::text,
    ranked.assignment_timestamp,
    ranked.evidence_action
  FROM ranked
  LEFT JOIN public.profiles profile ON profile.id = ranked.driver_id
  WHERE ranked.row_number = 1;
$function$;

REVOKE ALL ON FUNCTION public.get_action_required_driver_history(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_action_required_driver_history(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_action_required_driver_history(uuid[]) IS
  'Returns the latest verified Driver assignment evidence for visible Action Required orders without changing order state or reactivating an assignment.';

NOTIFY pgrst, 'reload schema';
