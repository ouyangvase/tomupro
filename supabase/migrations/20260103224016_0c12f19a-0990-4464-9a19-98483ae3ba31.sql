-- Add operational tracking fields to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS operational_status text NOT NULL DEFAULT 'NEW',
ADD COLUMN IF NOT EXISTS reschedule_cycle_no integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS reopened_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS rescheduled_from_status text NULL;

-- Update existing orders to set operational_status based on current runner_status
UPDATE public.orders
SET operational_status = CASE
  WHEN runner_status = 'DELIVERED' THEN 'DELIVERED_FINAL'
  WHEN runner_status = 'FAILED_DELIVERY' THEN 'DRIVER_FAILED'
  WHEN runner_status = 'TAKEN' AND driver_id IS NOT NULL THEN 'WITH_DRIVER'
  WHEN runner_status = 'TAKEN' THEN 'TAKEN'
  WHEN runner_status = 'ASSIGNED' THEN 'ASSIGNED'
  WHEN status = 'CANCELLED' THEN 'CANCELLED'
  WHEN status = 'READY' THEN 'NEW'
  ELSE 'NEW'
END
WHERE operational_status = 'NEW';

-- Create function to auto-reopen rescheduled orders on next_delivery_date
CREATE OR REPLACE FUNCTION public.reopen_rescheduled_orders()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
  order_record RECORD;
BEGIN
  -- Find orders that are due for reopening today
  FOR order_record IN
    SELECT id, order_code, runner_id, salesperson_id, runner_comment, next_delivery_date
    FROM public.orders
    WHERE next_delivery_date = CURRENT_DATE
      AND operational_status IN ('RESCHEDULED', 'DRIVER_FAILED')
      AND status != 'CANCELLED'
      AND (reopened_at IS NULL OR reopened_at::date < CURRENT_DATE)
  LOOP
    -- Update the order to reopen it
    UPDATE public.orders
    SET 
      operational_status = 'NEW',
      driver_id = NULL,
      driver_status = 'UNASSIGNED',
      reopened_at = now(),
      last_status_note = COALESCE(runner_comment, 'Rescheduled delivery due today')
    WHERE id = order_record.id;
    
    -- Notify runner
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    ) VALUES (
      order_record.runner_id,
      'Order Due Today: ' || order_record.order_code,
      'Order ' || order_record.order_code || ' is scheduled for delivery today.' ||
      CASE WHEN order_record.runner_comment IS NOT NULL 
        THEN E'\nRemark: ' || order_record.runner_comment 
        ELSE '' 
      END ||
      E'\nPlease assign a driver.',
      'ORDER_REOPENED',
      'HIGH',
      'order',
      order_record.id,
      'ORDER',
      'runner'
    );
    
    -- Notify salesperson
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    ) VALUES (
      order_record.salesperson_id,
      'Order Reopened: ' || order_record.order_code,
      'Order ' || order_record.order_code || ' has been reopened for delivery today.' ||
      CASE WHEN order_record.runner_comment IS NOT NULL 
        THEN E'\nRemark: ' || order_record.runner_comment 
        ELSE '' 
      END,
      'ORDER_REOPENED',
      'MEDIUM',
      'order',
      order_record.id,
      'ORDER',
      'salesperson'
    );
    
    updated_count := COALESCE(updated_count, 0) + 1;
  END LOOP;
  
  RETURN json_build_object('success', true, 'updated_count', COALESCE(updated_count, 0));
END;
$$;