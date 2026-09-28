-- Include the fields required by the existing Pulse One receiver while
-- retaining runner_status = DELIVERED as the only source event.

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
    o.address,
    o.area,
    o.payment_method,
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
      'full_address', v_order.address,
      'area', v_order.area,
      'payment_type', v_order.payment_method,
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

NOTIFY pgrst, 'reload schema';
