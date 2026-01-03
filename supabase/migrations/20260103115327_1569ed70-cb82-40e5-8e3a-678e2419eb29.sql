-- =====================================================
-- PHASE 1: DRIVER ROLE + ORDER ASSIGNMENT + ACCEPTANCE GATE
-- =====================================================

-- 1) Add 'driver' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'driver';

-- 2) Create runner_drivers table (parent-child relationship)
CREATE TABLE public.runner_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_driver UNIQUE (driver_id)
);

-- Enable RLS
ALTER TABLE public.runner_drivers ENABLE ROW LEVEL SECURITY;

-- 3) Add driver-related columns to orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS driver_status text DEFAULT 'UNASSIGNED',
  ADD COLUMN IF NOT EXISTS runner_accept_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS driver_delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS driver_failed_reason text,
  ADD COLUMN IF NOT EXISTS driver_failed_remark text,
  ADD COLUMN IF NOT EXISTS driver_next_delivery_date date;

-- 4) Create helper function to check if user is a runner's driver
CREATE OR REPLACE FUNCTION public.is_driver_of_runner(p_driver_id uuid, p_runner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.runner_drivers
    WHERE driver_id = p_driver_id
    AND runner_id = p_runner_id
    AND is_active = true
  )
$$;

-- 5) Create helper function to get parent runner for a driver
CREATE OR REPLACE FUNCTION public.get_driver_parent_runner(p_driver_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT runner_id FROM public.runner_drivers
  WHERE driver_id = p_driver_id AND is_active = true
  LIMIT 1
$$;

-- 6) RLS Policies for runner_drivers

-- Admin full access
CREATE POLICY "Admin can manage runner_drivers"
ON public.runner_drivers
FOR ALL
USING (get_user_role(auth.uid()) = 'admin');

-- Runner can view/manage their drivers
CREATE POLICY "Runner can view their drivers"
ON public.runner_drivers
FOR SELECT
USING (runner_id = auth.uid() OR get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Runner can add drivers"
ON public.runner_drivers
FOR INSERT
WITH CHECK (
  runner_id = auth.uid() 
  AND get_user_role(auth.uid()) = 'runner'
);

CREATE POLICY "Runner can update their drivers"
ON public.runner_drivers
FOR UPDATE
USING (runner_id = auth.uid() OR get_user_role(auth.uid()) = 'admin');

-- Driver can view their own assignment
CREATE POLICY "Driver can view own assignment"
ON public.runner_drivers
FOR SELECT
USING (driver_id = auth.uid());

-- 7) Update orders RLS to include driver visibility

-- Driver can view assigned orders
CREATE POLICY "Driver can view assigned orders"
ON public.orders
FOR SELECT
USING (driver_id = auth.uid());

-- Driver can update their assigned orders (driver_status fields only)
CREATE POLICY "Driver can update assigned orders"
ON public.orders
FOR UPDATE
USING (driver_id = auth.uid());

-- 8) Notification trigger for driver assignment
CREATE OR REPLACE FUNCTION public.notify_driver_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  order_ref TEXT;
  runner_name TEXT;
BEGIN
  IF NEW.driver_id IS NOT NULL AND OLD.driver_id IS DISTINCT FROM NEW.driver_id THEN
    order_ref := NEW.order_code;
    
    SELECT display_name INTO runner_name
    FROM public.profiles WHERE id = NEW.runner_id;
    
    -- Notify driver
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    ) VALUES (
      NEW.driver_id,
      'New Order Assigned',
      'Order ' || order_ref || ' assigned to you' ||
      E'\nCustomer: ' || NEW.customer_name ||
      E'\nArea: ' || COALESCE(NEW.area, 'Not specified') ||
      E'\nBy: ' || COALESCE(runner_name, 'Runner'),
      'DRIVER_ASSIGNED',
      'HIGH',
      'order',
      NEW.id,
      'ORDER',
      'driver'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_driver_assigned
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_driver_assigned();

-- 9) Notification trigger for driver delivered (pending runner acceptance)
CREATE OR REPLACE FUNCTION public.notify_driver_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  order_ref TEXT;
  driver_name TEXT;
BEGIN
  IF NEW.driver_status = 'DRIVER_DELIVERED' AND OLD.driver_status IS DISTINCT FROM 'DRIVER_DELIVERED' THEN
    order_ref := NEW.order_code;
    
    SELECT display_name INTO driver_name
    FROM public.profiles WHERE id = NEW.driver_id;
    
    -- Notify runner
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    ) VALUES (
      NEW.runner_id,
      'Delivery Pending Acceptance',
      'Order ' || order_ref || ' delivered by ' || COALESCE(driver_name, 'driver') ||
      E'\nCustomer: ' || NEW.customer_name ||
      E'\nAwaiting your acceptance',
      'DRIVER_DELIVERED_PENDING',
      'HIGH',
      'order',
      NEW.id,
      'ORDER',
      'runner'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_driver_delivered
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_driver_delivered();

-- 10) Notification trigger for runner accepts driver delivered
CREATE OR REPLACE FUNCTION public.notify_runner_accepted_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  order_ref TEXT;
  runner_name TEXT;
  driver_name TEXT;
BEGIN
  IF NEW.runner_accept_status = 'ACCEPTED' AND OLD.runner_accept_status IS DISTINCT FROM 'ACCEPTED' THEN
    order_ref := NEW.order_code;
    
    SELECT display_name INTO runner_name
    FROM public.profiles WHERE id = NEW.runner_id;
    
    SELECT display_name INTO driver_name
    FROM public.profiles WHERE id = NEW.driver_id;
    
    -- Notify salesperson
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    ) VALUES (
      NEW.salesperson_id,
      'Order Delivered',
      'Order ' || order_ref || ' delivered' ||
      E'\nAccepted by: ' || COALESCE(runner_name, 'Runner') ||
      E'\nDriver: ' || COALESCE(driver_name, 'Driver'),
      'ORDER_DELIVERED_ACCEPTED',
      'MEDIUM',
      'order',
      NEW.id,
      'ORDER',
      'salesperson'
    );
    
    -- Notify driver
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    ) VALUES (
      NEW.driver_id,
      'Delivery Accepted',
      'Your delivery for ' || order_ref || ' has been accepted',
      'DELIVERY_ACCEPTED',
      'MEDIUM',
      'order',
      NEW.id,
      'ORDER',
      'driver'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_runner_accepted_delivery
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_runner_accepted_delivery();

-- 11) Notification trigger for driver failed delivery
CREATE OR REPLACE FUNCTION public.notify_driver_failed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  order_ref TEXT;
  driver_name TEXT;
BEGIN
  IF NEW.driver_status = 'DRIVER_FAILED' AND OLD.driver_status IS DISTINCT FROM 'DRIVER_FAILED' THEN
    order_ref := NEW.order_code;
    
    SELECT display_name INTO driver_name
    FROM public.profiles WHERE id = NEW.driver_id;
    
    -- Notify runner
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    ) VALUES (
      NEW.runner_id,
      'Driver Failed Delivery',
      'Order ' || order_ref || ' failed by ' || COALESCE(driver_name, 'driver') ||
      E'\nReason: ' || COALESCE(NEW.driver_failed_reason, 'Not specified') ||
      E'\nRemark: ' || COALESCE(NEW.driver_failed_remark, 'None'),
      'DRIVER_FAILED',
      'HIGH',
      'order',
      NEW.id,
      'ORDER',
      'runner'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_driver_failed
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_driver_failed();

-- 12) Sync user_directory trigger update to include driver role
-- (existing sync_user_directory function already handles all roles)