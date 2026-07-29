-- Keep Driver Inbox area assignment on one canonical field. Older imports store
-- KB/TTG/TEMB in orders.area, while dispatch RPCs validate delivery_area_code.

CREATE OR REPLACE FUNCTION public.legacy_order_area_code(p_area text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE upper(btrim(COALESCE(p_area, '')))
    WHEN 'KB' THEN 'BELAIT'
    WHEN 'TTG' THEN 'TUTONG'
    WHEN 'TEMB' THEN 'TEMBURONG'
    WHEN 'BELAIT' THEN 'BELAIT'
    WHEN 'TUTONG' THEN 'TUTONG'
    WHEN 'TEMBURONG' THEN 'TEMBURONG'
    WHEN 'BM_GADONG_RIMBA' THEN 'BM_GADONG_RIMBA'
    WHEN 'BM_BERAKAS_LAMBAK' THEN 'BM_BERAKAS_LAMBAK'
    WHEN 'BM_MENTIRI_MUARA' THEN 'BM_MENTIRI_MUARA'
    WHEN 'BM_JERUDONG_SENGKURONG' THEN 'BM_JERUDONG_SENGKURONG'
    WHEN 'BM_SOUTHWEST' THEN 'BM_SOUTHWEST'
    WHEN 'BM_BANDAR_LUMAPAS' THEN 'BM_BANDAR_LUMAPAS'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.canonicalize_order_delivery_area()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_area_code text;
  v_area_name text;
BEGIN
  IF NEW.delivery_area_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_area_code := public.classify_delivery_area(NEW.address, NEW.status::text)->>'delivery_area';
  IF v_area_code IS NULL OR v_area_code = 'NEEDS_REVIEW' THEN
    v_area_code := public.legacy_order_area_code(NEW.area);
  END IF;

  IF v_area_code IS NULL OR v_area_code = 'NEEDS_REVIEW' THEN
    RETURN NEW;
  END IF;

  SELECT name
  INTO v_area_name
  FROM public.delivery_areas
  WHERE code = v_area_code
    AND active = true;

  IF v_area_name IS NOT NULL THEN
    NEW.delivery_area_code := v_area_code;
    NEW.delivery_area_name := v_area_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canonicalize_order_delivery_area ON public.orders;
CREATE TRIGGER trg_canonicalize_order_delivery_area
  BEFORE INSERT OR UPDATE OF address, area, status, delivery_area_code
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.canonicalize_order_delivery_area();

UPDATE public.orders o
SET delivery_area_code = resolved.code,
    delivery_area_name = resolved.name
FROM (
  SELECT o2.id, da.code, da.name
  FROM public.orders o2
  JOIN public.delivery_areas da
    ON da.code = public.legacy_order_area_code(o2.area)
   AND da.active = true
   AND da.is_special = false
  WHERE o2.delivery_area_code IS NULL
    AND COALESCE(
      public.classify_delivery_area(o2.address, o2.status::text)->>'delivery_area',
      'NEEDS_REVIEW'
    ) = 'NEEDS_REVIEW'
) resolved
WHERE o.id = resolved.id;

-- Source-of-truth IDs used by Assign Remaining. Delegated assistants receive
-- the same runner scope only when Driver Inbox permission is enabled.
CREATE OR REPLACE FUNCTION public.get_runner_dispatch_area_order_ids(
  p_operational_date date,
  p_delivery_area_code text,
  p_unassigned_only boolean DEFAULT true
)
RETURNS TABLE (
  order_id uuid,
  order_code text,
  delivery_area_code text,
  delivery_area_name text,
  collect_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      o.id,
      o.order_code,
      o.driver_id,
      o.driver_status,
      COALESCE(
        o.delivery_area_code,
        public.classify_delivery_area(o.address, o.status::text)->>'delivery_area',
        public.legacy_order_area_code(o.area)
      ) AS resolved_area_code,
      public.order_collection_amount(o.payment_method::text, o.total_amount) AS collect_amount
    FROM public.orders o
    WHERE (
        (
          p_operational_date IS NULL
          AND public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)
        )
        OR (
          p_operational_date IS NOT NULL
          AND public.order_operational_date(
            o.next_delivery_date,
            o.expected_pickup_date,
            o.order_date
          ) = p_operational_date
        )
      )
      AND (
        public.get_user_role(auth.uid())::text = 'admin'
        OR (
          public.get_user_role(auth.uid())::text = 'runner'
          AND o.runner_id = auth.uid()
        )
        OR public.has_runner_assistant_permission(
          auth.uid(),
          o.runner_id,
          'driver_inbox'
        )
      )
  )
  SELECT
    s.id AS order_id,
    s.order_code,
    da.code AS delivery_area_code,
    da.name AS delivery_area_name,
    s.collect_amount
  FROM scoped s
  JOIN public.delivery_areas da ON da.code = s.resolved_area_code
  WHERE da.active = true
    AND da.is_special = false
    AND da.code = p_delivery_area_code
    AND (
      p_unassigned_only IS NOT TRUE
      OR s.driver_id IS NULL
      OR COALESCE(s.driver_status::text, 'UNASSIGNED') = 'UNASSIGNED'
    )
  ORDER BY s.order_code NULLS LAST, s.id
$$;

REVOKE ALL ON FUNCTION public.get_runner_dispatch_area_order_ids(date, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_runner_dispatch_area_order_ids(date, text, boolean) TO authenticated;
