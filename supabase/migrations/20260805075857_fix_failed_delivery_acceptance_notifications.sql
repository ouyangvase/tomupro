-- A failed Driver report can also be accepted by the Runner, but that is not
-- a delivery. Only emit the delivered acceptance notification when the
-- final Runner status is DELIVERED.
CREATE OR REPLACE FUNCTION public.notify_runner_accepted_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  order_ref TEXT;
  runner_name TEXT;
  driver_name TEXT;
BEGIN
  IF NEW.runner_accept_status = 'ACCEPTED'
    AND OLD.runner_accept_status IS DISTINCT FROM 'ACCEPTED'
    AND NEW.runner_status = 'DELIVERED'
    AND OLD.runner_status IS DISTINCT FROM 'DELIVERED'
  THEN
    order_ref := NEW.order_code;

    SELECT display_name INTO runner_name
    FROM public.profiles WHERE id = NEW.runner_id;

    SELECT display_name INTO driver_name
    FROM public.profiles WHERE id = NEW.driver_id;

    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    ) VALUES (
      NEW.salesperson_id,
      'Order Delivered',
      'Order ' || order_ref || ' delivered' ||
      E'\nAccepted by: ' || COALESCE(runner_name, 'Runner') ||
      E'\nDriver: ' || COALESCE(driver_name, 'Driver'),
      'ORDER_DELIVERED_ACCEPTED',
      'MEDIUM',
      'order',
      NEW.id,
      'ORDER',
      'salesperson'
    );

    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    ) VALUES (
      NEW.driver_id,
      'Delivery Accepted',
      'Your delivery for ' || order_ref || ' has been accepted',
      'DELIVERY_ACCEPTED',
      'MEDIUM',
      'order',
      NEW.id,
      'ORDER',
      'driver'
    );
  END IF;

  RETURN NEW;
END;
$$;
