-- SNIPERS Pulse One Confirm Profit integration outbox.
-- Source of truth: TOMUPRO orders.runner_status = 'DELIVERED'.
-- Matching key sent to SNIPERS: orders.order_code as sales_entry_order_code.

CREATE TABLE IF NOT EXISTS public.snipers_delivery_events (
  event_id text PRIMARY KEY,
  tomupro_order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sales_entry_order_code text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN (
      'pending',
      'sending',
      'acknowledged',
      'failed',
      'unmatched',
      'needs_review',
      'authentication_failed'
    )),
  attempt_count integer NOT NULL DEFAULT 0,
  last_http_status integer,
  last_error text,
  last_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  acknowledged_at timestamptz,
  next_retry_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snipers_events_status_retry
  ON public.snipers_delivery_events (delivery_status, next_retry_at, created_at);

CREATE INDEX IF NOT EXISTS idx_snipers_events_order
  ON public.snipers_delivery_events (tomupro_order_id);

CREATE INDEX IF NOT EXISTS idx_snipers_events_order_code
  ON public.snipers_delivery_events (sales_entry_order_code);

ALTER TABLE public.snipers_delivery_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read snipers delivery events" ON public.snipers_delivery_events;
CREATE POLICY "Admins can read snipers delivery events"
  ON public.snipers_delivery_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Service role manages snipers delivery events" ON public.snipers_delivery_events;
CREATE POLICY "Service role manages snipers delivery events"
  ON public.snipers_delivery_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.build_snipers_order_delivered_payload(
  p_order_id uuid,
  p_event_id text,
  p_event_type text DEFAULT 'tomupro.order.delivered'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_items jsonb;
  v_primary_sku text;
  v_quantity integer;
  v_occurred_at timestamptz;
BEGIN
  SELECT
    o.id,
    o.order_code,
    o.customer_name,
    o.phone,
    o.total_qty,
    o.total_amount,
    o.runner_status,
    o.delivered_at,
    o.updated_at,
    o.owner_salesperson_display_name_snapshot,
    p.display_name AS salesperson_display_name
  INTO v_order
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.salesperson_id
  WHERE o.id = p_order_id;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'sku', COALESCE(pr.sku_code, oi.sku_label),
          'sku_label', oi.sku_label,
          'product_name', COALESCE(pr.sku_name, oi.sku_label, 'Unknown'),
          'quantity', oi.qty,
          'unit_price', oi.price,
          'line_total', oi.line_total
        )
        ORDER BY oi.created_at, oi.id
      ),
      '[]'::jsonb
    ),
    COALESCE(
      (array_agg(COALESCE(pr.sku_code, oi.sku_label) ORDER BY oi.created_at, oi.id))[1],
      NULL
    ),
    COALESCE(sum(oi.qty), 0)::integer
  INTO v_items, v_primary_sku, v_quantity
  FROM public.order_items oi
  LEFT JOIN public.products pr ON pr.id = oi.product_id
  WHERE oi.order_id = p_order_id;

  v_occurred_at := COALESCE(v_order.delivered_at, v_order.updated_at, now());

  RETURN jsonb_build_object(
    'event_id', p_event_id,
    'event_type', p_event_type,
    'occurred_at', v_occurred_at,
    'order', jsonb_build_object(
      'tomupro_order_id', v_order.id,
      'sales_entry_order_code', v_order.order_code,
      'customer_name', v_order.customer_name,
      'customer_phone', v_order.phone,
      'sku', v_primary_sku,
      'quantity', COALESCE(v_order.total_qty, v_quantity, 0),
      'amount', COALESCE(v_order.total_amount, 0),
      'profit_owner', COALESCE(v_order.owner_salesperson_display_name_snapshot, v_order.salesperson_display_name),
      'tracking_number', NULL,
      'delivery_status', lower(COALESCE(v_order.runner_status::text, 'delivered')),
      'delivered_at', v_order.delivered_at,
      'updated_at', v_order.updated_at,
      'items', v_items
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_snipers_delivery_event(
  p_order_id uuid,
  p_event_type text DEFAULT 'tomupro.order.delivered'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_event_id text;
  v_payload jsonb;
BEGIN
  SELECT id, order_code, runner_status
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF p_event_type = 'tomupro.order.delivered'
     AND v_order.runner_status IS DISTINCT FROM 'DELIVERED'::public.runner_status THEN
    RAISE EXCEPTION 'Order % is not delivered', p_order_id;
  END IF;

  v_event_id := p_event_type || ':' || p_order_id::text;
  v_payload := public.build_snipers_order_delivered_payload(p_order_id, v_event_id, p_event_type);

  INSERT INTO public.snipers_delivery_events (
    event_id,
    tomupro_order_id,
    sales_entry_order_code,
    event_type,
    payload,
    delivery_status,
    next_retry_at
  )
  VALUES (
    v_event_id,
    p_order_id,
    v_order.order_code,
    p_event_type,
    v_payload,
    'pending',
    now()
  )
  ON CONFLICT (event_id) DO UPDATE
  SET
    payload = CASE
      WHEN public.snipers_delivery_events.delivery_status = 'acknowledged'
        THEN public.snipers_delivery_events.payload
      ELSE EXCLUDED.payload
    END,
    sales_entry_order_code = EXCLUDED.sales_entry_order_code,
    delivery_status = CASE
      WHEN public.snipers_delivery_events.delivery_status IN ('acknowledged', 'unmatched', 'needs_review')
        THEN public.snipers_delivery_events.delivery_status
      ELSE 'pending'
    END,
    next_retry_at = CASE
      WHEN public.snipers_delivery_events.delivery_status IN ('acknowledged', 'unmatched', 'needs_review')
        THEN public.snipers_delivery_events.next_retry_at
      ELSE now()
    END,
    updated_at = now();

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_snipers_order_status_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.runner_status = 'DELIVERED'::public.runner_status
     AND OLD.runner_status IS DISTINCT FROM 'DELIVERED'::public.runner_status THEN
    BEGIN
      PERFORM public.enqueue_snipers_delivery_event(NEW.id, 'tomupro.order.delivered');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to enqueue SNIPERS delivered event for order %: %', NEW.id, SQLERRM;
    END;
  END IF;

  IF OLD.runner_status = 'DELIVERED'::public.runner_status
     AND NEW.runner_status IS DISTINCT FROM 'DELIVERED'::public.runner_status THEN
    BEGIN
      PERFORM public.enqueue_snipers_delivery_event(NEW.id, 'tomupro.delivery.reversed');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to enqueue SNIPERS reversal event for order %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_snipers_order_status_event ON public.orders;
CREATE TRIGGER trg_queue_snipers_order_status_event
  AFTER UPDATE OF runner_status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_snipers_order_status_event();

COMMENT ON TABLE public.snipers_delivery_events IS
  'Durable outbox for TOMUPRO delivered/reversal events sent to SNIPERS Pulse One Confirm Profit.';

COMMENT ON COLUMN public.snipers_delivery_events.sales_entry_order_code IS
  'SNIPERS Sales Entry Order Code. Current TOMUPRO source field is orders.order_code.';
