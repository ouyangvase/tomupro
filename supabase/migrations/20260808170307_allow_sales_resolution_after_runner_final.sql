-- Allow Sales/Manager action resolution to move a finalized Driver outcome
-- into Booking, Ready, or Cancelled while keeping stale Driver clients locked.
-- The previous trigger treated every non-admin writer as a Driver writer,
-- which incorrectly rejected Convert to Booking from Action Required.
CREATE OR REPLACE FUNCTION public.prevent_driver_updates_after_runner_final()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(public.get_user_role(auth.uid())::text, '') = 'driver'
    AND OLD.runner_status::text IN (
      'DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
    )
    AND (
      NEW.runner_status IS DISTINCT FROM OLD.runner_status
      OR NEW.driver_status IS DISTINCT FROM OLD.driver_status
      OR NEW.driver_delivered_at IS DISTINCT FROM OLD.driver_delivered_at
      OR NEW.driver_failed_at IS DISTINCT FROM OLD.driver_failed_at
      OR NEW.driver_failed_reason IS DISTINCT FROM OLD.driver_failed_reason
      OR NEW.driver_failed_remark IS DISTINCT FROM OLD.driver_failed_remark
      OR NEW.driver_next_delivery_date IS DISTINCT FROM OLD.driver_next_delivery_date
      OR NEW.driver_payment_method IS DISTINCT FROM OLD.driver_payment_method
      OR NEW.driver_cash_amount IS DISTINCT FROM OLD.driver_cash_amount
      OR NEW.driver_transfer_amount IS DISTINCT FROM OLD.driver_transfer_amount
    )
  THEN
    RAISE EXCEPTION 'This order has a final Runner outcome and is no longer active for Driver updates';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_driver_updates_after_runner_final ON public.orders;
CREATE TRIGGER prevent_driver_updates_after_runner_final
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_driver_updates_after_runner_final();

COMMENT ON FUNCTION public.prevent_driver_updates_after_runner_final() IS
  'Prevents Driver updates from reopening orders after a final Runner outcome while allowing Sales and Manager resolution.';

NOTIFY pgrst, 'reload schema';
