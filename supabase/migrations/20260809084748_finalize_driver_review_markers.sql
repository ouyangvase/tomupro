-- An accepted Driver outcome is final from the Runner's perspective.
-- Keep the acceptance and review markers in sync so every queue uses the same
-- lifecycle state, regardless of which Runner action wrote the order.

CREATE OR REPLACE FUNCTION public.sync_driver_review_marker()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.runner_accept_status::text = 'ACCEPTED'
    AND NEW.runner_status::text IN ('DELIVERED', 'FAILED_DELIVERY')
    AND COALESCE(NEW.runner_review_status::text, 'NOT_REVIEWED') <> 'REVIEWED'
  THEN
    NEW.runner_review_status := 'REVIEWED';
    NEW.runner_reviewed_at := COALESCE(NEW.runner_reviewed_at, NEW.delivered_at, NEW.updated_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_driver_review_marker_on_orders ON public.orders;

CREATE TRIGGER sync_driver_review_marker_on_orders
  BEFORE INSERT OR UPDATE OF runner_accept_status, runner_status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_driver_review_marker();

-- Repair only lifecycle metadata for already accepted final Driver outcomes.
-- Order assignment, payment, inventory, and customer data are unchanged.
UPDATE public.orders
SET runner_review_status = 'REVIEWED',
    runner_reviewed_at = COALESCE(runner_reviewed_at, delivered_at, updated_at)
WHERE runner_accept_status::text = 'ACCEPTED'
  AND runner_status::text IN ('DELIVERED', 'FAILED_DELIVERY')
  AND COALESCE(runner_review_status::text, 'NOT_REVIEWED') <> 'REVIEWED';

REVOKE ALL ON FUNCTION public.sync_driver_review_marker() FROM PUBLIC;

COMMENT ON FUNCTION public.sync_driver_review_marker() IS
  'Keeps accepted final Driver outcomes marked as reviewed for consistent queue filtering.';
