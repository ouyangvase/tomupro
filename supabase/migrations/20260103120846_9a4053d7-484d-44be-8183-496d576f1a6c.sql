-- Phase 2: Daily Pickup Flow with Pre-Deduct Inventory

-- Add new movement types for driver allocation
ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'DRIVER_ALLOCATE_PREDEDUCT';
ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'DRIVER_RETURN';

-- Create driver_pickups table for tracking daily stock handoff
CREATE TABLE public.driver_pickups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_date date NOT NULL DEFAULT CURRENT_DATE,
  runner_id uuid NOT NULL REFERENCES public.profiles(id),
  driver_id uuid NOT NULL REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'PENDING_DRIVER_ACK' CHECK (status IN ('PENDING_DRIVER_ACK', 'DRIVER_ACKED', 'CANCELLED')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz
);

-- Create driver_pickup_items table
CREATE TABLE public.driver_pickup_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_id uuid NOT NULL REFERENCES public.driver_pickups(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty integer NOT NULL CHECK (qty > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create driver_allocated_stock view for tracking driver's virtual stock
CREATE OR REPLACE VIEW public.driver_allocated_stock AS
SELECT 
  o.driver_id,
  oi.product_id,
  p.sku_name,
  p.sku_code,
  SUM(oi.qty) as allocated_qty,
  SUM(CASE WHEN o.runner_accept_status = 'ACCEPTED' THEN oi.qty ELSE 0 END) as delivered_qty,
  SUM(CASE WHEN o.driver_status IN ('ASSIGNED', 'OUT_FOR_DELIVERY') THEN oi.qty ELSE 0 END) as pending_qty
FROM public.orders o
JOIN public.order_items oi ON oi.order_id = o.id
JOIN public.products p ON p.id = oi.product_id
WHERE o.driver_id IS NOT NULL
  AND o.driver_status NOT IN ('DRIVER_FAILED')
  AND oi.product_id IS NOT NULL
GROUP BY o.driver_id, oi.product_id, p.sku_name, p.sku_code;

-- Enable RLS on driver_pickups
ALTER TABLE public.driver_pickups ENABLE ROW LEVEL SECURITY;

-- RLS for driver_pickups
CREATE POLICY "Admin can manage all pickups"
  ON public.driver_pickups FOR ALL
  USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Runner can manage their pickups"
  ON public.driver_pickups FOR ALL
  USING (runner_id = auth.uid());

CREATE POLICY "Driver can view their pickups"
  ON public.driver_pickups FOR SELECT
  USING (driver_id = auth.uid());

CREATE POLICY "Driver can acknowledge their pickups"
  ON public.driver_pickups FOR UPDATE
  USING (driver_id = auth.uid() AND status = 'PENDING_DRIVER_ACK');

-- Enable RLS on driver_pickup_items
ALTER TABLE public.driver_pickup_items ENABLE ROW LEVEL SECURITY;

-- RLS for driver_pickup_items
CREATE POLICY "Access pickup items through pickup"
  ON public.driver_pickup_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.driver_pickups dp 
      WHERE dp.id = driver_pickup_items.pickup_id
      AND (dp.runner_id = auth.uid() OR dp.driver_id = auth.uid() OR get_user_role(auth.uid()) = 'admin')
    )
  );

-- Function to check if driver has outstanding orders blocking new pickup
CREATE OR REPLACE FUNCTION public.get_driver_blocking_orders(p_driver_id uuid)
RETURNS TABLE (
  order_id uuid,
  order_code text,
  customer_name text,
  driver_status text,
  order_date date
) 
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    id as order_id,
    order_code,
    customer_name,
    driver_status,
    order_date
  FROM public.orders
  WHERE driver_id = p_driver_id
    AND driver_status IN ('ASSIGNED', 'OUT_FOR_DELIVERY', 'DRIVER_DELIVERED')
    AND runner_accept_status IS DISTINCT FROM 'ACCEPTED'
    AND order_date < CURRENT_DATE
  ORDER BY order_date ASC
$$;

-- Function to create pre-deduct stock movements when order assigned to driver
CREATE OR REPLACE FUNCTION public.prededuct_stock_on_driver_assign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  item RECORD;
  warehouse_id uuid;
BEGIN
  -- Only trigger when driver is newly assigned
  IF NEW.driver_id IS NOT NULL AND (OLD.driver_id IS NULL OR OLD.driver_id != NEW.driver_id) THEN
    -- Get runner's warehouse
    SELECT id INTO warehouse_id
    FROM public.warehouses
    WHERE owner_user_id = NEW.runner_id
    AND warehouse_type = 'RUNNER'
    LIMIT 1;
    
    IF warehouse_id IS NOT NULL THEN
      -- Create pre-deduct movements for each order item with product_id
      FOR item IN
        SELECT oi.id, oi.product_id, oi.qty
        FROM public.order_items oi
        WHERE oi.order_id = NEW.id
        AND oi.product_id IS NOT NULL
      LOOP
        INSERT INTO public.stock_movements (
          warehouse_id, product_id, movement_type, qty_change,
          reference_type, reference_id, created_by
        ) VALUES (
          warehouse_id,
          item.product_id,
          'DRIVER_ALLOCATE_PREDEDUCT',
          -item.qty,
          'ORDER_ITEM',
          item.id,
          auth.uid()
        );
      END LOOP;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for pre-deduct on driver assignment
CREATE TRIGGER trigger_prededuct_on_driver_assign
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prededuct_stock_on_driver_assign();

-- Notification trigger for pickup created
CREATE OR REPLACE FUNCTION public.notify_pickup_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  runner_name TEXT;
  item_count INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT display_name INTO runner_name
    FROM public.profiles WHERE id = NEW.runner_id;
    
    SELECT COUNT(*) INTO item_count
    FROM public.driver_pickup_items WHERE pickup_id = NEW.id;
    
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    ) VALUES (
      NEW.driver_id,
      'New Pickup Assigned',
      'Pickup for ' || NEW.pickup_date::text || ' from ' || COALESCE(runner_name, 'Runner') ||
      E'\nPlease acknowledge receipt',
      'PICKUP_CREATED',
      'HIGH',
      'driver_pickup',
      NEW.id,
      'DRIVER_PICKUP',
      'driver'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_pickup_created
  AFTER INSERT ON public.driver_pickups
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_pickup_created();

-- Notification trigger for pickup acknowledged
CREATE OR REPLACE FUNCTION public.notify_pickup_acknowledged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  driver_name TEXT;
BEGIN
  IF NEW.status = 'DRIVER_ACKED' AND OLD.status = 'PENDING_DRIVER_ACK' THEN
    SELECT display_name INTO driver_name
    FROM public.profiles WHERE id = NEW.driver_id;
    
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    ) VALUES (
      NEW.runner_id,
      'Pickup Acknowledged',
      'Driver ' || COALESCE(driver_name, 'Unknown') || ' acknowledged pickup for ' || NEW.pickup_date::text,
      'PICKUP_ACKNOWLEDGED',
      'MEDIUM',
      'driver_pickup',
      NEW.id,
      'DRIVER_PICKUP',
      'runner'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_pickup_acknowledged
  AFTER UPDATE ON public.driver_pickups
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_pickup_acknowledged();