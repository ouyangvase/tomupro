-- The Runner Inbox Take Jobs action only transitions an already-assigned order
-- from ASSIGNED to TAKEN. The assignment-binding guard must allow that narrow
-- transition for the assigned runner and for assistants with delivery access.

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

  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF OLD.runner_id IS NOT DISTINCT FROM NEW.runner_id
     AND OLD.salesperson_id IS NOT DISTINCT FROM NEW.salesperson_id
     AND NOT (
       OLD.runner_status IS DISTINCT FROM NEW.runner_status
       AND NEW.runner_status IN ('ASSIGNED', 'TAKEN')
     ) THEN
    RETURN NEW;
  END IF;

  v_role := public.get_user_role(auth.uid())::text;

  -- A runner may take only orders already assigned to that runner.
  IF v_role = 'runner'
     AND OLD.runner_id = auth.uid()
     AND NEW.runner_id = auth.uid()
     AND OLD.runner_status = 'ASSIGNED'
     AND NEW.runner_status = 'TAKEN' THEN
    RETURN NEW;
  END IF;

  -- A runner assistant may take orders for a linked runner only when their
  -- delivery permission is active. This matches RunnerInbox.canDeliver.
  IF v_role = 'runner_assistant'
     AND OLD.runner_id IS NOT DISTINCT FROM NEW.runner_id
     AND OLD.runner_status = 'ASSIGNED'
     AND NEW.runner_status = 'TAKEN'
     AND public.has_runner_assistant_permission(auth.uid(), NEW.runner_id, 'deliver') THEN
    RETURN NEW;
  END IF;

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

COMMENT ON FUNCTION public.enforce_runner_assignment_binding() IS
  'Prevents unbound runner assignment changes while allowing the assigned runner to take an order.';
