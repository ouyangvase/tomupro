-- The canonical Driver submission RPC updates driver_status while recording
-- delivery evidence. It is not a Driver assignment and must pass through the
-- assignment-authority trigger unchanged.

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
  IF NOT v_assignment_columns_changed OR NOT v_is_assignment_state THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.driver_submission', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF v_role = 'admin'
    OR (
      v_role = 'runner'
      AND NEW.runner_id = auth.uid()
    )
    OR (
      v_role = 'runner_assistant'
      AND public.has_runner_assistant_permission(auth.uid(), NEW.runner_id, 'driver_inbox')
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

NOTIFY pgrst, 'reload schema';
