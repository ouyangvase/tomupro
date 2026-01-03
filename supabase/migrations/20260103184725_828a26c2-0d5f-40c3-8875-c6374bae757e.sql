-- Returnable items for drivers (excludes failed deliveries)
-- Definition:
-- available = total acknowledged pickup qty - delivered qty - failed qty - already returned qty

CREATE OR REPLACE FUNCTION public.get_driver_returnable_items()
RETURNS TABLE(
  product_id uuid,
  sku_code text,
  sku_name text,
  available_qty bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pickup AS (
    SELECT dpi.product_id, SUM(dpi.qty)::bigint AS pickup_qty
    FROM public.driver_pickups dp
    JOIN public.driver_pickup_items dpi ON dpi.pickup_id = dp.id
    WHERE dp.driver_id = auth.uid()
      AND dp.status = 'DRIVER_ACKED'
      AND dpi.product_id IS NOT NULL
    GROUP BY dpi.product_id
  ),
  delivered AS (
    SELECT oi.product_id, SUM(oi.qty)::bigint AS delivered_qty
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.driver_id = auth.uid()
      AND oi.product_id IS NOT NULL
      AND (o.runner_status = 'DELIVERED' OR o.driver_status = 'DRIVER_DELIVERED')
    GROUP BY oi.product_id
  ),
  failed AS (
    SELECT oi.product_id, SUM(oi.qty)::bigint AS failed_qty
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.driver_id = auth.uid()
      AND oi.product_id IS NOT NULL
      AND (o.runner_status = 'FAILED_DELIVERY' OR o.driver_status = 'DRIVER_FAILED')
    GROUP BY oi.product_id
  ),
  returned AS (
    SELECT dri.product_id, SUM(dri.qty)::bigint AS returned_qty
    FROM public.driver_returns dr
    JOIN public.driver_return_items dri ON dri.return_id = dr.id
    WHERE dr.driver_id = auth.uid()
      AND dr.status <> 'CANCELLED'
      AND dri.product_id IS NOT NULL
    GROUP BY dri.product_id
  )
  SELECT
    p.product_id,
    pr.sku_code,
    pr.sku_name,
    GREATEST(
      COALESCE(p.pickup_qty, 0)
      - COALESCE(d.delivered_qty, 0)
      - COALESCE(f.failed_qty, 0)
      - COALESCE(r.returned_qty, 0),
      0
    ) AS available_qty
  FROM pickup p
  JOIN public.products pr ON pr.id = p.product_id
  LEFT JOIN delivered d ON d.product_id = p.product_id
  LEFT JOIN failed f ON f.product_id = p.product_id
  LEFT JOIN returned r ON r.product_id = p.product_id
  WHERE GREATEST(
      COALESCE(p.pickup_qty, 0)
      - COALESCE(d.delivered_qty, 0)
      - COALESCE(f.failed_qty, 0)
      - COALESCE(r.returned_qty, 0),
      0
    ) > 0
  ORDER BY pr.sku_code NULLS LAST, pr.sku_name;
$$;

-- Validate return item qty at the database level
CREATE OR REPLACE FUNCTION public.validate_driver_return_item_qty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id uuid;
  v_pickup_qty bigint;
  v_delivered_qty bigint;
  v_failed_qty bigint;
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

  -- Delivered qty
  SELECT COALESCE(SUM(oi.qty), 0)::bigint INTO v_delivered_qty
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  WHERE o.driver_id = v_driver_id
    AND oi.product_id = NEW.product_id
    AND (o.runner_status = 'DELIVERED' OR o.driver_status = 'DRIVER_DELIVERED');

  -- Failed qty (excluded from returnable)
  SELECT COALESCE(SUM(oi.qty), 0)::bigint INTO v_failed_qty
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  WHERE o.driver_id = v_driver_id
    AND oi.product_id = NEW.product_id
    AND (o.runner_status = 'FAILED_DELIVERY' OR o.driver_status = 'DRIVER_FAILED');

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

  v_available := GREATEST(v_pickup_qty - v_delivered_qty - v_failed_qty - v_returned_qty, 0);

  IF NEW.qty > v_available THEN
    RAISE EXCEPTION 'Cannot return % item(s). Only % available to return.', NEW.qty, v_available;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_driver_return_item_qty ON public.driver_return_items;
CREATE TRIGGER validate_driver_return_item_qty
BEFORE INSERT OR UPDATE ON public.driver_return_items
FOR EACH ROW
EXECUTE FUNCTION public.validate_driver_return_item_qty();