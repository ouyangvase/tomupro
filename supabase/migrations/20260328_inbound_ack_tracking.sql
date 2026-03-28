-- ============================================================
-- Add acknowledged_at / acknowledged_by to inbound_shipments
-- and update ack_inbound_and_add_stock to populate them
-- ============================================================

-- 1. Add columns
ALTER TABLE public.inbound_shipments
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES public.profiles(id);

-- 2. Backfill acknowledged_at for existing ACKNOWLEDGED shipments using created_at as approximation
UPDATE public.inbound_shipments
SET acknowledged_at = created_at
WHERE status = 'ACKNOWLEDGED' AND acknowledged_at IS NULL;

-- 3. Update ack_inbound_and_add_stock to set the new fields
CREATE OR REPLACE FUNCTION public.ack_inbound_and_add_stock(p_shipment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_shipment RECORD;
  v_item RECORD;
  v_warehouse_id uuid;
  v_product_id uuid;
  v_total_qty int := 0;
  v_lines_count int := 0;
  v_caller_role app_role;
  v_is_authorized boolean := false;
  v_target_role app_role;
  v_warehouse_type text;
BEGIN
  -- Get caller role
  v_caller_role := get_user_role(auth.uid());

  -- Load shipment
  SELECT * INTO v_shipment
  FROM inbound_shipments
  WHERE id = p_shipment_id
  LIMIT 1;

  IF v_shipment IS NULL THEN
    RAISE EXCEPTION 'Shipment not found: %', p_shipment_id;
  END IF;

  -- Already acknowledged = idempotent
  IF v_shipment.status = 'ACKNOWLEDGED' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'shipment_id', p_shipment_id,
      'message', 'Shipment was already acknowledged'
    );
  END IF;

  IF v_shipment.status != 'PENDING_SP_ACK' THEN
    RAISE EXCEPTION 'Shipment cannot be acknowledged. Current status: %', v_shipment.status;
  END IF;

  -- Authorization: target user or admin
  IF v_caller_role = 'admin' THEN
    v_is_authorized := true;
  ELSIF auth.uid() = v_shipment.salesperson_id THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Not authorized to acknowledge this shipment.';
  END IF;

  -- Get target user role for warehouse type
  SELECT role INTO v_target_role
  FROM profiles WHERE id = v_shipment.salesperson_id LIMIT 1;

  IF v_target_role = 'manager' THEN
    v_warehouse_type := 'MANAGER';
  ELSIF v_target_role = 'runner' THEN
    v_warehouse_type := 'RUNNER';
  ELSE
    v_warehouse_type := 'SALESPERSON';
  END IF;

  -- Find warehouse
  SELECT id INTO v_warehouse_id
  FROM warehouses
  WHERE owner_user_id = v_shipment.salesperson_id
    AND warehouse_type::text = v_warehouse_type
    AND is_active = true
  LIMIT 1;

  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id
    FROM warehouses
    WHERE owner_user_id = v_shipment.salesperson_id AND is_active = true
    ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- Auto-create if needed
  IF v_warehouse_id IS NULL THEN
    INSERT INTO warehouses (warehouse_type, owner_user_id, name, is_active)
    VALUES (
      v_warehouse_type::warehouse_type,
      v_shipment.salesperson_id,
      (SELECT COALESCE(display_name, 'User') FROM profiles WHERE id = v_shipment.salesperson_id) || '''s Warehouse',
      true
    )
    RETURNING id INTO v_warehouse_id;
  END IF;

  -- Process items
  FOR v_item IN SELECT * FROM inbound_items WHERE inbound_id = p_shipment_id
  LOOP
    v_product_id := v_item.product_id;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Item % has no product_id.', v_item.id;
    END IF;

    UPDATE inbound_items SET qty_acknowledged = v_item.qty_reported WHERE id = v_item.id;

    INSERT INTO stock_movements (warehouse_id, product_id, movement_type, qty_change, reference_type, reference_id, created_by)
    VALUES (v_warehouse_id, v_product_id, 'INBOUND', v_item.qty_reported, 'INBOUND_ITEM', v_item.id, auth.uid());

    v_total_qty := v_total_qty + v_item.qty_reported;
    v_lines_count := v_lines_count + 1;
  END LOOP;

  -- Update shipment status + acknowledged tracking
  UPDATE inbound_shipments
  SET status = 'ACKNOWLEDGED',
      acknowledged_at = now(),
      acknowledged_by = auth.uid()
  WHERE id = p_shipment_id;

  -- Notify runner
  INSERT INTO notifications (user_id, title, message, type, priority, reference_type, reference_id, entity_type)
  VALUES (
    v_shipment.runner_id,
    'Inbound Acknowledged',
    'Inbound shipment ' || v_shipment.tracking_no || ' has been acknowledged.',
    'INBOUND_ACKED', 'LOW', 'INBOUND', p_shipment_id, 'INBOUND'
  );

  RETURN jsonb_build_object(
    'success', true,
    'shipment_id', p_shipment_id,
    'warehouse_id', v_warehouse_id,
    'lines_count', v_lines_count,
    'total_qty', v_total_qty,
    'acknowledged_at', now(),
    'acknowledged_by', auth.uid()
  );
END;
$function$;
