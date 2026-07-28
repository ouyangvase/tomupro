-- Preserve the existing booking FIFO allocation result while avoiding no-op
-- rewrites of every active booking item and order on each recalculation.
CREATE OR REPLACE FUNCTION public.perform_booking_allocation_recalc()
RETURNS TABLE(
  fully_allocated integer,
  partial_allocated integer,
  out_of_stock integer,
  waiting_restock integer,
  allocation_conflict integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  item_record record;
  available_qty integer;
  reserve_qty integer;
  required integer;
  target_item_status text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS tmp_inventory_allocation_stock (
    product_id uuid PRIMARY KEY,
    remaining_qty integer NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE tmp_inventory_allocation_stock;

  INSERT INTO tmp_inventory_allocation_stock (product_id, remaining_qty)
  SELECT
    sb.product_id,
    GREATEST(COALESCE(SUM(sb.balance_qty), 0), 0)::integer
  FROM public.stock_balance_view sb
  WHERE sb.product_id IS NOT NULL
  GROUP BY sb.product_id;

  INSERT INTO tmp_inventory_allocation_stock (product_id, remaining_qty)
  SELECT DISTINCT oi.product_id, 0
  FROM public.order_items oi
  WHERE oi.product_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM tmp_inventory_allocation_stock s
      WHERE s.product_id = oi.product_id
    )
  ON CONFLICT (product_id) DO NOTHING;

  -- Existing ready orders reserve stock before booking FIFO allocation.
  UPDATE tmp_inventory_allocation_stock s
  SET remaining_qty = GREATEST(s.remaining_qty - COALESCE(r.reserved_qty, 0), 0)
  FROM (
    SELECT
      oi.product_id,
      SUM(GREATEST(COALESCE(oi.reserved_qty, oi.required_qty, oi.qty, 0), 0))::integer AS reserved_qty
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.status = 'READY'
      AND o.runner_status NOT IN ('DELIVERED', 'FAILED_DELIVERY')
      AND oi.product_id IS NOT NULL
    GROUP BY oi.product_id
  ) r
  WHERE s.product_id = r.product_id;

  FOR item_record IN
    SELECT
      oi.id,
      oi.product_id,
      GREATEST(COALESCE(oi.required_qty, oi.qty, 0), 0)::integer AS required_qty
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.status = 'BOOKING'
      AND o.runner_status NOT IN ('DELIVERED', 'FAILED_DELIVERY')
      AND COALESCE(o.inventory_status, '') <> 'WAITING_RESTOCK'
    ORDER BY o.created_at ASC, o.order_code ASC, oi.created_at ASC, oi.id ASC
  LOOP
    required := item_record.required_qty;
    available_qty := 0;

    IF item_record.product_id IS NOT NULL THEN
      SELECT COALESCE(s.remaining_qty, 0)
      INTO available_qty
      FROM tmp_inventory_allocation_stock s
      WHERE s.product_id = item_record.product_id;
    END IF;

    reserve_qty := LEAST(required, GREATEST(COALESCE(available_qty, 0), 0));
    target_item_status := CASE
      WHEN required = 0 THEN 'FULLY_ALLOCATED'
      WHEN reserve_qty >= required THEN 'FULLY_ALLOCATED'
      WHEN reserve_qty > 0 THEN 'PARTIAL_ALLOCATED'
      ELSE 'OUT_OF_STOCK'
    END;

    UPDATE public.order_items
    SET
      required_qty = required,
      reserved_qty = reserve_qty,
      shortage_qty = GREATEST(required - reserve_qty, 0),
      allocation_status = target_item_status
    WHERE id = item_record.id
      AND (
        required_qty IS DISTINCT FROM required
        OR reserved_qty IS DISTINCT FROM reserve_qty
        OR shortage_qty IS DISTINCT FROM GREATEST(required - reserve_qty, 0)
        OR allocation_status IS DISTINCT FROM target_item_status
      );

    IF item_record.product_id IS NOT NULL THEN
      UPDATE tmp_inventory_allocation_stock
      SET remaining_qty = GREATEST(remaining_qty - reserve_qty, 0)
      WHERE product_id = item_record.product_id;
    END IF;
  END LOOP;

  WITH item_summary AS (
    SELECT
      oi.order_id,
      COUNT(*) AS item_count,
      SUM(GREATEST(COALESCE(oi.required_qty, oi.qty, 0), 0)) AS required_sum,
      SUM(GREATEST(COALESCE(oi.reserved_qty, 0), 0)) AS reserved_sum,
      SUM(GREATEST(COALESCE(oi.shortage_qty, 0), 0)) AS shortage_sum
    FROM public.order_items oi
    GROUP BY oi.order_id
  ),
  target_status AS (
    SELECT
      o.id,
      CASE
        WHEN o.inventory_status = 'WAITING_RESTOCK' THEN 'WAITING_RESTOCK'
        WHEN s.item_count IS NULL THEN 'OUT_OF_STOCK'
        WHEN COALESCE(s.required_sum, 0) = 0 THEN 'FULLY_ALLOCATED'
        WHEN COALESCE(s.shortage_sum, 0) = 0 THEN 'FULLY_ALLOCATED'
        WHEN COALESCE(s.reserved_sum, 0) > 0 THEN 'PARTIAL_ALLOCATED'
        ELSE 'OUT_OF_STOCK'
      END AS value
    FROM public.orders o
    JOIN item_summary s ON s.order_id = o.id
    WHERE o.status = 'BOOKING'
      AND o.runner_status NOT IN ('DELIVERED', 'FAILED_DELIVERY')
  )
  UPDATE public.orders o
  SET
    inventory_status = target.value,
    allocation_status = target.value,
    allocation_checked_at = now()
  FROM target_status target
  WHERE o.id = target.id
    AND (
      o.inventory_status IS DISTINCT FROM target.value
      OR o.allocation_status IS DISTINCT FROM target.value
    );

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE o.inventory_status = 'FULLY_ALLOCATED')::integer,
    COUNT(*) FILTER (WHERE o.inventory_status = 'PARTIAL_ALLOCATED')::integer,
    COUNT(*) FILTER (WHERE o.inventory_status = 'OUT_OF_STOCK')::integer,
    COUNT(*) FILTER (WHERE o.inventory_status = 'WAITING_RESTOCK')::integer,
    COUNT(*) FILTER (WHERE o.inventory_status = 'ALLOCATION_CONFLICT')::integer
  FROM public.orders o
  WHERE o.status = 'BOOKING'
    AND o.runner_status NOT IN ('DELIVERED', 'FAILED_DELIVERY');
END;
$function$;
