-- Add runner review fields to orders table
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS runner_review_status text DEFAULT 'NOT_REVIEWED',
ADD COLUMN IF NOT EXISTS runner_final_outcome text,
ADD COLUMN IF NOT EXISTS runner_failed_reason_id uuid REFERENCES public.reasons(id),
ADD COLUMN IF NOT EXISTS runner_comment text,
ADD COLUMN IF NOT EXISTS runner_reviewed_at timestamptz,
ADD COLUMN IF NOT EXISTS runner_reviewed_by uuid REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS salesperson_action_required boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS salesperson_action_type text,
ADD COLUMN IF NOT EXISTS salesperson_action_due_date date,
ADD COLUMN IF NOT EXISTS last_status_note text,
ADD COLUMN IF NOT EXISTS reschedule_flag boolean DEFAULT false;

-- Add check constraints for enum values
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS check_runner_review_status;
ALTER TABLE public.orders ADD CONSTRAINT check_runner_review_status 
  CHECK (runner_review_status IN ('NOT_REVIEWED', 'REVIEWED', 'ACTION_REQUIRED'));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS check_runner_final_outcome;
ALTER TABLE public.orders ADD CONSTRAINT check_runner_final_outcome 
  CHECK (runner_final_outcome IS NULL OR runner_final_outcome IN ('CONFIRM_DELIVERED', 'CONFIRM_FAILED', 'RESCHEDULE', 'NEED_SALESPERSON_FOLLOWUP'));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS check_salesperson_action_type;
ALTER TABLE public.orders ADD CONSTRAINT check_salesperson_action_type 
  CHECK (salesperson_action_type IS NULL OR salesperson_action_type IN ('FOLLOWUP_CUSTOMER', 'RESCHEDULE_DELIVERY', 'UPDATE_ADDRESS', 'CANCEL_ORDER'));

-- Create notification trigger for salesperson action required
CREATE OR REPLACE FUNCTION public.notify_salesperson_action_required()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  order_ref TEXT;
  runner_name TEXT;
  reason_label TEXT;
BEGIN
  -- Only trigger when salesperson_action_required changes to true
  IF NEW.salesperson_action_required = true AND (OLD.salesperson_action_required IS DISTINCT FROM true) THEN
    order_ref := NEW.order_code;
    
    SELECT display_name INTO runner_name
    FROM public.profiles WHERE id = NEW.runner_id;
    
    -- Get reason label if exists
    IF NEW.runner_failed_reason_id IS NOT NULL THEN
      SELECT label INTO reason_label
      FROM public.reasons WHERE id = NEW.runner_failed_reason_id;
    END IF;
    
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    ) VALUES (
      NEW.salesperson_id,
      'Action Required: ORD-' || order_ref,
      'Order requires your attention' ||
      E'\nOutcome: ' || COALESCE(NEW.runner_final_outcome, 'Pending') ||
      CASE WHEN reason_label IS NOT NULL THEN E'\nReason: ' || reason_label ELSE '' END ||
      CASE WHEN NEW.runner_comment IS NOT NULL THEN E'\nNote: ' || NEW.runner_comment ELSE '' END ||
      CASE WHEN NEW.next_delivery_date IS NOT NULL THEN E'\nNext Delivery: ' || NEW.next_delivery_date::text ELSE '' END,
      'SALESPERSON_ACTION_REQUIRED',
      'HIGH',
      'order',
      NEW.id,
      'ORDER',
      'salesperson'
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_notify_salesperson_action ON public.orders;
CREATE TRIGGER trigger_notify_salesperson_action
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_salesperson_action_required();