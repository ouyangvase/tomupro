-- Fix search_path for the new validation function
CREATE OR REPLACE FUNCTION validate_stock_movement_product_owner()
RETURNS TRIGGER AS $$
DECLARE
  v_product_owner_id UUID;
  v_warehouse_owner_id UUID;
BEGIN
  -- Skip validation if product_id is null
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  SELECT owner_user_id INTO v_product_owner_id FROM public.products WHERE id = NEW.product_id;
  SELECT owner_user_id INTO v_warehouse_owner_id FROM public.warehouses WHERE id = NEW.warehouse_id;
  
  IF v_product_owner_id IS NOT NULL AND v_warehouse_owner_id IS NOT NULL AND v_product_owner_id != v_warehouse_owner_id THEN
    RAISE EXCEPTION 'Product owner (%) does not match warehouse owner (%)', 
      v_product_owner_id, v_warehouse_owner_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;