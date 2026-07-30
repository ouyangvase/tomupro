ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS driver_failed_at timestamptz;

COMMENT ON COLUMN public.orders.driver_failed_at IS
  'Timestamp when the assigned driver most recently submitted the current failed delivery outcome.';

UPDATE public.orders
SET driver_failed_at = updated_at
WHERE driver_status::text = 'DRIVER_FAILED'
  AND driver_failed_at IS NULL;
