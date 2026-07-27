-- Self-service warehouse sharing.
-- A share grants read access to the owner's stock and permission to use an
-- active owner warehouse as the inventory source for new orders.

CREATE INDEX IF NOT EXISTS idx_stock_visibility_overrides_owner_active
  ON public.stock_visibility_overrides (owner_user_id, created_at DESC)
  WHERE can_view = true;

DROP POLICY IF EXISTS "Owners can view inventory shares they created"
  ON public.stock_visibility_overrides;

CREATE POLICY "Owners can view inventory shares they created"
  ON public.stock_visibility_overrides
  FOR SELECT
  USING (owner_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.share_inventory_with_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id uuid := auth.uid();
  v_viewer_id uuid;
  v_share_id uuid;
  v_email text := lower(trim(COALESCE(p_email, '')));
BEGIN
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_email = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  SELECT p.id
    INTO v_viewer_id
  FROM public.profiles p
  WHERE lower(trim(p.email)) = v_email
    AND p.is_active = true
  LIMIT 1;

  IF v_viewer_id IS NULL THEN
    RAISE EXCEPTION 'No active TOMUPRO user found for that email';
  END IF;

  IF v_viewer_id = v_owner_id THEN
    RAISE EXCEPTION 'You already have access to your own inventory';
  END IF;

  INSERT INTO public.stock_visibility_overrides (
    viewer_user_id,
    owner_user_id,
    can_view,
    created_by
  )
  VALUES (
    v_viewer_id,
    v_owner_id,
    true,
    v_owner_id
  )
  ON CONFLICT (viewer_user_id, owner_user_id)
  DO UPDATE SET
    can_view = true,
    created_by = EXCLUDED.created_by
  RETURNING id INTO v_share_id;

  RETURN v_share_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_inventory_share(p_share_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM public.stock_visibility_overrides
  WHERE id = p_share_id
    AND owner_user_id = auth.uid();

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_inventory_shares()
RETURNS TABLE (
  id uuid,
  viewer_user_id uuid,
  viewer_display_name text,
  viewer_email text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    svo.id,
    svo.viewer_user_id,
    COALESCE(NULLIF(trim(p.display_name), ''), p.email, 'TOMUPRO user') AS viewer_display_name,
    p.email AS viewer_email,
    svo.created_at
  FROM public.stock_visibility_overrides svo
  JOIN public.profiles p ON p.id = svo.viewer_user_id
  WHERE svo.owner_user_id = auth.uid()
    AND svo.can_view = true
  ORDER BY svo.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_inventory_order_sources()
RETURNS TABLE (
  owner_user_id uuid,
  owner_display_name text,
  owner_email text,
  warehouse_id uuid,
  warehouse_name text,
  warehouse_type text,
  access_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH permitted_owners AS (
    SELECT auth.uid() AS owner_id, 0 AS access_priority
    WHERE auth.uid() IS NOT NULL

    UNION ALL

    SELECT svo.owner_user_id, 1
    FROM public.stock_visibility_overrides svo
    WHERE svo.viewer_user_id = auth.uid()
      AND svo.can_view = true

    UNION ALL

    SELECT gm.member_user_id, 2
    FROM public.manager_groups mg
    JOIN public.group_members gm ON gm.group_id = mg.id
    WHERE mg.manager_user_id = auth.uid()
      AND public.get_user_role(auth.uid()) = 'manager'

    UNION ALL

    SELECT msb.salesperson_id, 2
    FROM public.manager_salesperson_bindings msb
    WHERE msb.manager_id = auth.uid()
      AND msb.active = true
      AND public.get_user_role(auth.uid()) = 'manager'
  ),
  owners AS (
    SELECT owner_id, MIN(access_priority) AS access_priority
    FROM permitted_owners
    WHERE owner_id IS NOT NULL
    GROUP BY owner_id
  )
  SELECT
    p.id AS owner_user_id,
    COALESCE(NULLIF(trim(p.display_name), ''), p.email, 'TOMUPRO user') AS owner_display_name,
    p.email AS owner_email,
    w.id AS warehouse_id,
    w.name AS warehouse_name,
    w.warehouse_type::text,
    CASE owners.access_priority
      WHEN 0 THEN 'own'
      WHEN 1 THEN 'shared'
      ELSE 'team'
    END AS access_type
  FROM owners
  JOIN public.profiles p ON p.id = owners.owner_id
  JOIN public.warehouses w
    ON w.owner_user_id = owners.owner_id
   AND w.is_active = true
  WHERE p.is_active = true
  ORDER BY
    owners.access_priority,
    owner_display_name,
    w.created_at,
    w.id;
$function$;

CREATE OR REPLACE FUNCTION public.validate_order_item_product_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_owner_id uuid;
  v_product_owner_id uuid;
  v_order_owner_name text;
  v_product_owner_name text;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.order_owner_id, p.display_name
    INTO v_order_owner_id, v_order_owner_name
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.order_owner_id
  WHERE o.id = NEW.order_id;

  SELECT product.owner_user_id, p.display_name
    INTO v_product_owner_id, v_product_owner_name
  FROM public.products product
  LEFT JOIN public.profiles p ON p.id = product.owner_user_id
  WHERE product.id = NEW.product_id;

  IF v_order_owner_id IS NOT NULL
     AND v_product_owner_id IS NOT NULL
     AND v_order_owner_id <> v_product_owner_id THEN
    RAISE EXCEPTION
      'Product owner mismatch: Cannot use products owned by %. Order owner is %.',
      COALESCE(v_product_owner_name, 'Unknown'),
      COALESCE(v_order_owner_name, 'Unknown');
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_order_inventory_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_source_owner uuid;
  v_previous_owner uuid;
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.fulfillment_warehouse_id IS NOT DISTINCT FROM OLD.fulfillment_warehouse_id
     AND NEW.order_owner_id IS NOT DISTINCT FROM OLD.order_owner_id THEN
    RETURN NEW;
  END IF;

  IF NEW.fulfillment_warehouse_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT w.owner_user_id
    INTO v_source_owner
  FROM public.warehouses w
  WHERE w.id = NEW.fulfillment_warehouse_id
    AND w.is_active = true;

  IF v_source_owner IS NULL THEN
    RAISE EXCEPTION 'Selected inventory source is unavailable';
  END IF;

  IF v_source_owner IS DISTINCT FROM COALESCE(NEW.order_owner_id, NEW.salesperson_id) THEN
    RAISE EXCEPTION 'Inventory source must belong to the selected order owner';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.fulfillment_warehouse_id IS DISTINCT FROM OLD.fulfillment_warehouse_id
     AND NEW.order_owner_id IS NOT DISTINCT FROM OLD.order_owner_id
     AND OLD.fulfillment_warehouse_id IS NOT NULL THEN
    SELECT w.owner_user_id
      INTO v_previous_owner
    FROM public.warehouses w
    WHERE w.id = OLD.fulfillment_warehouse_id;

    IF v_previous_owner = v_source_owner THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_actor IS NULL AND auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF v_actor IS NULL OR NOT public.can_view_stock(v_source_owner, v_actor) THEN
    RAISE EXCEPTION 'You do not have access to the selected inventory source';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_order_inventory_source_trigger ON public.orders;

CREATE TRIGGER validate_order_inventory_source_trigger
  BEFORE INSERT OR UPDATE OF fulfillment_warehouse_id, order_owner_id
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_inventory_source();

CREATE OR REPLACE FUNCTION public.set_default_fulfillment_warehouse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id uuid := COALESCE(NEW.order_owner_id, NEW.salesperson_id);
BEGIN
  IF NEW.fulfillment_warehouse_id IS NULL AND v_owner_id IS NOT NULL THEN
    SELECT w.id
      INTO NEW.fulfillment_warehouse_id
    FROM public.warehouses w
    WHERE w.owner_user_id = v_owner_id
      AND w.is_active = true
    ORDER BY w.created_at, w.id
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_stock_owner_warehouse(p_order_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT w.id
  FROM public.orders o
  JOIN public.warehouses w
    ON w.owner_user_id = COALESCE(o.order_owner_id, o.salesperson_id)
  WHERE o.id = p_order_id
    AND w.is_active = true
  ORDER BY
    CASE WHEN w.id = o.fulfillment_warehouse_id THEN 0 ELSE 1 END,
    w.created_at,
    w.id
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.share_inventory_with_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_inventory_share(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_inventory_shares() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_inventory_order_sources() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.share_inventory_with_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_inventory_share(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_inventory_shares() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_order_sources() TO authenticated;

NOTIFY pgrst, 'reload schema';
