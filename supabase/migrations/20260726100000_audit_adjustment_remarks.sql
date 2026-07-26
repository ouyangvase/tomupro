DROP FUNCTION IF EXISTS public.get_audit_adjustment_sources(uuid, uuid);

CREATE FUNCTION public.get_audit_adjustment_sources(
  p_warehouse_id uuid,
  p_product_id uuid
)
RETURNS TABLE(
  id uuid,
  adjustment_date timestamptz,
  qty integer,
  movement_type text,
  reference_type text,
  created_by_name text,
  remark text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    sm.id,
    sm.created_at AS adjustment_date,
    sm.qty_change AS qty,
    sm.movement_type::text,
    sm.reference_type::text,
    COALESCE(p.display_name, 'System') AS created_by_name,
    NULLIF(BTRIM(audit.after_json->>'reason'), '') AS remark
  FROM public.stock_movements sm
  LEFT JOIN public.profiles p ON p.id = sm.created_by
  LEFT JOIN LATERAL (
    SELECT log.after_json
    FROM public.audit_logs log
    WHERE log.entity_type = 'stock_movement'
      AND log.entity_id = sm.id
      AND log.action IN ('ADJUSTMENT_CREATED', 'RETURN_CREATED')
    ORDER BY log.created_at DESC
    LIMIT 1
  ) audit ON true
  WHERE sm.warehouse_id = p_warehouse_id
    AND sm.product_id = p_product_id
    AND sm.movement_type IN ('ADJUSTMENT', 'RETURN')
  ORDER BY sm.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_audit_adjustment_sources(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_audit_adjustment_sources(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_audit_adjustment_sources(uuid, uuid) IS
  'Returns stock adjustment source records with the admin-entered audit reason as remark.';
