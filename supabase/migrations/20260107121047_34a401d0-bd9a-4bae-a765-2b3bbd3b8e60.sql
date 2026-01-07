-- ============================================
-- PART 2: STOCK STATES VIEW AND LOGIC ENFORCEMENT
-- ============================================

-- 1. CREATE STOCK STATES VIEW
DROP VIEW IF EXISTS public.stock_balance_view;
DROP VIEW IF EXISTS public.stock_states_view;

CREATE VIEW public.stock_states_view AS
WITH movement_summary AS (
  SELECT 
    sm.warehouse_id,
    sm.product_id,
    SUM(CASE 
      WHEN sm.movement_type IN ('INBOUND', 'INBOUND_RECEIVE', 'ADJUSTMENT', 'RETURN', 'STOCK_CORRECTION') THEN sm.qty_change
      WHEN sm.movement_type = 'DELIVERY_ACCEPTED' THEN sm.qty_change
      WHEN sm.movement_type = 'SALE_DEDUCT' THEN sm.qty_change
      ELSE 0 
    END) AS real_stock,
    SUM(CASE 
      WHEN sm.movement_type = 'ORDER_RESERVE' THEN sm.qty_change
      WHEN sm.movement_type = 'ORDER_UNRESERVE' THEN sm.qty_change
      WHEN sm.movement_type = 'DRIVER_PICKUP' THEN -sm.qty_change
      WHEN sm.movement_type = 'RUNNER_RETURN_ACK' THEN sm.qty_change
      ELSE 0 
    END) AS reserved_stock,
    SUM(CASE 
      WHEN sm.movement_type = 'DRIVER_PICKUP' THEN sm.qty_change
      WHEN sm.movement_type = 'DRIVER_ALLOCATE_PREDEDUCT' THEN -sm.qty_change
      WHEN sm.movement_type = 'DELIVERY_ACCEPTED' THEN -sm.qty_change
      WHEN sm.movement_type = 'SALE_DEDUCT' THEN -sm.qty_change
      WHEN sm.movement_type = 'DRIVER_RETURN_SUBMIT' THEN sm.qty_change
      ELSE 0 
    END) AS in_transit_stock,
    SUM(CASE 
      WHEN sm.movement_type = 'DRIVER_RETURN_SUBMIT' THEN -sm.qty_change
      WHEN sm.movement_type = 'RUNNER_RETURN_ACK' THEN sm.qty_change
      WHEN sm.movement_type = 'DRIVER_RETURN' THEN 0
      ELSE 0 
    END) AS returned_pending_stock,
    MAX(sm.created_at) AS last_movement_time
  FROM public.stock_movements sm
  GROUP BY sm.warehouse_id, sm.product_id
)
SELECT 
  w.id AS warehouse_id,
  w.name AS warehouse_name,
  w.owner_user_id,
  p_owner.display_name AS owner_name,
  ms.product_id,
  pr.sku_code,
  pr.sku_name,
  COALESCE(ms.real_stock, 0)::bigint AS real_stock,
  COALESCE(ms.reserved_stock, 0)::bigint AS reserved_stock,
  COALESCE(ms.in_transit_stock, 0)::bigint AS in_transit_stock,
  COALESCE(ms.returned_pending_stock, 0)::bigint AS returned_pending_stock,
  (COALESCE(ms.real_stock, 0) + COALESCE(ms.reserved_stock, 0) + COALESCE(ms.in_transit_stock, 0) + COALESCE(ms.returned_pending_stock, 0))::bigint AS total_stock,
  ms.last_movement_time
FROM public.warehouses w
LEFT JOIN movement_summary ms ON ms.warehouse_id = w.id
LEFT JOIN public.products pr ON pr.id = ms.product_id
LEFT JOIN public.profiles p_owner ON p_owner.id = w.owner_user_id
WHERE w.is_active = true AND ms.product_id IS NOT NULL;

-- 2. CREATE STOCK BALANCE VIEW (shows real_stock only)
CREATE VIEW public.stock_balance_view AS
SELECT 
  ssv.warehouse_id,
  ssv.warehouse_name,
  ssv.owner_user_id,
  ssv.owner_name,
  ssv.product_id,
  ssv.sku_code,
  ssv.sku_name,
  ssv.real_stock AS balance_qty,
  ssv.last_movement_time
FROM public.stock_states_view ssv;

-- 3. CREATE STOCK MUTATION VALIDATION FUNCTION
CREATE OR REPLACE FUNCTION public.validate_stock_mutation()
RETURNS TRIGGER AS $$
DECLARE
  actor_role app_role;
  is_system_call boolean;
BEGIN
  is_system_call := (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role';
  
  IF is_system_call THEN
    RETURN NEW;
  END IF;
  
  actor_role := get_user_role(auth.uid());
  
  IF actor_role = 'driver' THEN
    IF NEW.movement_type NOT IN ('DRIVER_RETURN_SUBMIT') THEN
      INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
      VALUES ('STOCK_MOVEMENT', NEW.id, 'BLOCKED_INVALID_MUTATION', auth.uid(), 
              jsonb_build_object('reason', 'Driver attempted unauthorized stock mutation'),
              to_jsonb(NEW));
      RAISE EXCEPTION 'Drivers cannot modify stock directly. Movement type % not allowed.', NEW.movement_type;
    END IF;
  END IF;
  
  IF NEW.movement_type IN ('DELIVERY_ACCEPTED', 'SALE_DEDUCT') THEN
    IF actor_role NOT IN ('admin', 'runner') THEN
      INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
      VALUES ('STOCK_MOVEMENT', NEW.id, 'BLOCKED_INVALID_MUTATION', auth.uid(),
              jsonb_build_object('reason', 'Non-runner attempted delivery acceptance'),
              to_jsonb(NEW));
      RAISE EXCEPTION 'Only runners can accept deliveries and deduct real stock.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS validate_stock_mutation_trigger ON public.stock_movements;
CREATE TRIGGER validate_stock_mutation_trigger
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_stock_mutation();

-- 4. UPDATE DRIVER RETURN ACKNOWLEDGEMENT TRIGGER
CREATE OR REPLACE FUNCTION public.process_driver_return_acknowledgment()
RETURNS TRIGGER AS $$
DECLARE
  item RECORD;
  warehouse_id uuid;
BEGIN
  IF NEW.status = 'RUNNER_ACKED' AND OLD.status = 'PENDING_RUNNER_ACK' THEN
    SELECT id INTO warehouse_id
    FROM public.warehouses
    WHERE owner_user_id = NEW.runner_id AND warehouse_type = 'RUNNER'
    LIMIT 1;
    
    IF warehouse_id IS NOT NULL THEN
      FOR item IN
        SELECT ri.product_id, ri.qty FROM public.driver_return_items ri WHERE ri.return_id = NEW.id
      LOOP
        INSERT INTO public.stock_movements (warehouse_id, product_id, movement_type, qty_change, reference_type, reference_id, created_by)
        VALUES (warehouse_id, item.product_id, 'RUNNER_RETURN_ACK', item.qty, 'MANUAL', NEW.id, auth.uid());
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. UPDATE PREDEDUCT TRIGGER TO USE DRIVER_PICKUP
CREATE OR REPLACE FUNCTION public.prededuct_stock_on_driver_assign()
RETURNS TRIGGER AS $$
DECLARE
  item RECORD;
  warehouse_id uuid;
BEGIN
  IF NEW.driver_id IS NOT NULL AND (OLD.driver_id IS NULL OR OLD.driver_id != NEW.driver_id) THEN
    SELECT id INTO warehouse_id
    FROM public.warehouses
    WHERE owner_user_id = NEW.runner_id AND warehouse_type = 'RUNNER'
    LIMIT 1;
    
    IF warehouse_id IS NOT NULL THEN
      FOR item IN
        SELECT oi.id, oi.product_id, oi.qty FROM public.order_items oi WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL
      LOOP
        INSERT INTO public.stock_movements (warehouse_id, product_id, movement_type, qty_change, reference_type, reference_id, created_by)
        VALUES (warehouse_id, item.product_id, 'DRIVER_PICKUP', item.qty, 'ORDER_ITEM', item.id, COALESCE(auth.uid(), NEW.runner_id));
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. CREATE DRIVER RETURN SUBMISSION TRIGGER
CREATE OR REPLACE FUNCTION public.process_driver_return_submission()
RETURNS TRIGGER AS $$
DECLARE
  item RECORD;
  warehouse_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT id INTO warehouse_id
    FROM public.warehouses
    WHERE owner_user_id = NEW.runner_id AND warehouse_type = 'RUNNER'
    LIMIT 1;
    
    IF warehouse_id IS NOT NULL THEN
      FOR item IN
        SELECT ri.product_id, ri.qty FROM public.driver_return_items ri WHERE ri.return_id = NEW.id
      LOOP
        INSERT INTO public.stock_movements (warehouse_id, product_id, movement_type, qty_change, reference_type, reference_id, created_by)
        VALUES (warehouse_id, item.product_id, 'DRIVER_RETURN_SUBMIT', -item.qty, 'MANUAL', NEW.id, NEW.driver_id);
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS process_driver_return_submission_trigger ON public.driver_returns;
CREATE TRIGGER process_driver_return_submission_trigger
  AFTER INSERT ON public.driver_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.process_driver_return_submission();

-- 7. CREATE STOCK INTEGRITY CHECK FUNCTION
CREATE OR REPLACE FUNCTION public.check_stock_integrity()
RETURNS TABLE (
  warehouse_id uuid,
  warehouse_name text,
  product_id uuid,
  sku_name text,
  real_stock bigint,
  reserved_stock bigint,
  in_transit_stock bigint,
  returned_pending_stock bigint,
  calculated_total bigint,
  has_discrepancy boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ssv.warehouse_id,
    ssv.warehouse_name,
    ssv.product_id,
    ssv.sku_name,
    ssv.real_stock,
    ssv.reserved_stock,
    ssv.in_transit_stock,
    ssv.returned_pending_stock,
    ssv.total_stock AS calculated_total,
    (ssv.reserved_stock < 0 OR ssv.in_transit_stock < 0 OR ssv.returned_pending_stock < 0) AS has_discrepancy
  FROM public.stock_states_view ssv
  WHERE ssv.reserved_stock < 0 
     OR ssv.in_transit_stock < 0 
     OR ssv.returned_pending_stock < 0
     OR ssv.real_stock < 0;
END;
$$;