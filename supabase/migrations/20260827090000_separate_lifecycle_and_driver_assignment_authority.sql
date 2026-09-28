-- Keep lifecycle transitions separate from Driver assignment mutations.
-- Manager/Salesperson/Admin may transition an order between lifecycle states,
-- while only Runner and authorized Runner Assistant may create or retain an
-- active Driver assignment.

CREATE OR REPLACE FUNCTION private.guard_driver_assignment_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE
  v_role text := public.get_user_role(auth.uid())::text;
  v_assignment_columns_changed boolean := NEW.driver_id IS DISTINCT FROM OLD.driver_id
    OR NEW.driver_status IS DISTINCT FROM OLD.driver_status
    OR NEW.driver_assignment_batch_id IS DISTINCT FROM OLD.driver_assignment_batch_id
    OR NEW.driver_assigned_at IS DISTINCT FROM OLD.driver_assigned_at
    OR NEW.driver_assigned_by IS DISTINCT FROM OLD.driver_assigned_by;
  v_is_assignment_state boolean := NEW.driver_id IS NOT NULL
    OR NEW.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY');
BEGIN
  -- Lifecycle transitions may clear Driver assignment fields as part of the
  -- state change. That is a system-owned release, not a Driver assignment.
  IF NOT v_assignment_columns_changed OR NOT v_is_assignment_state THEN
    RETURN NEW;
  END IF;

  -- The canonical Driver submission path updates review fields and must keep
  -- working without granting that path assignment authority.
  IF current_setting('app.driver_submission', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF v_role IN ('runner', 'runner_assistant')
    AND (
      (
        v_role = 'runner'
        AND NEW.runner_id = auth.uid()
      )
      OR (
        v_role = 'runner_assistant'
        AND public.has_runner_assistant_permission(auth.uid(), NEW.runner_id, 'driver_inbox')
      )
    )
  THEN
    IF NEW.driver_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.runner_drivers rd
        WHERE rd.runner_id = NEW.runner_id
          AND rd.driver_id = NEW.driver_id
          AND rd.is_active = true
      )
    THEN
      RAISE EXCEPTION 'Selected Driver is not linked to this Runner'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only a Runner or authorized Runner Assistant may assign Driver orders'
    USING ERRCODE = '42501';
END;
$function$;

REVOKE ALL ON FUNCTION private.guard_driver_assignment_authority() FROM PUBLIC;

COMMENT ON FUNCTION private.guard_driver_assignment_authority() IS
  'Allows only Runner or authorized Runner Assistant Driver assignments; lifecycle transitions may release assignments without assignment authority.';

NOTIFY pgrst, 'reload schema';
