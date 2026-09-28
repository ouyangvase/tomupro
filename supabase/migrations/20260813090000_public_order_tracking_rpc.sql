-- Public order tracking intentionally exposes only an order code and a safe
-- customer-facing status. The exact lookup keeps this surface from becoming
-- a general orders search endpoint.

CREATE INDEX IF NOT EXISTS idx_orders_public_tracking_code
  ON public.orders (upper(regexp_replace(coalesce(order_code, ''), E'\\s+', '', 'g')));

DROP FUNCTION IF EXISTS public.track_public_order(text);

CREATE OR REPLACE FUNCTION public.track_public_order(p_order_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_code text := upper(regexp_replace(trim(coalesce(p_order_code, '')), E'\\s+', '', 'g'));
  v_order record;
BEGIN
  IF v_code = '' OR length(v_code) > 64 OR v_code !~ '^[A-Z0-9][A-Z0-9-]*$' THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT
    o.order_code,
    o.current_operational_state,
    o.operational_status,
    o.next_delivery_date,
    o.driver_next_delivery_date,
    o.driver_id,
    o.driver_status
  INTO v_order
  FROM public.orders AS o
  WHERE upper(regexp_replace(coalesce(o.order_code, ''), E'\\s+', '', 'g')) = v_code
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'orderCode', v_order.order_code,
    'status', CASE
      WHEN v_order.current_operational_state = 'CANCELLED' THEN 'Cancelled'
      WHEN v_order.current_operational_state = 'DELIVERED' THEN 'Delivered'
      WHEN upper(coalesce(v_order.operational_status::text, '')) IN (
        'RESCHEDULED', 'BOOKING_AUTO_RESCHEDULE', 'BOOKING_MANUAL'
      )
        OR v_order.next_delivery_date IS NOT NULL
        OR v_order.driver_next_delivery_date IS NOT NULL
        THEN 'Delivery Rescheduled'
      WHEN v_order.current_operational_state = 'READY'
        AND v_order.driver_id IS NOT NULL
        AND upper(coalesce(v_order.driver_status, '')) IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
        THEN 'Out for Delivery'
      WHEN v_order.current_operational_state = 'READY' THEN 'Ready for Delivery'
      WHEN v_order.current_operational_state = 'ACTION_REQUIRED' THEN 'Delivery Update Required'
      ELSE 'Order Received'
    END
  );
EXCEPTION WHEN OTHERS THEN
  -- Never disclose database or order details through this public surface.
  RETURN jsonb_build_object('found', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.track_public_order(text) FROM PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.track_public_order(text) TO anon;
