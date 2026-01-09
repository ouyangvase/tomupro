-- Fix the prededuct_stock_on_driver_assign trigger to handle re-assignments
-- by using ON CONFLICT DO NOTHING to avoid duplicate stock movements

CREATE OR REPLACE FUNCTION public.prededuct_stock_on_driver_assign()
RETURNS TRIGGER AS $$
DECLARE
  item RECORD;
  warehouse_id uuid;
BEGIN
  -- Only trigger when driver_id changes from null or to a different driver
  IF NEW.driver_id IS NOT NULL AND (OLD.driver_id IS NULL OR OLD.driver_id != NEW.driver_id) THEN
    -- Get the runner's warehouse
    SELECT id INTO warehouse_id
    FROM public.warehouses
    WHERE owner_user_id = NEW.runner_id AND warehouse_type = 'RUNNER'
    LIMIT 1;
    
    IF warehouse_id IS NOT NULL THEN
      FOR item IN
        SELECT oi.id, oi.product_id, oi.qty 
        FROM public.order_items oi 
        WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL
      LOOP
        -- Use ON CONFLICT DO NOTHING to skip if movement already exists
        INSERT INTO public.stock_movements (
          warehouse_id, product_id, movement_type, qty_change, 
          reference_type, reference_id, created_by
        )
        VALUES (
          warehouse_id, item.product_id, 'DRIVER_PICKUP', item.qty, 
          'ORDER_ITEM', item.id, COALESCE(auth.uid(), NEW.runner_id)
        )
        ON CONFLICT (reference_id, movement_type) WHERE reference_type = 'ORDER_ITEM'
        DO NOTHING;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;