-- Fix the view to be SECURITY INVOKER (not DEFINER)
DROP VIEW IF EXISTS public.v_my_packages;

CREATE VIEW public.v_my_packages 
WITH (security_invoker = true)
AS
SELECT 
  cp.id,
  cp.tracking_no,
  cp.owner_id,
  po.owner_name,
  cp.status,
  cp.batch_id,
  cp.intl_order_id,
  cp.latest_paid_at,
  cp.total_paid_cny,
  cp.weight_kg,
  cp.updated_at as last_updated_at,
  COALESCE(
    (SELECT array_agg(DISTINCT cps.sku_code) FILTER (WHERE cps.sku_code IS NOT NULL)
     FROM public.cn_package_skus cps 
     WHERE cps.package_id = cp.id),
    ARRAY[]::TEXT[]
  ) as sku_codes
FROM public.cn_packages cp
JOIN public.pc_owners po ON po.owner_id = cp.owner_id;