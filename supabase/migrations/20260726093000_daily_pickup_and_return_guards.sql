-- Daily pickup lifecycle and idempotent driver returns.
-- Pickup/return records are operational only and must not write stock_movements.

DROP TRIGGER IF EXISTS process_driver_return_submission_trigger ON public.driver_returns;
DROP TRIGGER IF EXISTS trigger_process_driver_return ON public.driver_returns;

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_pickups_one_active_per_day
  ON public.driver_pickups (driver_id, pickup_date)
  WHERE status <> 'CANCELLED';

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_returns_one_pending_per_driver
  ON public.driver_returns (driver_id)
  WHERE status = 'PENDING_RUNNER_ACK';

CREATE OR REPLACE FUNCTION public.create_driver_pickup_task(
  p_runner_id uuid,
  p_driver_id uuid,
  p_pickup_date date,
  p_notes text,
  p_items jsonb,
  p_source_order_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_source_order_codes text[] DEFAULT ARRAY[]::text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pickup_id uuid;
  v_item jsonb;
  v_business_date date := (now() AT TIME ZONE 'Asia/Brunei')::date;
BEGIN
  IF NOT public.can_manage_driver_pickup_scope(p_runner_id) THEN
    RAISE EXCEPTION 'Not authorized to create pickups for this runner';
  END IF;

  IF p_pickup_date <> v_business_date THEN
    RAISE EXCEPTION 'Pickups can only be created for today';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.runner_drivers rd
    WHERE rd.runner_id = p_runner_id
      AND rd.driver_id = p_driver_id
      AND rd.is_active = true
  ) THEN
    RAISE EXCEPTION 'Driver is not active under this runner';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.driver_pickups dp
    WHERE dp.driver_id = p_driver_id
      AND dp.pickup_date = v_business_date
      AND dp.status <> 'CANCELLED'
  ) THEN
    RAISE EXCEPTION 'This driver already has a pickup scheduled for today';
  END IF;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array'
    OR jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'At least one pickup item is required';
  END IF;

  INSERT INTO public.driver_pickups (
    runner_id,
    driver_id,
    pickup_date,
    notes,
    created_by,
    source_order_ids,
    source_order_codes
  )
  VALUES (
    p_runner_id,
    p_driver_id,
    p_pickup_date,
    NULLIF(BTRIM(p_notes), ''),
    auth.uid(),
    COALESCE(p_source_order_ids, ARRAY[]::uuid[]),
    COALESCE(p_source_order_codes, ARRAY[]::text[])
  )
  RETURNING id INTO v_pickup_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.driver_pickup_items (
      pickup_id,
      product_id,
      qty,
      required_qty,
      buffer_qty
    )
    VALUES (
      v_pickup_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'qty')::integer,
      NULLIF(v_item->>'required_qty', '')::integer,
      COALESCE(NULLIF(v_item->>'buffer_qty', '')::integer, 0)
    );
  END LOOP;

  RETURN v_pickup_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_driver_pickup_task(
  p_pickup_id uuid,
  p_pickup_date date,
  p_notes text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pickup public.driver_pickups%ROWTYPE;
  v_item jsonb;
  v_business_date date := (now() AT TIME ZONE 'Asia/Brunei')::date;
BEGIN
  SELECT * INTO v_pickup
  FROM public.driver_pickups
  WHERE id = p_pickup_id
  FOR UPDATE;

  IF v_pickup.id IS NULL OR NOT public.can_manage_driver_pickup_scope(v_pickup.runner_id) THEN
    RAISE EXCEPTION 'Pickup not found or not authorized';
  END IF;

  IF v_pickup.pickup_date <> v_business_date OR p_pickup_date <> v_business_date THEN
    RAISE EXCEPTION 'Expired pickups cannot be edited; create a new pickup for today';
  END IF;

  IF v_pickup.status IN ('COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Completed or cancelled pickups cannot be edited';
  END IF;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array'
    OR jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'At least one pickup item is required';
  END IF;

  UPDATE public.driver_pickups
  SET notes = NULLIF(BTRIM(p_notes), ''),
      updated_at = now()
  WHERE id = p_pickup_id;

  DELETE FROM public.driver_pickup_items WHERE pickup_id = p_pickup_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.driver_pickup_items (
      pickup_id,
      product_id,
      qty,
      required_qty,
      buffer_qty
    )
    VALUES (
      p_pickup_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'qty')::integer,
      NULLIF(v_item->>'required_qty', '')::integer,
      COALESCE(NULLIF(v_item->>'buffer_qty', '')::integer, 0)
    );
  END LOOP;

  RETURN p_pickup_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_driver_pickup_task(p_pickup_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pickup public.driver_pickups%ROWTYPE;
  v_business_date date := (now() AT TIME ZONE 'Asia/Brunei')::date;
BEGIN
  SELECT * INTO v_pickup
  FROM public.driver_pickups
  WHERE id = p_pickup_id
  FOR UPDATE;

  IF v_pickup.id IS NULL OR NOT public.can_manage_driver_pickup_scope(v_pickup.runner_id) THEN
    RAISE EXCEPTION 'Pickup not found or not authorized';
  END IF;

  IF v_pickup.pickup_date <> v_business_date THEN
    RAISE EXCEPTION 'Expired pickups cannot be completed; create a new pickup for today';
  END IF;

  IF v_pickup.status <> 'DRIVER_ACKED' THEN
    RAISE EXCEPTION 'Pickup must be acknowledged by the driver before completion';
  END IF;

  UPDATE public.driver_pickup_items
  SET collected_qty = qty
  WHERE pickup_id = p_pickup_id;

  UPDATE public.driver_pickups
  SET status = 'COMPLETED',
      completed_at = COALESCE(completed_at, now()),
      updated_at = now()
  WHERE id = p_pickup_id;

  RETURN p_pickup_id;
END;
$$;

DROP POLICY IF EXISTS "Driver can acknowledge their pickups" ON public.driver_pickups;

CREATE POLICY "Driver can acknowledge their pickups"
  ON public.driver_pickups
  FOR UPDATE
  USING (
    driver_id = auth.uid()
    AND status = 'PENDING_DRIVER_ACK'
    AND pickup_date = (now() AT TIME ZONE 'Asia/Brunei')::date
  )
  WITH CHECK (
    driver_id = auth.uid()
    AND status = 'DRIVER_ACKED'
    AND pickup_date = (now() AT TIME ZONE 'Asia/Brunei')::date
  );

CREATE OR REPLACE FUNCTION public.create_driver_return_task(
  p_runner_id uuid,
  p_related_pickup_id uuid,
  p_notes text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return_id uuid;
  v_item jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.runner_drivers rd
    WHERE rd.runner_id = p_runner_id
      AND rd.driver_id = auth.uid()
      AND rd.is_active = true
  ) THEN
    RAISE EXCEPTION 'Driver is not active under this runner';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.driver_returns dr
    WHERE dr.driver_id = auth.uid()
      AND dr.status = 'PENDING_RUNNER_ACK'
  ) THEN
    RAISE EXCEPTION 'A return is already waiting for runner acknowledgement';
  END IF;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array'
    OR jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'At least one return item is required';
  END IF;

  INSERT INTO public.driver_returns (
    driver_id,
    runner_id,
    related_pickup_id,
    notes
  )
  VALUES (
    auth.uid(),
    p_runner_id,
    p_related_pickup_id,
    NULLIF(BTRIM(p_notes), '')
  )
  RETURNING id INTO v_return_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.driver_return_items (
      return_id,
      product_id,
      qty
    )
    VALUES (
      v_return_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'qty')::integer
    );
  END LOOP;

  RETURN v_return_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_driver_return_task(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_driver_return_task(uuid, uuid, text, jsonb)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_driver_pickup_task(uuid, uuid, date, text, jsonb, uuid[], text[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_driver_pickup_task(uuid, date, text, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_driver_pickup_task(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
