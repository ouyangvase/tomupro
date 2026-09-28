-- Read-only set lookup for Assistant/multi-Runner views.
-- Each returned amount is resolved through the existing canonical
-- get_delivery_charge(runner_id, area) function.
CREATE OR REPLACE FUNCTION public.get_delivery_charges_for_runners(p_runner_ids UUID[])
RETURNS TABLE(
  runner_id UUID,
  area TEXT,
  charge_amount NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dc.runner_id,
    dc.area,
    public.get_delivery_charge(dc.runner_id, dc.area) AS charge_amount
  FROM public.delivery_charges AS dc
  WHERE dc.runner_id = ANY(COALESCE(p_runner_ids, ARRAY[]::UUID[]))
    AND dc.status = 'APPROVED'
    AND dc.superseded_at IS NULL
  ORDER BY dc.runner_id, dc.area;
$$;

REVOKE ALL ON FUNCTION public.get_delivery_charges_for_runners(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_delivery_charges_for_runners(UUID[]) TO authenticated;
