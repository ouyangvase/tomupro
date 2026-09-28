-- Stock Balance must include every active product in an active owner warehouse.
-- Previously products with no movement (new products awaiting inbound) were
-- removed by the view, making them impossible to find in Stock Balance.
CREATE OR REPLACE VIEW public.v_stock_balance_computed AS
WITH canonical_delivered AS (
  SELECT
    vd.product_id,
    SUM(vd.qty_delivered) AS delivered_qty
  FROM public.v_delivered_order_lines vd
  GROUP BY vd.product_id
), movement_totals AS (
  SELECT
    sm.warehouse_id,
    sm.product_id,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'INBOUND' THEN sm.qty_change ELSE 0 END), 0) AS inbound_qty,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'ADJUSTMENT' THEN sm.qty_change ELSE 0 END), 0) AS adjust_qty,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'TRANSFER_IN' THEN sm.qty_change ELSE 0 END), 0) AS transfer_in_qty,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'TRANSFER_OUT' THEN ABS(sm.qty_change) ELSE 0 END), 0) AS transfer_out_qty,
    MAX(sm.created_at) AS last_movement_time
  FROM public.stock_movements sm
  GROUP BY sm.warehouse_id, sm.product_id
)
SELECT
  w.id AS warehouse_id,
  w.name AS warehouse_name,
  w.owner_user_id,
  p_owner.display_name AS owner_name,
  pr.id AS product_id,
  pr.sku_code,
  pr.sku_name,
  COALESCE(mt.inbound_qty, 0)::bigint AS inbound_qty,
  COALESCE(mt.adjust_qty, 0)::bigint AS adjust_qty,
  COALESCE(mt.transfer_in_qty, 0)::bigint AS transfer_in_qty,
  COALESCE(mt.transfer_out_qty, 0)::bigint AS transfer_out_qty,
  COALESCE(cd.delivered_qty, 0)::bigint AS delivered_qty,
  (
    COALESCE(mt.inbound_qty, 0)
    + COALESCE(mt.adjust_qty, 0)
    + COALESCE(mt.transfer_in_qty, 0)
    - COALESCE(mt.transfer_out_qty, 0)
    - COALESCE(cd.delivered_qty, 0)
  )::bigint AS balance_qty,
  mt.last_movement_time
FROM public.warehouses w
JOIN public.profiles p_owner ON p_owner.id = w.owner_user_id
JOIN public.products pr ON pr.owner_user_id = w.owner_user_id AND pr.is_active = true
LEFT JOIN movement_totals mt ON mt.warehouse_id = w.id AND mt.product_id = pr.id
LEFT JOIN canonical_delivered cd ON cd.product_id = pr.id
WHERE w.is_active = true
  AND p_owner.role IN ('salesperson', 'manager', 'admin');
