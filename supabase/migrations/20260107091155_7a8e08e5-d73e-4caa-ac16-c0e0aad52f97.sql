-- Update blocking orders function to only block on DRIVER_DELIVERED status
-- ASSIGNED and OUT_FOR_DELIVERY orders should not block new pickups
CREATE OR REPLACE FUNCTION public.get_driver_blocking_orders(p_driver_id uuid)
RETURNS TABLE(
  order_id uuid,
  order_code text,
  customer_name text,
  driver_status text,
  order_date date
) 
LANGUAGE sql
STABLE
AS $$
  SELECT 
    id as order_id,
    order_code,
    customer_name,
    driver_status,
    order_date
  FROM public.orders
  WHERE driver_id = p_driver_id
    AND driver_status = 'DRIVER_DELIVERED'
    AND runner_accept_status IS DISTINCT FROM 'ACCEPTED'
    AND order_date < CURRENT_DATE
  ORDER BY order_date ASC
$$;