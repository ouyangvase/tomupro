-- Align the production return schema with the application contract.
-- Driver pickup/return tasks are operational records only. They must not
-- create stock movements or alter the canonical inventory balance.

ALTER TABLE public.driver_returns
  ADD COLUMN IF NOT EXISTS related_pickup_id uuid
  REFERENCES public.driver_pickups(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_driver_returns_related_pickup
  ON public.driver_returns (related_pickup_id)
  WHERE related_pickup_id IS NOT NULL;

DROP TRIGGER IF EXISTS process_driver_return_submission_trigger
  ON public.driver_returns;
DROP TRIGGER IF EXISTS trigger_process_driver_return
  ON public.driver_returns;

NOTIFY pgrst, 'reload schema';
