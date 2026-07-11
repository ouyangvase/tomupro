-- =============================================
-- Source-based drilldown for Stock Audit
-- Returns actual source records (not just movement logs)
-- =============================================

-- 1) Inbound source records from inbound_items + inbound_shipments
CREATE OR REPLACE FUNCTION get_audit_inbound_sources(
  p_warehouse_id uuid,
  p_product_id uuid
)
RETURNS TABLE(
  id uuid,
  inbound_date timestamptz,
  tracking_no text,
  qty integer,
  created_by_name text,
  status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    sm.id,
    sm.created_at as inbound_date,
    COALESCE(
      (SELECT ish.tracking_no FROM inbound_shipments ish
       JOIN inbound_items ii ON ii.inbound_id = ish.id
       WHERE ii.id = sm.reference_id
       LIMIT 1),
      '-'
    ) as tracking_no,
    sm.qty_change as qty,
    COALESCE(p.display_name, 'System') as created_by_name,
    'INBOUND' as status
  FROM stock_movements sm
  LEFT JOIN profiles p ON p.id = sm.created_by
  WHERE sm.warehouse_id = p_warehouse_id
    AND sm.product_id = p_product_id
    AND sm.movement_type = 'INBOUND'
  ORDER BY sm.created_at DESC;
$$;

-- 2) Delivered order source records from orders + order_items (canonical)
CREATE OR REPLACE FUNCTION get_audit_delivered_sources(
  p_product_id uuid,
  p_owner_user_id uuid
)
RETURNS TABLE(
  id uuid,
  delivered_at timestamptz,
  order_code text,
  order_id uuid,
  qty integer,
  customer_name text,
  delivered_by_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    oi.id,
    o.delivered_at,
    o.order_code,
    o.id as order_id,
    oi.qty,
    o.customer_name,
    COALESCE(
      (SELECT dp.display_name FROM profiles dp WHERE dp.id = o.runner_id),
      'Unknown'
    ) as delivered_by_name
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE oi.product_id = p_product_id
    AND o.runner_status = 'DELIVERED'
    AND o.status != 'CANCELLED'
    AND (
      o.salesperson_id = p_owner_user_id
      OR EXISTS (
        SELECT 1 FROM products pr
        WHERE pr.id = p_product_id
          AND pr.owner_user_id = p_owner_user_id
      )
    )
  ORDER BY o.delivered_at DESC;
$$;

-- 3) Transfer source records
CREATE OR REPLACE FUNCTION get_audit_transfer_sources(
  p_warehouse_id uuid,
  p_product_id uuid
)
RETURNS TABLE(
  id uuid,
  transfer_date timestamptz,
  direction text,
  qty integer,
  counterpart_name text,
  created_by_name text,
  transfer_status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    sm.id,
    sm.created_at as transfer_date,
    CASE
      WHEN sm.movement_type = 'TRANSFER_IN' THEN 'IN'
      ELSE 'OUT'
    END as direction,
    sm.qty_change as qty,
    COALESCE(
      CASE
        WHEN sm.movement_type = 'TRANSFER_IN' THEN
          (SELECT pw.name FROM stock_transfers st
           JOIN warehouses pw ON pw.id = st.from_warehouse_id
           WHERE st.id = sm.reference_id LIMIT 1)
        ELSE
          (SELECT pw.name FROM stock_transfers st
           JOIN warehouses pw ON pw.id = st.to_warehouse_id
           WHERE st.id = sm.reference_id LIMIT 1)
      END,
      'Unknown'
    ) as counterpart_name,
    COALESCE(p.display_name, 'System') as created_by_name,
    sm.movement_type::text as transfer_status
  FROM stock_movements sm
  LEFT JOIN profiles p ON p.id = sm.created_by
  WHERE sm.warehouse_id = p_warehouse_id
    AND sm.product_id = p_product_id
    AND sm.movement_type IN ('TRANSFER_IN', 'TRANSFER_OUT')
  ORDER BY sm.created_at DESC;
$$;

-- 4) Adjustment source records
CREATE OR REPLACE FUNCTION get_audit_adjustment_sources(
  p_warehouse_id uuid,
  p_product_id uuid
)
RETURNS TABLE(
  id uuid,
  adjustment_date timestamptz,
  qty integer,
  movement_type text,
  reference_type text,
  created_by_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    sm.id,
    sm.created_at as adjustment_date,
    sm.qty_change as qty,
    sm.movement_type::text,
    sm.reference_type::text,
    COALESCE(p.display_name, 'System') as created_by_name
  FROM stock_movements sm
  LEFT JOIN profiles p ON p.id = sm.created_by
  WHERE sm.warehouse_id = p_warehouse_id
    AND sm.product_id = p_product_id
    AND sm.movement_type IN ('ADJUSTMENT', 'RETURN')
  ORDER BY sm.created_at DESC;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_audit_inbound_sources(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_delivered_sources(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_transfer_sources(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_adjustment_sources(uuid, uuid) TO authenticated;
