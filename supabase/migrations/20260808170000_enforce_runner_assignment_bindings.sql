-- Enforce the same runner binding rule at the database boundary used by every UI.
-- Salespersons may assign only their active salesperson-runner bindings.
-- Managers may assign only their active manager-runner bindings.
-- Admins and trusted server-side jobs remain unrestricted.

CREATE OR REPLACE FUNCTION public.enforce_runner_assignment_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF NEW.runner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- SECURITY DEFINER system jobs and service-role writes already enforce their
  -- own assignment rules before reaching this trigger.
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  -- Validate a new assignment, a status transition that activates one, or a
  -- salesperson change while an assigned runner remains on the order.
  IF OLD.runner_id IS NOT DISTINCT FROM NEW.runner_id
     AND OLD.salesperson_id IS NOT DISTINCT FROM NEW.salesperson_id
     AND NOT (
       OLD.runner_status IS DISTINCT FROM NEW.runner_status
       AND NEW.runner_status IN ('ASSIGNED', 'TAKEN')
     ) THEN
    RETURN NEW;
  END IF;

  v_role := public.get_user_role(auth.uid())::text;

  IF v_role = 'admin' THEN
    RETURN NEW;
  END IF;

  IF v_role = 'salesperson'
     AND NEW.salesperson_id = auth.uid()
     AND EXISTS (
       SELECT 1
       FROM public.bindings b
       WHERE b.salesperson_id = NEW.salesperson_id
         AND b.runner_id = NEW.runner_id
         AND b.active = true
     ) THEN
    RETURN NEW;
  END IF;

  IF v_role = 'manager'
     AND EXISTS (
       SELECT 1
       FROM public.manager_runner_bindings b
       WHERE b.manager_id = auth.uid()
         AND b.runner_id = NEW.runner_id
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Runner is not bound to this user';
END;
$$;

DROP TRIGGER IF EXISTS enforce_runner_assignment_binding ON public.orders;
CREATE TRIGGER enforce_runner_assignment_binding
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_runner_assignment_binding();

COMMENT ON FUNCTION public.enforce_runner_assignment_binding() IS
  'Prevents salesperson and manager order updates from assigning an unbound runner.';
