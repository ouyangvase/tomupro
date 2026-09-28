-- Keep an accepted Delivery Tomorrow order visible to its currently assigned
-- Driver without changing the order row or any other lifecycle transition.
-- The canonical lifecycle function intentionally treats DRIVER_FAILED as a
-- review outcome; this read-model exception is limited to the exact special
-- reason while the order is still READY and assigned.

BEGIN;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.get_driver_assignment_source(uuid,uuid,date,date,boolean,boolean)'::regprocedure;
  v_definition text;
  v_before constant text := $before$
  ), classified AS (
    SELECT
      scoped.*,
      private.order_lifecycle_state(
        scoped.status::text,
        scoped.operational_status::text,
        scoped.driver_status::text,
        scoped.runner_status::text,
        coalesce(scoped.runner_accept_status::text, 'PENDING'),
        coalesce(scoped.runner_review_status::text, 'NOT_REVIEWED'),
        scoped.runner_final_outcome::text,
        scoped.salesperson_action_required,
        scoped.next_delivery_date,
        scoped.driver_id
      ) AS lifecycle_state
    FROM scoped
  ), eligible AS (
$before$;
  v_after constant text := $after$
  ), classified AS (
    SELECT
      scoped.*,
      CASE
        WHEN scoped.current_operational_state::text = 'READY'
          AND scoped.status::text = 'READY'
          AND scoped.driver_status::text = 'DRIVER_FAILED'
          AND scoped.runner_status::text IN ('ASSIGNED', 'TAKEN')
          AND coalesce(scoped.runner_accept_status::text, 'PENDING') = 'ACCEPTED'
          AND coalesce(scoped.runner_review_status::text, 'NOT_REVIEWED') = 'REVIEWED'
          AND lower(regexp_replace(
            trim(coalesce(scoped.driver_failed_reason::text, '')),
            '\s+',
            ' ',
            'g'
          )) = 'delivery tomorrow'
          AND coalesce(scoped.salesperson_action_required, false) IS NOT TRUE
          AND coalesce(scoped.runner_final_outcome::text, '') NOT IN (
            'NEED_SALESPERSON_FOLLOWUP',
            'DELIVERED',
            'FAILED_DELIVERY'
          )
          THEN 'ASSIGNED_ACTIVE'
        ELSE private.order_lifecycle_state(
          scoped.status::text,
          scoped.operational_status::text,
          scoped.driver_status::text,
          scoped.runner_status::text,
          coalesce(scoped.runner_accept_status::text, 'PENDING'),
          coalesce(scoped.runner_review_status::text, 'NOT_REVIEWED'),
          scoped.runner_final_outcome::text,
          scoped.salesperson_action_required,
          scoped.next_delivery_date,
          scoped.driver_id
        )
      END AS lifecycle_state
    FROM scoped
  ), eligible AS (
$after$;
BEGIN
  SELECT pg_get_functiondef(v_signature)
  INTO v_definition;

  IF strpos(v_definition, 'scoped.driver_failed_reason')
    > 0
    AND strpos(v_definition, 'delivery tomorrow') > 0
  THEN
    RETURN;
  END IF;

  IF strpos(v_definition, v_before) = 0 THEN
    RAISE EXCEPTION
      'get_driver_assignment_source classification block no longer matches expected definition';
  END IF;

  v_definition := replace(v_definition, v_before, v_after);
  EXECUTE v_definition;
END;
$migration$;

COMMENT ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean) IS
  'Returns Driver assignments. Exact accepted Delivery Tomorrow remains visible as an active assignment while the order stays READY and assigned.';

NOTIFY pgrst, 'reload schema';

COMMIT;
