-- One source of truth for driver assignments, pickup suggestions, routes and analytics.

CREATE INDEX IF NOT EXISTS idx_orders_driver_assignment_scope
  ON public.orders (runner_id, driver_id, (COALESCE(next_delivery_date, expected_pickup_date, order_date)))
  WHERE driver_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_driver_assignment_source(
  p_runner_id uuid DEFAULT NULL,
  p_driver_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_active_only boolean DEFAULT false,
  p_include_items boolean DEFAULT true
)
RETURNS TABLE (
  order_id uuid,
  order_code text,
  runner_id uuid,
  driver_id uuid,
  driver_name text,
  operational_date date,
  assignment_state text,
  is_active_assignment boolean,
  collect_amount numeric,
  order_data jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    o.order_code,
    o.runner_id,
    o.driver_id,
    COALESCE(driver_profile.display_name, driver_profile.email, 'Unknown Driver')::text,
    public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date),
    CASE
      WHEN o.driver_status::text = 'DRIVER_DELIVERED'
        AND o.runner_accept_status::text = 'ACCEPTED' THEN 'DELIVERED'
      WHEN o.driver_status::text = 'DRIVER_FAILED' THEN 'FAILED'
      WHEN o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY') THEN 'ACTIVE'
      WHEN o.driver_status::text = 'DRIVER_DELIVERED' THEN 'PENDING_REVIEW'
      ELSE 'INACTIVE'
    END,
    o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY'),
    public.order_collection_amount(o.payment_method::text, o.total_amount),
    to_jsonb(o)
      || jsonb_build_object(
        'driver', jsonb_build_object(
          'id', driver_profile.id,
          'display_name', driver_profile.display_name,
          'email', driver_profile.email
        ),
        'order_items',
        CASE
          WHEN p_include_items THEN COALESCE((
            SELECT jsonb_agg(
              to_jsonb(oi)
              || jsonb_build_object(
                'product',
                CASE
                  WHEN product.id IS NULL THEN NULL
                  ELSE jsonb_build_object(
                    'id', product.id,
                    'sku_code', product.sku_code,
                    'sku_name', product.sku_name
                  )
                END
              )
              ORDER BY oi.created_at, oi.id
            )
            FROM public.order_items oi
            LEFT JOIN public.products product ON product.id = oi.product_id
            WHERE oi.order_id = o.id
          ), '[]'::jsonb)
          ELSE '[]'::jsonb
        END
      )
  FROM public.orders o
  LEFT JOIN public.profiles driver_profile ON driver_profile.id = o.driver_id
  WHERE o.driver_id IS NOT NULL
    AND COALESCE(o.status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
    AND COALESCE(o.runner_status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
    AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
    AND (p_driver_id IS NULL OR o.driver_id = p_driver_id)
    AND (
      p_date_from IS NULL
      OR public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) >= p_date_from
    )
    AND (
      p_date_to IS NULL
      OR public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) <= p_date_to
    )
    AND (
      p_active_only IS NOT TRUE
      OR o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
    )
    AND (
      public.get_user_role(auth.uid())::text = 'admin'
      OR (
        public.get_user_role(auth.uid())::text = 'runner'
        AND o.runner_id = auth.uid()
      )
      OR (
        public.get_user_role(auth.uid())::text = 'driver'
        AND o.driver_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.runner_assistants ra
        WHERE ra.assistant_id = auth.uid()
          AND ra.runner_id = o.runner_id
          AND ra.is_active = true
          AND (ra.can_manage_driver_inbox = true OR ra.can_manage_driver_stock = true)
      )
    )
  ORDER BY public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) DESC,
    o.created_at DESC,
    o.id;
$$;

REVOKE ALL ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean) IS
  'Canonical driver assignment source used by Runner Inbox, Driver Inbox, stock pickups, route, Driver App and analytics.';

-- Driver workload is a projection of the canonical assignment source.
CREATE OR REPLACE FUNCTION public.get_runner_dispatch_driver_workloads(p_operational_date date)
RETURNS TABLE (
  driver_id uuid,
  driver_name text,
  is_available boolean,
  assigned_order_count integer,
  collect_amount numeric,
  area_codes text[],
  area_names text[],
  capacity integer,
  remaining_capacity integer,
  notification_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH actor_scope AS (
    SELECT CASE
      WHEN public.get_user_role(auth.uid())::text = 'runner' THEN auth.uid()
      WHEN public.get_user_role(auth.uid())::text = 'runner_assistant' THEN (
        SELECT ra.runner_id
        FROM public.runner_assistants ra
        WHERE ra.assistant_id = auth.uid()
          AND ra.is_active = true
          AND (ra.can_manage_driver_inbox = true OR ra.can_manage_driver_stock = true)
        LIMIT 1
      )
      ELSE NULL::uuid
    END AS runner_id
  ),
  linked_drivers AS (
    SELECT
      rd.driver_id,
      COALESCE(p.display_name, p.email, 'Unknown Driver')::text AS driver_name,
      COALESCE(p.is_active, true) AND rd.is_active AS is_available,
      MAX(dap.capacity) AS capacity
    FROM public.runner_drivers rd
    CROSS JOIN actor_scope scope
    JOIN public.profiles p ON p.id = rd.driver_id
    LEFT JOIN public.driver_area_preferences dap
      ON dap.runner_id = rd.runner_id
      AND dap.driver_id = rd.driver_id
      AND dap.active = true
    WHERE rd.is_active = true
      AND (
        public.get_user_role(auth.uid())::text = 'admin'
        OR rd.runner_id = scope.runner_id
      )
    GROUP BY rd.driver_id, p.display_name, p.email, p.is_active, rd.is_active
  ),
  assignments AS (
    SELECT source.*
    FROM actor_scope scope
    CROSS JOIN LATERAL public.get_driver_assignment_source(
      scope.runner_id,
      NULL,
      p_operational_date,
      p_operational_date,
      true,
      false
    ) source
  )
  SELECT
    linked.driver_id,
    linked.driver_name,
    linked.is_available,
    COUNT(assignments.order_id)::integer,
    COALESCE(SUM(assignments.collect_amount), 0)::numeric,
    COALESCE(array_remove(array_agg(DISTINCT assignments.order_data->>'delivery_area_code'), NULL), ARRAY[]::text[]),
    COALESCE(array_remove(array_agg(DISTINCT COALESCE(
      assignments.order_data->>'delivery_area_name',
      assignments.order_data->>'area'
    )), NULL), ARRAY[]::text[]),
    linked.capacity,
    CASE
      WHEN linked.capacity IS NULL THEN NULL
      ELSE GREATEST(linked.capacity - COUNT(assignments.order_id)::integer, 0)
    END,
    'sent'::text
  FROM linked_drivers linked
  LEFT JOIN assignments ON assignments.driver_id = linked.driver_id
  GROUP BY linked.driver_id, linked.driver_name, linked.is_available, linked.capacity
  ORDER BY COUNT(assignments.order_id) DESC, linked.driver_name;
$$;

REVOKE ALL ON FUNCTION public.get_runner_dispatch_driver_workloads(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_runner_dispatch_driver_workloads(date) TO authenticated;

-- Pickup task audit and completion fields.
ALTER TABLE public.driver_pickups
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_order_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  ADD COLUMN IF NOT EXISTS source_order_codes text[] NOT NULL DEFAULT ARRAY[]::text[];

UPDATE public.driver_pickups
SET created_by = runner_id
WHERE created_by IS NULL;

ALTER TABLE public.driver_pickup_items
  ADD COLUMN IF NOT EXISTS collected_qty integer NOT NULL DEFAULT 0;

ALTER TABLE public.driver_pickups
  DROP CONSTRAINT IF EXISTS driver_pickups_status_check;

ALTER TABLE public.driver_pickups
  ADD CONSTRAINT driver_pickups_status_check
  CHECK (status IN ('PENDING_DRIVER_ACK', 'DRIVER_ACKED', 'COMPLETED', 'CANCELLED'));

ALTER TABLE public.driver_pickup_items
  DROP CONSTRAINT IF EXISTS driver_pickup_items_collected_qty_check;

ALTER TABLE public.driver_pickup_items
  ADD CONSTRAINT driver_pickup_items_collected_qty_check
  CHECK (collected_qty >= 0);

CREATE INDEX IF NOT EXISTS idx_driver_pickups_runner_schedule
  ON public.driver_pickups (runner_id, pickup_date DESC, status);

CREATE OR REPLACE FUNCTION public.can_manage_driver_pickup_scope(p_runner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.get_user_role(auth.uid())::text = 'admin'
    OR (
      public.get_user_role(auth.uid())::text = 'runner'
      AND p_runner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.runner_assistants ra
      WHERE ra.assistant_id = auth.uid()
        AND ra.runner_id = p_runner_id
        AND ra.is_active = true
        AND ra.can_manage_driver_stock = true
    );
$$;

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
BEGIN
  IF NOT public.can_manage_driver_pickup_scope(p_runner_id) THEN
    RAISE EXCEPTION 'Not authorized to create pickups for this runner';
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
BEGIN
  SELECT * INTO v_pickup
  FROM public.driver_pickups
  WHERE id = p_pickup_id
  FOR UPDATE;

  IF v_pickup.id IS NULL OR NOT public.can_manage_driver_pickup_scope(v_pickup.runner_id) THEN
    RAISE EXCEPTION 'Pickup not found or not authorized';
  END IF;

  IF v_pickup.status IN ('COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Completed or cancelled pickups cannot be edited';
  END IF;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array'
    OR jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'At least one pickup item is required';
  END IF;

  UPDATE public.driver_pickups
  SET pickup_date = p_pickup_date,
      notes = NULLIF(BTRIM(p_notes), ''),
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
BEGIN
  SELECT * INTO v_pickup
  FROM public.driver_pickups
  WHERE id = p_pickup_id
  FOR UPDATE;

  IF v_pickup.id IS NULL OR NOT public.can_manage_driver_pickup_scope(v_pickup.runner_id) THEN
    RAISE EXCEPTION 'Pickup not found or not authorized';
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

CREATE OR REPLACE FUNCTION public.cancel_driver_pickup_task(p_pickup_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pickup public.driver_pickups%ROWTYPE;
BEGIN
  SELECT * INTO v_pickup
  FROM public.driver_pickups
  WHERE id = p_pickup_id
  FOR UPDATE;

  IF v_pickup.id IS NULL OR NOT public.can_manage_driver_pickup_scope(v_pickup.runner_id) THEN
    RAISE EXCEPTION 'Pickup not found or not authorized';
  END IF;

  IF v_pickup.status <> 'PENDING_DRIVER_ACK' THEN
    RAISE EXCEPTION 'Only pickups awaiting driver acknowledgement can be cancelled';
  END IF;

  UPDATE public.driver_pickups
  SET status = 'CANCELLED',
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_pickup_id;

  RETURN p_pickup_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_driver_pickup_task(uuid, uuid, date, text, jsonb, uuid[], text[])
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_driver_pickup_task(uuid, date, text, jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_driver_pickup_task(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_driver_pickup_task(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_driver_pickup_task(uuid, uuid, date, text, jsonb, uuid[], text[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_driver_pickup_task(uuid, date, text, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_driver_pickup_task(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_driver_pickup_task(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
