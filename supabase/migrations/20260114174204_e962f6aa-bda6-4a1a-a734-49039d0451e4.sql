-- ============================================================
-- FIX A: Manager inbound visibility - RLS policies
-- Problem: Managers can see other managers' inbound shipments
-- Fix: Manager can ONLY see shipments where salesperson_id = auth.uid() 
--      (i.e., they are the target user themselves, NOT their team)
-- ============================================================

-- Drop existing problematic policies on inbound_shipments
DROP POLICY IF EXISTS "Inbound shipments viewable by related parties" ON public.inbound_shipments;
DROP POLICY IF EXISTS "Manager can view team inbound shipments" ON public.inbound_shipments;

-- Create new SELECT policy: target user (salesperson/manager) sees only their own inbounds
-- Runner sees their created shipments, Admin sees all
CREATE POLICY "Inbound shipments viewable by relevant users"
  ON public.inbound_shipments
  FOR SELECT
  USING (
    auth.uid() = runner_id 
    OR auth.uid() = salesperson_id
    OR get_user_role(auth.uid()) = 'admin'
  );

-- Update the UPDATE policy to be more restrictive
DROP POLICY IF EXISTS "Users can update inbound shipments" ON public.inbound_shipments;

CREATE POLICY "Target user or admin can update inbound shipments"
  ON public.inbound_shipments
  FOR UPDATE
  USING (
    get_user_role(auth.uid()) = 'admin'
    OR auth.uid() = salesperson_id
  );

-- ============================================================
-- Fix inbound_items policy to match
-- ============================================================
DROP POLICY IF EXISTS "Inbound items access by related parties" ON public.inbound_items;

CREATE POLICY "Inbound items access by related parties"
  ON public.inbound_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM inbound_shipments s
      WHERE s.id = inbound_items.inbound_id
        AND (
          auth.uid() = s.runner_id 
          OR auth.uid() = s.salesperson_id
          OR get_user_role(auth.uid()) = 'admin'
        )
    )
  );

-- ============================================================
-- FIX B & C: Update ack_inbound_and_add_stock function
-- Problem: Manager acknowledge fails because warehouse lookup was for "salesperson" 
--          warehouse type but manager has their own warehouse type
-- Also fix: Remove any .single() equivalent that may cause multiple-row errors
-- ============================================================

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
  
  -- Load shipment (single row) - use LIMIT 1 to avoid multiple row errors
  SELECT * INTO v_shipment
  FROM inbound_shipments
  WHERE id = p_shipment_id
  LIMIT 1;
  
  IF v_shipment IS NULL THEN
    RAISE EXCEPTION 'Shipment not found: %', p_shipment_id;
  END IF;
  
  -- Check status (idempotent - already acknowledged is not an error, just return)
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
  
  -- Authorization check: only target user (salesperson_id) or admin can acknowledge
  -- Note: salesperson_id field stores the TARGET user (can be salesperson OR manager)
  IF v_caller_role = 'admin' THEN
    v_is_authorized := true;
  ELSIF auth.uid() = v_shipment.salesperson_id THEN
    -- Target user (whether salesperson or manager) can acknowledge their own
    v_is_authorized := true;
  END IF;
  
  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Not authorized to acknowledge this shipment. Only the target user or admin can acknowledge.';
  END IF;
  
  -- Get the target user's role to determine warehouse type
  SELECT role INTO v_target_role
  FROM profiles
  WHERE id = v_shipment.salesperson_id
  LIMIT 1;
  
  -- Determine warehouse type based on target user's role
  IF v_target_role = 'manager' THEN
    v_warehouse_type := 'MANAGER';
  ELSIF v_target_role = 'runner' THEN
    v_warehouse_type := 'RUNNER';
  ELSE
    v_warehouse_type := 'SALESPERSON';
  END IF;
  
  -- Find target warehouse (the target user's warehouse)
  -- Try to find by specific type first, then fall back to any owned warehouse
  SELECT id INTO v_warehouse_id
  FROM warehouses
  WHERE owner_user_id = v_shipment.salesperson_id
    AND warehouse_type::text = v_warehouse_type
    AND is_active = true
  LIMIT 1;
  
  -- Fallback: try any active warehouse owned by target user
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id
    FROM warehouses
    WHERE owner_user_id = v_shipment.salesperson_id
      AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;
  
  -- If still no warehouse, auto-create one for the target user
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
  
  -- Process each item
  FOR v_item IN 
    SELECT * FROM inbound_items WHERE inbound_id = p_shipment_id
  LOOP
    v_product_id := v_item.product_id;
    
    -- product_id is REQUIRED (runner picks from dropdown). Fail if missing.
    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Item % has no product_id. Product selection is required.', v_item.id;
    END IF;
    
    -- Update item with acknowledged qty
    UPDATE inbound_items
    SET qty_acknowledged = v_item.qty_reported
    WHERE id = v_item.id;
    
    -- Create stock movement (INBOUND adds stock)
    INSERT INTO stock_movements (
      warehouse_id,
      product_id,
      movement_type,
      qty_change,
      reference_type,
      reference_id,
      created_by
    ) VALUES (
      v_warehouse_id,
      v_product_id,
      'INBOUND',
      v_item.qty_reported,
      'INBOUND_ITEM',
      v_item.id,
      auth.uid()
    );
    
    v_total_qty := v_total_qty + v_item.qty_reported;
    v_lines_count := v_lines_count + 1;
  END LOOP;
  
  -- Update shipment status
  UPDATE inbound_shipments
  SET status = 'ACKNOWLEDGED'
  WHERE id = p_shipment_id;
  
  -- Notify runner that inbound was acknowledged
  INSERT INTO notifications (
    user_id, title, message, type, priority,
    reference_type, reference_id, entity_type
  ) VALUES (
    v_shipment.runner_id,
    'Inbound Acknowledged',
    'Inbound shipment ' || v_shipment.tracking_no || ' has been acknowledged.',
    'INBOUND_ACKED',
    'LOW',
    'INBOUND',
    p_shipment_id,
    'INBOUND'
  );
  
  -- Return summary as single JSON object
  RETURN jsonb_build_object(
    'success', true,
    'shipment_id', p_shipment_id,
    'total_qty', v_total_qty,
    'lines_count', v_lines_count,
    'warehouse_id', v_warehouse_id,
    'warehouse_type', v_warehouse_type
  );
END;
$function$;

-- ============================================================
-- Add MANAGER warehouse type if not exists
-- ============================================================
DO $$ 
BEGIN
  -- Check if MANAGER type exists in the enum
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'MANAGER' 
    AND enumtypid = 'warehouse_type'::regtype
  ) THEN
    ALTER TYPE warehouse_type ADD VALUE IF NOT EXISTS 'MANAGER';
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ============================================================
-- Fix products RLS for runner to see target user's products
-- Runner needs to see products owned by users they are bound to
-- ============================================================

-- Check if policy exists and drop it
DROP POLICY IF EXISTS "Runner can view bound user products" ON public.products;

CREATE POLICY "Runner can view bound user products"
  ON public.products
  FOR SELECT
  USING (
    get_user_role(auth.uid()) = 'runner'
    AND (
      -- Products owned by salespersons bound to this runner
      EXISTS (
        SELECT 1 FROM bindings b 
        WHERE b.runner_id = auth.uid() 
          AND b.salesperson_id = products.owner_user_id 
          AND b.active = true
      )
      OR
      -- Products owned by managers bound to this runner
      EXISTS (
        SELECT 1 FROM manager_runner_bindings mrb
        WHERE mrb.runner_id = auth.uid()
          AND mrb.manager_id = products.owner_user_id
      )
    )
  );