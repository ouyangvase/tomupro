-- A driver accepts and physically collects a pickup in one action.
-- This workflow is operational only and does not create stock movements.

CREATE OR REPLACE FUNCTION public.accept_driver_pickup_task(p_pickup_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pickup public.driver_pickups%ROWTYPE;
  v_business_date date := (now() AT TIME ZONE 'Asia/Brunei')::date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_pickup
  FROM public.driver_pickups
  WHERE id = p_pickup_id
  FOR UPDATE;

  IF v_pickup.id IS NULL OR v_pickup.driver_id <> auth.uid() THEN
    RAISE EXCEPTION 'Pickup not found or not authorized';
  END IF;

  IF v_pickup.pickup_date <> v_business_date THEN
    RAISE EXCEPTION 'Expired pickups cannot be accepted; ask your runner to create a new pickup for today';
  END IF;

  IF v_pickup.status NOT IN ('PENDING_DRIVER_ACK', 'DRIVER_ACKED') THEN
    RAISE EXCEPTION 'This pickup is no longer waiting for driver acceptance';
  END IF;

  UPDATE public.driver_pickup_items
  SET collected_qty = qty
  WHERE pickup_id = p_pickup_id;

  UPDATE public.driver_pickups
  SET status = 'COMPLETED',
      acknowledged_at = COALESCE(acknowledged_at, now()),
      completed_at = COALESCE(completed_at, now()),
      updated_at = now()
  WHERE id = p_pickup_id;

  RETURN p_pickup_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_driver_pickup_task(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_driver_pickup_task(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
