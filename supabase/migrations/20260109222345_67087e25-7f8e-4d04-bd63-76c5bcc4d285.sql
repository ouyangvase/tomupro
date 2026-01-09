
-- =====================================================
-- STOCK MOVEMENT INTEGRITY & IDEMPOTENCY ENFORCEMENT
-- =====================================================

-- 1) Create a unique index to prevent duplicate deductions per order+product
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_unique_deliver_deduct 
ON public.stock_movements (order_id, product_id, movement_type)
WHERE movement_type = 'DELIVER_DEDUCT';

-- 2) Create function to enforce stock deduction rules
CREATE OR REPLACE FUNCTION public.enforce_stock_deduction_rules()
RETURNS TRIGGER AS $$
DECLARE
  v_order_stock_deducted boolean;
  v_warehouse_owner_role text;
BEGIN
  -- Only check for stock-affecting movement types
  IF NEW.movement_type IN ('DELIVER_DEDUCT', 'SALE_DEDUCT', 'RETURN_TO_OWNER') THEN
    
    -- Verify warehouse belongs to salesperson/admin only
    SELECT p.role INTO v_warehouse_owner_role
    FROM warehouses w
    JOIN profiles p ON p.id = w.owner_user_id
    WHERE w.id = NEW.warehouse_id;
    
    IF v_warehouse_owner_role NOT IN ('salesperson', 'admin') THEN
      RAISE EXCEPTION 'Stock movements can only affect salesperson/admin warehouses. Got role: %', v_warehouse_owner_role;
    END IF;
    
    -- For DELIVER_DEDUCT, check order hasn't already been deducted
    IF NEW.movement_type = 'DELIVER_DEDUCT' AND NEW.order_id IS NOT NULL THEN
      SELECT stock_deducted INTO v_order_stock_deducted
      FROM orders
      WHERE id = NEW.order_id;
      
      -- Allow if order doesn't have stock_deducted flag yet (we're about to set it)
      -- This is handled by the edge function - trigger just validates warehouse ownership
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop old trigger if exists and create new one
DROP TRIGGER IF EXISTS trigger_enforce_stock_deduction ON public.stock_movements;
CREATE TRIGGER trigger_enforce_stock_deduction
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_stock_deduction_rules();

-- 3) Create function to automatically update stock_deducted flag after movements
CREATE OR REPLACE FUNCTION public.sync_order_stock_deducted()
RETURNS TRIGGER AS $$
BEGIN
  -- After successful DELIVER_DEDUCT, ensure order is marked as deducted
  IF NEW.movement_type = 'DELIVER_DEDUCT' AND NEW.order_id IS NOT NULL THEN
    UPDATE orders
    SET 
      stock_deducted = true,
      inventory_deducted_at = COALESCE(inventory_deducted_at, NOW())
    WHERE id = NEW.order_id
    AND stock_deducted = false;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_sync_order_stock_deducted ON public.stock_movements;
CREATE TRIGGER trigger_sync_order_stock_deducted
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_order_stock_deducted();

-- 4) Audit log entry for this migration
INSERT INTO audit_logs (entity_type, entity_id, action, after_json)
VALUES (
  'system',
  '00000000-0000-0000-0000-000000000000',
  'STOCK_INTEGRITY_TRIGGERS_CREATED',
  jsonb_build_object(
    'description', 'Added triggers for stock deduction integrity and idempotency',
    'created_at', NOW()
  )
);
