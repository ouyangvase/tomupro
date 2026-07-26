-- Driver pickup, return, and allocated-stock records are operational only.
-- Real inventory changes only after a delivered order is accepted by its Runner.

DROP TRIGGER IF EXISTS trigger_prededuct_on_driver_assign ON public.orders;
DROP TRIGGER IF EXISTS trigger_prededuct_stock_on_driver_assign ON public.orders;
DROP TRIGGER IF EXISTS process_driver_return_submission_trigger ON public.driver_returns;
DROP TRIGGER IF EXISTS trigger_process_driver_return ON public.driver_returns;

CREATE OR REPLACE FUNCTION public.guard_driver_inventory_boundary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
BEGIN
  IF NEW.movement_type IN (
    'DRIVER_PICKUP',
    'DRIVER_RETURN_SUBMIT',
    'RUNNER_RETURN_ACK'
  ) THEN
    RAISE EXCEPTION
      'Driver pickup and return records cannot change inventory stock';
  END IF;

  IF NEW.movement_type = 'DELIVER_DEDUCT' AND NEW.order_id IS NOT NULL THEN
    SELECT
      o.runner_status,
      o.driver_status,
      o.runner_accept_status
    INTO v_order
    FROM public.orders o
    WHERE o.id = NEW.order_id;

    IF v_order.runner_status IS DISTINCT FROM 'DELIVERED' THEN
      RAISE EXCEPTION
        'Inventory can only be deducted for a Runner-delivered order';
    END IF;

    IF v_order.driver_status = 'DRIVER_DELIVERED'
      AND v_order.runner_accept_status IS DISTINCT FROM 'ACCEPTED'
    THEN
      RAISE EXCEPTION
        'Driver delivery must be accepted by the Runner before inventory deduction';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_driver_inventory_boundary
  ON public.stock_movements;
CREATE TRIGGER guard_driver_inventory_boundary
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_driver_inventory_boundary();

CREATE OR REPLACE FUNCTION public.guard_driver_delivery_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
BEGIN
  SELECT
    o.runner_status,
    o.driver_status,
    o.runner_accept_status
  INTO v_order
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_order.runner_status IS DISTINCT FROM 'DELIVERED' THEN
    RETURN NULL;
  END IF;

  IF v_order.driver_status = 'DRIVER_DELIVERED'
    AND v_order.runner_accept_status IS DISTINCT FROM 'ACCEPTED'
  THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_driver_delivery_queue
  ON public.delivery_queue;
CREATE TRIGGER guard_driver_delivery_queue
  BEFORE INSERT ON public.delivery_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_driver_delivery_queue();

CREATE OR REPLACE FUNCTION public.queue_inventory_after_runner_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.driver_status = 'DRIVER_DELIVERED'
    AND NEW.runner_accept_status = 'ACCEPTED'
    AND OLD.runner_accept_status IS DISTINCT FROM 'ACCEPTED'
    AND COALESCE(NEW.stock_deducted, false) = false
  THEN
    DELETE FROM public.delivery_queue
    WHERE order_id = NEW.id;

    INSERT INTO public.delivery_queue (order_id, queued_at, status)
    VALUES (NEW.id, now(), 'PENDING');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_inventory_after_runner_acceptance
  ON public.orders;
CREATE TRIGGER queue_inventory_after_runner_acceptance
  AFTER UPDATE OF runner_accept_status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_inventory_after_runner_acceptance();

-- Re-run accepted Driver deliveries that did not reach the inventory queue.
DELETE FROM public.delivery_queue q
USING public.orders o
WHERE q.order_id = o.id
  AND o.driver_status = 'DRIVER_DELIVERED'
  AND o.runner_accept_status = 'ACCEPTED'
  AND COALESCE(o.stock_deducted, false) = false;

INSERT INTO public.delivery_queue (order_id, queued_at, status)
SELECT o.id, now(), 'PENDING'
FROM public.orders o
WHERE o.driver_status = 'DRIVER_DELIVERED'
  AND o.runner_accept_status = 'ACCEPTED'
  AND COALESCE(o.stock_deducted, false) = false
ON CONFLICT (order_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
