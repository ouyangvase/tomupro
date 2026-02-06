-- Create a comprehensive delivered orders summary function that supports ALL filter params
-- This replaces client-side summary computation and avoids the 2000-row query limit truncation
CREATE OR REPLACE FUNCTION public.get_delivered_summary_filtered(
  p_runner_id uuid DEFAULT NULL,
  p_salesperson_id uuid DEFAULT NULL,
  p_salesperson_ids uuid[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_area text DEFAULT NULL,
  p_claim_status text DEFAULT NULL,
  p_driver_id uuid DEFAULT NULL,
  p_sku_code text DEFAULT NULL
)
RETURNS TABLE(total_delivered bigint, pending_claim bigint, total_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_orders AS (
    SELECT o.id, o.total_amount AS order_total, o.reconciliation_status
    FROM orders o
    WHERE o.runner_status = 'DELIVERED'
      AND o.status != 'CANCELLED'
      -- Role-based filters
      AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
      AND (p_salesperson_id IS NULL OR o.salesperson_id = p_salesperson_id)
      AND (p_salesperson_ids IS NULL OR o.salesperson_id = ANY(p_salesperson_ids))
      -- Search (order_code, customer_name, area)
      AND (p_search IS NULL OR p_search = '' OR 
           o.order_code ILIKE '%' || p_search || '%' OR
           o.customer_name ILIKE '%' || p_search || '%' OR
           o.area ILIKE '%' || p_search || '%')
      -- Area exact match
      AND (p_area IS NULL OR o.area = p_area)
      -- Claim status mapping (matches frontend ClaimStatusFilter logic)
      AND (p_claim_status IS NULL OR p_claim_status = 'all' OR
           (p_claim_status = 'NOT_CLAIMED' AND o.reconciliation_status = 'NOT_CLAIMED') OR
           (p_claim_status = 'CLAIM_SUBMITTED' AND o.reconciliation_status IN ('ADMIN_ACK_PENDING', 'SP_ACK_PENDING')) OR
           (p_claim_status = 'APPROVED' AND o.reconciliation_status IN ('CLAIMED', 'SETTLED')) OR
           (p_claim_status = 'REJECTED' AND o.reconciliation_status = 'DISPUTE'))
      -- Driver filter
      AND (p_driver_id IS NULL OR o.driver_id = p_driver_id)
      -- SKU filter: order must contain an item with this SKU code (uses EXISTS to avoid row multiplication)
      AND (p_sku_code IS NULL OR EXISTS (
        SELECT 1 FROM order_items oi
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = o.id
          AND (
            UPPER(TRIM(COALESCE(p.sku_code, ''))) = UPPER(TRIM(p_sku_code))
            OR UPPER(TRIM(SPLIT_PART(COALESCE(oi.sku_label, ''), '/', 1))) = UPPER(TRIM(p_sku_code))
          )
      ))
  )
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE reconciliation_status = 'NOT_CLAIMED')::bigint,
    COALESCE(SUM(order_total), 0)::numeric
  FROM filtered_orders;
END;
$$;