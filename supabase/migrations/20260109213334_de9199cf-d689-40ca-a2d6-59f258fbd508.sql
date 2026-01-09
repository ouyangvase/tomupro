-- 1. Create inventory_data_issues table to track unresolvable stock issues
CREATE TABLE IF NOT EXISTS public.inventory_data_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID REFERENCES warehouses(id),
  product_id UUID REFERENCES products(id),
  original_movement_id UUID,
  issue_type TEXT NOT NULL, -- 'MISSING_PRODUCT', 'MISSING_SKU_CODE', 'ORPHAN_MOVEMENT'
  balance_qty INTEGER NOT NULL DEFAULT 0,
  details JSONB,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inventory_data_issues ENABLE ROW LEVEL SECURITY;

-- Only admins can view and manage issues
CREATE POLICY "Admin can manage inventory issues"
  ON public.inventory_data_issues
  FOR ALL
  USING (get_user_role(auth.uid()) = 'admin');

-- 2. Create trigger to validate stock_movements have valid product_id
CREATE OR REPLACE FUNCTION public.validate_stock_movement_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_exists BOOLEAN;
BEGIN
  -- Allow null product_id only for REVERSAL movements (admin cleanup)
  IF NEW.product_id IS NULL THEN
    IF NEW.movement_type = 'REVERSAL' THEN
      -- Log to issues table instead of blocking
      INSERT INTO inventory_data_issues (
        warehouse_id, original_movement_id, issue_type, balance_qty, details
      ) VALUES (
        NEW.warehouse_id, 
        NEW.id, 
        'ORPHAN_MOVEMENT',
        NEW.qty_change,
        jsonb_build_object(
          'movement_type', NEW.movement_type,
          'reference_type', NEW.reference_type,
          'reference_id', NEW.reference_id,
          'reason', 'Reversal movement with null product_id'
        )
      );
      RETURN NEW;
    ELSE
      -- Block other movement types with null product_id
      RAISE EXCEPTION 'Stock movement requires a valid product_id. Movement type: %', NEW.movement_type;
    END IF;
  END IF;
  
  -- Verify product exists
  SELECT EXISTS(SELECT 1 FROM products WHERE id = NEW.product_id) INTO v_product_exists;
  
  IF NOT v_product_exists THEN
    -- Log to issues and block
    RAISE EXCEPTION 'Product with id % does not exist', NEW.product_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the validation trigger
DROP TRIGGER IF EXISTS validate_stock_movement_product_trigger ON stock_movements;
CREATE TRIGGER validate_stock_movement_product_trigger
  BEFORE INSERT ON stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION validate_stock_movement_product();

-- 3. Update stock_balance_view to exclude null product rows
DROP VIEW IF EXISTS public.stock_balance_view;
CREATE VIEW public.stock_balance_view WITH (security_invoker = true) AS
SELECT 
  sm.warehouse_id,
  w.name AS warehouse_name,
  w.owner_user_id,
  p_owner.display_name AS owner_name,
  sm.product_id,
  pr.sku_code,
  pr.sku_name,
  SUM(sm.qty_change) AS balance_qty,
  MAX(sm.created_at) AS last_movement_time
FROM stock_movements sm
JOIN warehouses w ON w.id = sm.warehouse_id
LEFT JOIN profiles p_owner ON p_owner.id = w.owner_user_id
JOIN products pr ON pr.id = sm.product_id  -- INNER JOIN now excludes null product_id
WHERE can_view_stock(w.owner_user_id, auth.uid())
  AND sm.product_id IS NOT NULL  -- Extra safety
  AND pr.sku_code IS NOT NULL    -- Ensure product has SKU code
GROUP BY sm.warehouse_id, w.name, w.owner_user_id, p_owner.display_name, sm.product_id, pr.sku_code, pr.sku_name
HAVING SUM(sm.qty_change) <> 0;

-- 4. Backfill: Move any orphan movements to issues table and reverse them
-- First identify orphan movements (null product_id with balance)
DO $$
DECLARE
  orphan_record RECORD;
BEGIN
  FOR orphan_record IN
    SELECT sm.warehouse_id, sm.product_id, SUM(sm.qty_change) as balance
    FROM stock_movements sm
    WHERE sm.product_id IS NULL
    GROUP BY sm.warehouse_id, sm.product_id
    HAVING SUM(sm.qty_change) <> 0
  LOOP
    -- Log to issues
    INSERT INTO inventory_data_issues (
      warehouse_id, issue_type, balance_qty, details
    ) VALUES (
      orphan_record.warehouse_id,
      'MISSING_PRODUCT',
      orphan_record.balance,
      jsonb_build_object('reason', 'Orphan stock movements with null product_id found during backfill')
    );
    
    -- Create reversal to zero out
    INSERT INTO stock_movements (
      warehouse_id, product_id, movement_type, qty_change, reference_type, created_by
    ) VALUES (
      orphan_record.warehouse_id,
      NULL,
      'REVERSAL',
      -orphan_record.balance,
      'CLEANUP',
      (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1)
    );
  END LOOP;
END $$;

-- Grant permissions
GRANT SELECT ON public.inventory_data_issues TO authenticated;