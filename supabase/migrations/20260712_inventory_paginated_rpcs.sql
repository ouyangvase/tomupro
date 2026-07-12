-- Inventory Refactor: Server-side paginated stock balance + stats RPCs
-- Replaces client-side batched fetching (1000-row chunks) with true server-side pagination.

-- ============================================================
-- 1. PAGINATED STOCK BALANCE
-- Returns a JSON envelope with rows + total_count for server-side pagination
-- ============================================================
CREATE OR REPLACE FUNCTION get_stock_balance_paginated(
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 50,
  p_search TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_hide_zero BOOLEAN DEFAULT TRUE
)
RETURNS JSON
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result JSON;
  v_offset INT := (GREATEST(p_page, 1) - 1) * p_page_size;
  v_search TEXT := LOWER(TRIM(COALESCE(p_search, '')));
BEGIN
  SELECT json_build_object(
    'rows', COALESCE((
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT
          v.warehouse_id,
          v.warehouse_name,
          v.owner_user_id,
          v.owner_name,
          v.product_id,
          v.sku_code,
          v.sku_name,
          v.balance_qty,
          v.last_movement_time,
          COUNT(*) OVER() AS _total_count
        FROM v_stock_balance_computed v
        INNER JOIN warehouses w ON w.id = v.warehouse_id
        WHERE can_view_stock(w.owner_user_id, auth.uid())
          AND (p_owner_id IS NULL OR v.owner_user_id = p_owner_id)
          AND (NOT p_hide_zero OR v.balance_qty > 0)
          AND (v_search = '' OR
               LOWER(v.sku_name) LIKE '%' || v_search || '%' OR
               LOWER(COALESCE(v.sku_code, '')) LIKE '%' || v_search || '%' OR
               LOWER(v.owner_name) LIKE '%' || v_search || '%')
        ORDER BY v.owner_name, v.sku_code NULLS LAST
        LIMIT p_page_size
        OFFSET v_offset
      ) t
    ), '[]'::json),
    'total_count', COALESCE((
      SELECT COUNT(*)
      FROM v_stock_balance_computed v
      INNER JOIN warehouses w ON w.id = v.warehouse_id
      WHERE can_view_stock(w.owner_user_id, auth.uid())
        AND (p_owner_id IS NULL OR v.owner_user_id = p_owner_id)
        AND (NOT p_hide_zero OR v.balance_qty > 0)
        AND (v_search = '' OR
             LOWER(v.sku_name) LIKE '%' || v_search || '%' OR
             LOWER(COALESCE(v.sku_code, '')) LIKE '%' || v_search || '%' OR
             LOWER(v.owner_name) LIKE '%' || v_search || '%')
    ), 0)
  ) INTO result;

  RETURN result;
END;
$$;

-- ============================================================
-- 2. STOCK BALANCE STATS
-- Returns aggregate metrics from the full visible dataset
-- ============================================================
CREATE OR REPLACE FUNCTION get_stock_balance_stats(
  p_owner_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_skus', COUNT(*),
    'total_qty', COALESCE(SUM(v.balance_qty), 0),
    'healthy_count', COUNT(*) FILTER (WHERE v.balance_qty > 10),
    'low_out_count', COUNT(*) FILTER (WHERE v.balance_qty <= 0)
  ) INTO result
  FROM v_stock_balance_computed v
  INNER JOIN warehouses w ON w.id = v.warehouse_id
  WHERE can_view_stock(w.owner_user_id, auth.uid())
    AND (p_owner_id IS NULL OR v.owner_user_id = p_owner_id);

  RETURN result;
END;
$$;
