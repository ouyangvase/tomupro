-- Add missing columns for status tracking in notifications
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS status_from TEXT,
ADD COLUMN IF NOT EXISTS status_to TEXT;

-- Create the notification function for order status changes
CREATE OR REPLACE FUNCTION public.notify_order_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  order_ref TEXT;
  salesperson_name TEXT;
  runner_name TEXT;
  delivered_time TIMESTAMP WITH TIME ZONE;
  admin_user RECORD;
  manager_user RECORD;
BEGIN
  -- Only trigger when runner_status changes to DELIVERED
  IF NEW.runner_status = 'DELIVERED' AND OLD.runner_status IS DISTINCT FROM 'DELIVERED' THEN
    order_ref := NEW.order_code;
    delivered_time := COALESCE(NEW.delivered_at, NOW());
    
    -- Get salesperson name
    SELECT display_name INTO salesperson_name
    FROM public.profiles WHERE id = NEW.salesperson_id;
    
    -- Get runner name
    SELECT display_name INTO runner_name
    FROM public.profiles WHERE id = NEW.runner_id;
    
    -- 1) Notify Salesperson
    INSERT INTO public.notifications (
      user_id, title, message, type, priority, 
      reference_type, reference_id, entity_type,
      status_from, status_to, recipient_role
    ) VALUES (
      NEW.salesperson_id,
      'ORD-' || order_ref || ' Delivered',
      'Delivered on ' || to_char(delivered_time, 'DD Mon YYYY, HH24:MI') || 
      E'\nRunner: ' || COALESCE(runner_name, 'Unknown') ||
      E'\nReady for reconciliation',
      'DELIVERED',
      'MEDIUM',
      'order',
      NEW.id::text,
      'ORDER',
      OLD.runner_status::text,
      NEW.runner_status::text,
      'salesperson'
    );
    
    -- 2) Notify Runner
    IF NEW.runner_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id, title, message, type, priority,
        reference_type, reference_id, entity_type,
        status_from, status_to, recipient_role
      ) VALUES (
        NEW.runner_id,
        'Delivery Completed',
        'ORD-' || order_ref || ' delivered at ' || to_char(delivered_time, 'HH24:MI') ||
        E'\nWaiting for reconciliation',
        'DELIVERED',
        'LOW',
        'order',
        NEW.id::text,
        'ORDER',
        OLD.runner_status::text,
        NEW.runner_status::text,
        'runner'
      );
    END IF;
    
    -- 3) Notify all Managers in groups that contain this salesperson
    FOR manager_user IN
      SELECT DISTINCT mg.manager_user_id
      FROM public.manager_groups mg
      JOIN public.group_members gm ON gm.group_id = mg.id
      WHERE gm.member_user_id = NEW.salesperson_id
    LOOP
      INSERT INTO public.notifications (
        user_id, title, message, type, priority,
        reference_type, reference_id, entity_type,
        status_from, status_to, recipient_role
      ) VALUES (
        manager_user.manager_user_id,
        'Order Delivered',
        'ORD-' || order_ref || ' delivered' ||
        E'\nSalesperson: ' || COALESCE(salesperson_name, 'Unknown'),
        'DELIVERED',
        'LOW',
        'order',
        NEW.id::text,
        'ORDER',
        OLD.runner_status::text,
        NEW.runner_status::text,
        'manager'
      );
    END LOOP;
    
    -- 4) Notify all Admins
    FOR admin_user IN
      SELECT id FROM public.profiles WHERE role = 'admin'
    LOOP
      INSERT INTO public.notifications (
        user_id, title, message, type, priority,
        reference_type, reference_id, entity_type,
        status_from, status_to, recipient_role
      ) VALUES (
        admin_user.id,
        'Order Delivered',
        'ORD-' || order_ref || ' delivered at ' || to_char(delivered_time, 'DD Mon YYYY, HH24:MI') ||
        E'\nStock deducted | Reconciliation pending',
        'DELIVERED',
        'LOW',
        'order',
        NEW.id::text,
        'ORDER',
        OLD.runner_status::text,
        NEW.runner_status::text,
        'admin'
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for order delivered notifications
DROP TRIGGER IF EXISTS trigger_notify_order_delivered ON public.orders;
CREATE TRIGGER trigger_notify_order_delivered
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_order_delivered();

-- Create function for failed delivery notifications
CREATE OR REPLACE FUNCTION public.notify_order_failed_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  order_ref TEXT;
  salesperson_name TEXT;
  runner_name TEXT;
  admin_user RECORD;
BEGIN
  -- Only trigger when runner_status changes to FAILED_DELIVERY
  IF NEW.runner_status = 'FAILED_DELIVERY' AND OLD.runner_status IS DISTINCT FROM 'FAILED_DELIVERY' THEN
    order_ref := NEW.order_code;
    
    -- Get salesperson name
    SELECT display_name INTO salesperson_name
    FROM public.profiles WHERE id = NEW.salesperson_id;
    
    -- Get runner name
    SELECT display_name INTO runner_name
    FROM public.profiles WHERE id = NEW.runner_id;
    
    -- Notify Salesperson
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type,
      status_from, status_to, recipient_role
    ) VALUES (
      NEW.salesperson_id,
      'ORD-' || order_ref || ' Delivery Failed',
      'Delivery failed: ' || COALESCE(NEW.failed_reason, 'No reason provided') ||
      E'\nRunner: ' || COALESCE(runner_name, 'Unknown') ||
      E'\nNext step: ' || COALESCE(NEW.failed_next_step::text, 'Pending'),
      'FAILED_DELIVERY',
      'HIGH',
      'order',
      NEW.id::text,
      'ORDER',
      OLD.runner_status::text,
      NEW.runner_status::text,
      'salesperson'
    );
    
    -- Notify Admins
    FOR admin_user IN
      SELECT id FROM public.profiles WHERE role = 'admin'
    LOOP
      INSERT INTO public.notifications (
        user_id, title, message, type, priority,
        reference_type, reference_id, entity_type,
        status_from, status_to, recipient_role
      ) VALUES (
        admin_user.id,
        'Delivery Failed',
        'ORD-' || order_ref || ' delivery failed' ||
        E'\nReason: ' || COALESCE(NEW.failed_reason, 'Not specified') ||
        E'\nSalesperson: ' || COALESCE(salesperson_name, 'Unknown'),
        'FAILED_DELIVERY',
        'MEDIUM',
        'order',
        NEW.id::text,
        'ORDER',
        OLD.runner_status::text,
        NEW.runner_status::text,
        'admin'
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for failed delivery notifications
DROP TRIGGER IF EXISTS trigger_notify_order_failed_delivery ON public.orders;
CREATE TRIGGER trigger_notify_order_failed_delivery
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_order_failed_delivery();

-- Create function for runner assignment notifications
CREATE OR REPLACE FUNCTION public.notify_runner_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  order_ref TEXT;
  runner_name TEXT;
BEGIN
  -- Only trigger when runner_status changes to ASSIGNED
  IF NEW.runner_status = 'ASSIGNED' AND OLD.runner_status = 'UNASSIGNED' AND NEW.runner_id IS NOT NULL THEN
    order_ref := NEW.order_code;
    
    -- Get runner name
    SELECT display_name INTO runner_name
    FROM public.profiles WHERE id = NEW.runner_id;
    
    -- Notify Runner
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type,
      status_from, status_to, recipient_role
    ) VALUES (
      NEW.runner_id,
      'New Delivery Assigned',
      'ORD-' || order_ref || ' assigned to you' ||
      E'\nCustomer: ' || NEW.customer_name ||
      E'\nArea: ' || COALESCE(NEW.area, 'Not specified') ||
      E'\nAmount: RM' || NEW.total_amount::text,
      'RUNNER_ASSIGNED',
      'HIGH',
      'order',
      NEW.id::text,
      'ORDER',
      OLD.runner_status::text,
      NEW.runner_status::text,
      'runner'
    );
    
    -- Notify Salesperson
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type,
      status_from, status_to, recipient_role
    ) VALUES (
      NEW.salesperson_id,
      'Runner Assigned',
      'ORD-' || order_ref || ' assigned to ' || COALESCE(runner_name, 'Unknown'),
      'RUNNER_ASSIGNED',
      'LOW',
      'order',
      NEW.id::text,
      'ORDER',
      OLD.runner_status::text,
      NEW.runner_status::text,
      'salesperson'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for runner assignment notifications
DROP TRIGGER IF EXISTS trigger_notify_runner_assigned ON public.orders;
CREATE TRIGGER trigger_notify_runner_assigned
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_runner_assigned();