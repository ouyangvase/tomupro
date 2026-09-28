-- Inventory: make stock-balance table sorting work across server-side pages.
-- The frontend sends a whitelisted field/direction; invalid values fall back safely.

CREATE OR REPLACE FUNCTION public.get_stock_balance_paginated(
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 50,
  p_search TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_hide_zero BOOLEAN DEFAULT TRUE,
  p_sort_field TEXT DEFAULT 'owner_name',
  p_sort_direction TEXT DEFAULT 'asc'
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
  v_sort_field TEXT := CASE LOWER(TRIM(COALESCE(p_sort_field, 'owner_name')))
    WHEN 'owner_name' THEN 'owner_name'
    WHEN 'warehouse_name' THEN 'warehouse_name'
    WHEN 'sku_name' THEN 'sku_name'
    WHEN 'balance_qty' THEN 'balance_qty'
    WHEN 'last_movement_time' THEN 'last_movement_time'
    ELSE 'owner_name'
  END;
  v_sort_direction TEXT := CASE LOWER(TRIM(COALESCE(p_sort_direction, 'asc')))
    WHEN 'desc' THEN 'desc'
    ELSE 'asc'
  END;
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
          AND (
            v_search = '' OR
            LOWER(v.sku_name) LIKE '%' || v_search || '%' OR
            LOWER(COALESCE(v.sku_code, '')) LIKE '%' || v_search || '%' OR
            LOWER(v.owner_name) LIKE '%' || v_search || '%'
          )
        ORDER BY
          CASE WHEN v_sort_field = 'owner_name' AND v_sort_direction = 'asc' THEN v.owner_name END ASC NULLS LAST,
          CASE WHEN v_sort_field = 'owner_name' AND v_sort_direction = 'desc' THEN v.owner_name END DESC NULLS LAST,
          CASE WHEN v_sort_field = 'warehouse_name' AND v_sort_direction = 'asc' THEN v.warehouse_name END ASC NULLS LAST,
          CASE WHEN v_sort_field = 'warehouse_name' AND v_sort_direction = 'desc' THEN v.warehouse_name END DESC NULLS LAST,
          CASE WHEN v_sort_field = 'sku_name' AND v_sort_direction = 'asc' THEN v.sku_name END ASC NULLS LAST,
          CASE WHEN v_sort_field = 'sku_name' AND v_sort_direction = 'desc' THEN v.sku_name END DESC NULLS LAST,
          CASE WHEN v_sort_field = 'balance_qty' AND v_sort_direction = 'asc' THEN v.balance_qty END ASC NULLS LAST,
          CASE WHEN v_sort_field = 'balance_qty' AND v_sort_direction = 'desc' THEN v.balance_qty END DESC NULLS LAST,
          CASE WHEN v_sort_field = 'last_movement_time' AND v_sort_direction = 'asc' THEN v.last_movement_time END ASC NULLS LAST,
          CASE WHEN v_sort_field = 'last_movement_time' AND v_sort_direction = 'desc' THEN v.last_movement_time END DESC NULLS LAST,
          v.owner_name ASC NULLS LAST,
          v.sku_code ASC NULLS LAST,
          v.warehouse_id ASC,
          v.product_id ASC
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
        AND (
          v_search = '' OR
          LOWER(v.sku_name) LIKE '%' || v_search || '%' OR
          LOWER(COALESCE(v.sku_code, '')) LIKE '%' || v_search || '%' OR
          LOWER(v.owner_name) LIKE '%' || v_search || '%'
        )
    ), 0)
  ) INTO result;

  RETURN result;
END;
$$;
