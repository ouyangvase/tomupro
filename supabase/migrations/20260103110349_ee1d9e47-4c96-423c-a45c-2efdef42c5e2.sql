-- Create function for claim batch submission notifications
CREATE OR REPLACE FUNCTION public.notify_claim_batch_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  runner_name TEXT;
  order_count INTEGER;
  admin_user RECORD;
BEGIN
  -- Only trigger on new claim batch insertion
  IF TG_OP = 'INSERT' THEN
    -- Get runner name
    SELECT display_name INTO runner_name
    FROM public.profiles WHERE id = NEW.runner_id;
    
    -- Get order count
    SELECT COUNT(*) INTO order_count
    FROM public.claim_batch_items WHERE batch_id = NEW.id;
    
    -- Notify all Admins
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
        NEW.id::text,
        'CLAIM_BATCH',
        NULL,
        NEW.status::text,
        'admin'
      );
    END LOOP;
    
    -- Notify Runner (confirmation)
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
      NEW.id::text,
      'CLAIM_BATCH',
      NULL,
      NEW.status::text,
      'runner'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for claim batch submission
DROP TRIGGER IF EXISTS trigger_notify_claim_batch_submitted ON public.claim_batches;
CREATE TRIGGER trigger_notify_claim_batch_submitted
  AFTER INSERT ON public.claim_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_claim_batch_submitted();

-- Create function for claim batch acknowledgment notifications
CREATE OR REPLACE FUNCTION public.notify_claim_batch_acknowledged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_name TEXT;
BEGIN
  -- Only trigger when status changes to CLAIMED
  IF NEW.status = 'CLAIMED' AND OLD.status = 'ADMIN_ACK_PENDING' THEN
    -- Get admin name who acknowledged
    SELECT display_name INTO admin_name
    FROM public.profiles WHERE id = NEW.admin_ack_by;
    
    -- Notify Runner
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
      NEW.id::text,
      'CLAIM_BATCH',
      OLD.status::text,
      NEW.status::text,
      'runner'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for claim batch acknowledgment
DROP TRIGGER IF EXISTS trigger_notify_claim_batch_acknowledged ON public.claim_batches;
CREATE TRIGGER trigger_notify_claim_batch_acknowledged
  AFTER UPDATE ON public.claim_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_claim_batch_acknowledged();

-- Create function for dispute notifications
CREATE OR REPLACE FUNCTION public.notify_order_dispute()
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
  -- Only trigger when reconciliation_status changes to DISPUTE
  IF NEW.reconciliation_status = 'DISPUTE' AND OLD.reconciliation_status IS DISTINCT FROM 'DISPUTE' THEN
    order_ref := NEW.order_code;
    
    -- Get names
    SELECT display_name INTO salesperson_name
    FROM public.profiles WHERE id = NEW.salesperson_id;
    
    SELECT display_name INTO runner_name
    FROM public.profiles WHERE id = NEW.runner_id;
    
    -- Notify all Admins
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
        NEW.id::text,
        'ORDER',
        OLD.reconciliation_status::text,
        NEW.reconciliation_status::text,
        'admin'
      );
    END LOOP;
    
    -- Notify Salesperson
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
      NEW.id::text,
      'ORDER',
      OLD.reconciliation_status::text,
      NEW.reconciliation_status::text,
      'salesperson'
    );
    
    -- Notify Runner if assigned
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
        NEW.id::text,
        'ORDER',
        OLD.reconciliation_status::text,
        NEW.reconciliation_status::text,
        'runner'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for dispute notifications
DROP TRIGGER IF EXISTS trigger_notify_order_dispute ON public.orders;
CREATE TRIGGER trigger_notify_order_dispute
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_order_dispute();