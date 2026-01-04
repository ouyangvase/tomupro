-- Fix the validate_driver_return_item_qty function
-- Failed deliveries should NOT reduce returnable quantity - driver still has those items!
-- Only count runner-accepted deliveries as consumed

CREATE OR REPLACE FUNCTION public.validate_driver_return_item_qty()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_driver_id uuid;
  v_pickup_qty bigint;
  v_delivered_qty bigint;
  v_returned_qty bigint;
  v_available bigint;
BEGIN
  IF NEW.qty IS NULL OR NEW.qty <= 0 THEN
    RAISE EXCEPTION 'Return quantity must be greater than 0';
  END IF;

  SELECT dr.driver_id INTO v_driver_id
  FROM public.driver_returns dr
  WHERE dr.id = NEW.return_id;

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Invalid return reference';
  END IF;

  -- Total acknowledged pickup qty
  SELECT COALESCE(SUM(dpi.qty), 0)::bigint INTO v_pickup_qty
  FROM public.driver_pickups dp
  JOIN public.driver_pickup_items dpi ON dpi.pickup_id = dp.id
  WHERE dp.driver_id = v_driver_id
    AND dp.status = 'DRIVER_ACKED'
    AND dpi.product_id = NEW.product_id;

  -- Only count RUNNER-ACCEPTED deliveries (not just driver_delivered)
  -- Failed deliveries do NOT consume stock - driver still has those items!
  SELECT COALESCE(SUM(oi.qty), 0)::bigint INTO v_delivered_qty
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  WHERE o.driver_id = v_driver_id
    AND oi.product_id = NEW.product_id
    AND o.runner_status = 'DELIVERED'
    AND o.runner_accept_status = 'ACCEPTED';

  -- Already returned qty (excluding this row on UPDATE)
  SELECT COALESCE(SUM(dri.qty), 0)::bigint INTO v_returned_qty
  FROM public.driver_returns dr
  JOIN public.driver_return_items dri ON dri.return_id = dr.id
  WHERE dr.driver_id = v_driver_id
    AND dr.status <> 'CANCELLED'
    AND dri.product_id = NEW.product_id;

  IF TG_OP = 'UPDATE' THEN
    v_returned_qty := GREATEST(v_returned_qty - COALESCE(OLD.qty, 0), 0);
  END IF;

  -- Available = Pickup - Delivered (runner accepted) - Already Returned
  -- NO subtraction of failed qty - those items are still with driver!
  v_available := GREATEST(v_pickup_qty - v_delivered_qty - v_returned_qty, 0);

  IF NEW.qty > v_available THEN
    RAISE EXCEPTION 'Cannot return % item(s). Only % available to return (Picked: %, Delivered: %, Already Returned: %).', 
      NEW.qty, v_available, v_pickup_qty, v_delivered_qty, v_returned_qty;
  END IF;

  RETURN NEW;
END;
$function$;