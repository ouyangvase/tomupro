
-- Add runner_assigned_at column to track when runner received the assignment
ALTER TABLE public.orders ADD COLUMN runner_assigned_at timestamptz;

-- Backfill: for orders that already have a runner_id, set runner_assigned_at to updated_at as best estimate
UPDATE public.orders SET runner_assigned_at = updated_at WHERE runner_id IS NOT NULL AND runner_assigned_at IS NULL;

-- Create trigger function to auto-set runner_assigned_at when runner_id is assigned
CREATE OR REPLACE FUNCTION public.set_runner_assigned_at()
RETURNS TRIGGER AS $$
BEGIN
  -- When runner_id changes from NULL to a value, or changes to a different runner
  IF (OLD.runner_id IS DISTINCT FROM NEW.runner_id) AND NEW.runner_id IS NOT NULL THEN
    NEW.runner_assigned_at = now();
  END IF;
  -- If runner_id is cleared, also clear runner_assigned_at
  IF NEW.runner_id IS NULL THEN
    NEW.runner_assigned_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger
CREATE TRIGGER trg_set_runner_assigned_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.set_runner_assigned_at();
