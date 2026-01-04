-- Drop and recreate the function with additional breakdown columns
DROP FUNCTION IF EXISTS public.get_driver_returnable_items();

CREATE FUNCTION public.get_driver_returnable_items()
 RETURNS TABLE(
   product_id uuid, 
   sku_code text, 
   sku_name text, 
   pickup_qty bigint,
   delivered_qty bigint,
   returned_qty bigint,
   available_qty bigint
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pickup AS (
    -- Total qty picked up and acknowledged by driver
    SELECT dpi.product_id, SUM(dpi.qty)::bigint AS pickup_qty
    FROM public.driver_pickups dp
    JOIN public.driver_pickup_items dpi ON dpi.pickup_id = dp.id
    WHERE dp.driver_id = auth.uid()
      AND dp.status = 'DRIVER_ACKED'
      AND dpi.product_id IS NOT NULL
    GROUP BY dpi.product_id
  ),
  delivered AS (
    -- Only count orders that are FULLY delivered (runner accepted)
    -- DRIVER_DELIVERED alone is not consumed yet - runner must accept
    -- Failed deliveries do NOT consume stock!
    SELECT oi.product_id, SUM(oi.qty)::bigint AS delivered_qty
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.driver_id = auth.uid()
      AND oi.product_id IS NOT NULL
      AND o.runner_status = 'DELIVERED'
      AND o.runner_accept_status = 'ACCEPTED'
    GROUP BY oi.product_id
  ),
  returned AS (
    -- Items already returned (pending or acknowledged, not cancelled)
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
    COALESCE(p.pickup_qty, 0) AS pickup_qty,
    COALESCE(d.delivered_qty, 0) AS delivered_qty,
    COALESCE(r.returned_qty, 0) AS returned_qty,
    GREATEST(
      COALESCE(p.pickup_qty, 0)
      - COALESCE(d.delivered_qty, 0)
      - COALESCE(r.returned_qty, 0),
      0
    ) AS available_qty
  FROM pickup p
  JOIN public.products pr ON pr.id = p.product_id
  LEFT JOIN delivered d ON d.product_id = p.product_id
  LEFT JOIN returned r ON r.product_id = p.product_id
  WHERE GREATEST(
      COALESCE(p.pickup_qty, 0)
      - COALESCE(d.delivered_qty, 0)
      - COALESCE(r.returned_qty, 0),
      0
    ) > 0
  ORDER BY pr.sku_code NULLS LAST, pr.sku_name;
$function$;