-- Fix the notify_delivery_charge_proposed trigger to not cast uuid to text
CREATE OR REPLACE FUNCTION public.notify_delivery_charge_proposed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  runner_name TEXT;
  admin_user RECORD;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'PENDING' THEN
    -- Get runner name
    SELECT display_name INTO runner_name
    FROM public.profiles WHERE id = NEW.runner_id;
    
    -- Notify all Admins
    FOR admin_user IN
      SELECT id FROM public.profiles WHERE role = 'admin'
    LOOP
      INSERT INTO public.notifications (
        user_id, title, message, type, priority,
        reference_type, reference_id, entity_type, recipient_role
      ) VALUES (
        admin_user.id,
        'Delivery Charge Proposal',
        'Runner ' || COALESCE(runner_name, 'Unknown') || ' proposed delivery charge' ||
        E'\nArea: ' || NEW.area ||
        E'\nAmount: RM' || NEW.charge_amount::text ||
        E'\nAwaiting approval',
        'DELIVERY_CHARGE_PROPOSED',
        'HIGH',
        'delivery_charge',
        NEW.id,
        'DELIVERY_CHARGE',
        'admin'
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Also fix the notify_delivery_charge_decision trigger
CREATE OR REPLACE FUNCTION public.notify_delivery_charge_decision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  admin_name TEXT;
BEGIN
  -- On approval
  IF NEW.status = 'APPROVED' AND OLD.status = 'PENDING' THEN
    SELECT display_name INTO admin_name
    FROM public.profiles WHERE id = NEW.approved_by;
    
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    ) VALUES (
      NEW.runner_id,
      'Delivery Charge Approved',
      'Your delivery charge proposal has been approved' ||
      E'\nArea: ' || NEW.area ||
      E'\nAmount: RM' || NEW.charge_amount::text ||
      E'\nApproved by: ' || COALESCE(admin_name, 'Admin'),
      'DELIVERY_CHARGE_APPROVED',
      'MEDIUM',
      'delivery_charge',
      NEW.id,
      'DELIVERY_CHARGE',
      'runner'
    );
  END IF;
  
  -- On rejection
  IF NEW.status = 'REJECTED' AND OLD.status = 'PENDING' THEN
    SELECT display_name INTO admin_name
    FROM public.profiles WHERE id = NEW.approved_by;
    
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    ) VALUES (
      NEW.runner_id,
      'Delivery Charge Rejected',
      'Your delivery charge proposal has been rejected' ||
      E'\nArea: ' || NEW.area ||
      E'\nAmount: RM' || NEW.charge_amount::text ||
      CASE WHEN NEW.rejection_remark IS NOT NULL 
        THEN E'\nReason: ' || NEW.rejection_remark 
        ELSE '' 
      END,
      'DELIVERY_CHARGE_REJECTED',
      'MEDIUM',
      'delivery_charge',
      NEW.id,
      'DELIVERY_CHARGE',
      'runner'
    );
  END IF;
  
  RETURN NEW;
END;
$function$;