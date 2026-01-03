-- Fix notify_runner_assigned trigger
CREATE OR REPLACE FUNCTION public.notify_runner_assigned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  order_ref TEXT;
  runner_name TEXT;
BEGIN
  IF NEW.runner_status = 'ASSIGNED' AND OLD.runner_status = 'UNASSIGNED' AND NEW.runner_id IS NOT NULL THEN
    order_ref := NEW.order_code;
    
    SELECT display_name INTO runner_name
    FROM public.profiles WHERE id = NEW.runner_id;
    
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
      NEW.id,
      'ORDER',
      OLD.runner_status::text,
      NEW.runner_status::text,
      'runner'
    );
    
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
      NEW.id,
      'ORDER',
      OLD.runner_status::text,
      NEW.runner_status::text,
      'salesperson'
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Fix notify_order_delivered trigger
CREATE OR REPLACE FUNCTION public.notify_order_delivered()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  order_ref TEXT;
  salesperson_name TEXT;
  runner_name TEXT;
  delivered_time TIMESTAMP WITH TIME ZONE;
  admin_user RECORD;
  manager_user RECORD;
BEGIN
  IF NEW.runner_status = 'DELIVERED' AND OLD.runner_status IS DISTINCT FROM 'DELIVERED' THEN
    order_ref := NEW.order_code;
    delivered_time := COALESCE(NEW.delivered_at, NOW());
    
    SELECT display_name INTO salesperson_name
    FROM public.profiles WHERE id = NEW.salesperson_id;
    
    SELECT display_name INTO runner_name
    FROM public.profiles WHERE id = NEW.runner_id;
    
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
      NEW.id,
      'ORDER',
      OLD.runner_status::text,
      NEW.runner_status::text,
      'salesperson'
    );
    
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
        NEW.id,
        'ORDER',
        OLD.runner_status::text,
        NEW.runner_status::text,
        'runner'
      );
    END IF;
    
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
        NEW.id,
        'ORDER',
        OLD.runner_status::text,
        NEW.runner_status::text,
        'manager'
      );
    END LOOP;
    
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
        NEW.id,
        'ORDER',
        OLD.runner_status::text,
        NEW.runner_status::text,
        'admin'
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Fix notify_order_failed_delivery trigger
CREATE OR REPLACE FUNCTION public.notify_order_failed_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  order_ref TEXT;
  salesperson_name TEXT;
  runner_name TEXT;
  admin_user RECORD;
BEGIN
  IF NEW.runner_status = 'FAILED_DELIVERY' AND OLD.runner_status IS DISTINCT FROM 'FAILED_DELIVERY' THEN
    order_ref := NEW.order_code;
    
    SELECT display_name INTO salesperson_name
    FROM public.profiles WHERE id = NEW.salesperson_id;
    
    SELECT display_name INTO runner_name
    FROM public.profiles WHERE id = NEW.runner_id;
    
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
      NEW.id,
      'ORDER',
      OLD.runner_status::text,
      NEW.runner_status::text,
      'salesperson'
    );
    
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
        NEW.id,
        'ORDER',
        OLD.runner_status::text,
        NEW.runner_status::text,
        'admin'
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Fix notify_order_dispute trigger
CREATE OR REPLACE FUNCTION public.notify_order_dispute()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  order_ref TEXT;
  salesperson_name TEXT;
  runner_name TEXT;
  admin_user RECORD;
BEGIN
  IF NEW.reconciliation_status = 'DISPUTE' AND OLD.reconciliation_status IS DISTINCT FROM 'DISPUTE' THEN
    order_ref := NEW.order_code;
    
    SELECT display_name INTO salesperson_name
    FROM public.profiles WHERE id = NEW.salesperson_id;
    
    SELECT display_name INTO runner_name
    FROM public.profiles WHERE id = NEW.runner_id;
    
    FOR admin_user IN
      SELECT id FROM public.profiles WHERE role = 'admin'
    LOOP
      INSERT INTO public.notifications (
        user_id, title, message, type, priority,
        reference_type, reference_id, entity_type,
        status_from, status_to, recipient_role
      ) VALUES (
        admin_user.id,
        'Dispute Raised - ORD-' || order_ref,
        'Dispute raised on order' ||
        E'\nReason: ' || COALESCE(NEW.dispute_reason, 'Not specified') ||
        E'\nSalesperson: ' || COALESCE(salesperson_name, 'Unknown') ||
        E'\nRunner: ' || COALESCE(runner_name, 'Unassigned'),
        'DISPUTE',
        'HIGH',
        'order',
        NEW.id,
        'ORDER',
        OLD.reconciliation_status::text,
        NEW.reconciliation_status::text,
        'admin'
      );
    END LOOP;
    
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type,
      status_from, status_to, recipient_role
    ) VALUES (
      NEW.salesperson_id,
      'Order Dispute - ORD-' || order_ref,
      'Dispute raised on your order' ||
      E'\nReason: ' || COALESCE(NEW.dispute_reason, 'Not specified'),
      'DISPUTE',
      'HIGH',
      'order',
      NEW.id,
      'ORDER',
      OLD.reconciliation_status::text,
      NEW.reconciliation_status::text,
      'salesperson'
    );
    
    IF NEW.runner_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id, title, message, type, priority,
        reference_type, reference_id, entity_type,
        status_from, status_to, recipient_role
      ) VALUES (
        NEW.runner_id,
        'Dispute Attention Required',
        'ORD-' || order_ref || ' has a dispute' ||
        E'\nReason: ' || COALESCE(NEW.dispute_reason, 'Not specified'),
        'DISPUTE',
        'MEDIUM',
        'order',
        NEW.id,
        'ORDER',
        OLD.reconciliation_status::text,
        NEW.reconciliation_status::text,
        'runner'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Fix notify_claim_batch_submitted trigger
CREATE OR REPLACE FUNCTION public.notify_claim_batch_submitted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  runner_name TEXT;
  order_count INTEGER;
  admin_user RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT display_name INTO runner_name
    FROM public.profiles WHERE id = NEW.runner_id;
    
    SELECT COUNT(*) INTO order_count
    FROM public.claim_batch_items WHERE batch_id = NEW.id;
    
    FOR admin_user IN
      SELECT id FROM public.profiles WHERE role = 'admin'
    LOOP
      INSERT INTO public.notifications (
        user_id, title, message, type, priority,
        reference_type, reference_id, entity_type,
        status_from, status_to, recipient_role
      ) VALUES (
        admin_user.id,
        'Claim Batch Submitted',
        'Runner ' || COALESCE(runner_name, 'Unknown') || ' submitted claim batch' ||
        E'\nOrders: ' || COALESCE(order_count, 0)::text ||
        E'\nTotal: RM' || NEW.total_amount::text ||
        E'\nAwaiting acknowledgment',
        'CLAIM_SUBMITTED',
        'HIGH',
        'claim_batch',
        NEW.id,
        'CLAIM_BATCH',
        NULL,
        NEW.status::text,
        'admin'
      );
    END LOOP;
    
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type,
      status_from, status_to, recipient_role
    ) VALUES (
      NEW.runner_id,
      'Claim Batch Submitted',
      'Your claim batch has been submitted' ||
      E'\nTotal: RM' || NEW.total_amount::text ||
      E'\nAwaiting admin acknowledgment',
      'CLAIM_SUBMITTED',
      'MEDIUM',
      'claim_batch',
      NEW.id,
      'CLAIM_BATCH',
      NULL,
      NEW.status::text,
      'runner'
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Fix notify_claim_batch_acknowledged trigger
CREATE OR REPLACE FUNCTION public.notify_claim_batch_acknowledged()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  admin_name TEXT;
BEGIN
  IF NEW.status = 'CLAIMED' AND OLD.status = 'ADMIN_ACK_PENDING' THEN
    SELECT display_name INTO admin_name
    FROM public.profiles WHERE id = NEW.admin_ack_by;
    
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type,
      status_from, status_to, recipient_role
    ) VALUES (
      NEW.runner_id,
      'Claim Batch Acknowledged',
      'Your claim batch has been acknowledged by ' || COALESCE(admin_name, 'Admin') ||
      E'\nTotal: RM' || NEW.total_amount::text ||
      E'\nStatus: Settled',
      'CLAIM_ACKED',
      'MEDIUM',
      'claim_batch',
      NEW.id,
      'CLAIM_BATCH',
      OLD.status::text,
      NEW.status::text,
      'runner'
    );
  END IF;
  
  RETURN NEW;
END;
$function$;