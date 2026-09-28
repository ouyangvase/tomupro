-- Driver Start is an assignment-progress marker, not a delivery outcome.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS driver_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS driver_started_by uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_orders_driver_started
  ON public.orders (driver_id, driver_started_at)
  WHERE driver_id IS NOT NULL AND driver_started_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reset_driver_started_marker_on_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF OLD.driver_id IS DISTINCT FROM NEW.driver_id THEN
    NEW.driver_started_at := NULL;
    NEW.driver_started_by := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS reset_driver_started_marker_on_reassignment ON public.orders;
CREATE TRIGGER reset_driver_started_marker_on_reassignment
  BEFORE UPDATE OF driver_id ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_driver_started_marker_on_reassignment();

CREATE OR REPLACE FUNCTION public.start_driver_assignment(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_role text;
  v_order public.orders%ROWTYPE;
  v_already_started boolean := false;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_role := public.get_user_role(v_actor_id)::text;
  IF v_role <> 'driver' THEN
    RAISE EXCEPTION 'Only the assigned Driver may start this order';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.driver_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'This order is not currently assigned to you';
  END IF;

  IF COALESCE(v_order.status::text, '') IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
    OR COALESCE(v_order.runner_status::text, '') IN ('DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
    OR COALESCE(v_order.operational_status, '') IN ('DELIVERED_FINAL', 'FAILED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
    OR COALESCE(v_order.driver_status, '') NOT IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
  THEN
    RAISE EXCEPTION 'This order is no longer active for Driver work';
  END IF;

  IF v_order.driver_started_at IS NOT NULL
    AND v_order.driver_started_by IS NOT DISTINCT FROM v_actor_id
  THEN
    v_already_started := true;
  ELSE
      UPDATE public.orders
      SET driver_started_at = CASE
            WHEN driver_started_by IS DISTINCT FROM v_actor_id THEN clock_timestamp()
            ELSE COALESCE(driver_started_at, clock_timestamp())
          END,
          driver_started_by = v_actor_id
    WHERE id = p_order_id
      AND driver_id = v_actor_id
      AND driver_status IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
    RETURNING * INTO v_order;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'This order is no longer active for Driver work';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'driver_id', v_order.driver_id,
    'driver_status', v_order.driver_status,
    'runner_status', v_order.runner_status,
    'driver_started_at', v_order.driver_started_at,
    'driver_started_by', v_order.driver_started_by,
    'already_started', v_already_started
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.start_driver_assignment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_driver_assignment(uuid) TO authenticated;

COMMENT ON FUNCTION public.start_driver_assignment(uuid) IS
  'Marks the currently assigned Driver assignment as started without changing delivery outcome or order lifecycle state.';
