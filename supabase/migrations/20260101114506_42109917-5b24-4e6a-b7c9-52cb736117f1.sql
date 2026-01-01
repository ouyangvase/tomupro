-- Create a trigger function to block non-admin updates on delivered orders
CREATE OR REPLACE FUNCTION public.check_delivered_order_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role app_role;
BEGIN
  -- Get the current user's role
  user_role := get_user_role(auth.uid());
  
  -- Check if the order was already delivered (OLD runner_status = 'DELIVERED')
  -- and user is not admin
  IF OLD.runner_status = 'DELIVERED' AND user_role != 'admin' THEN
    -- Block any status change attempts by non-admin
    RAISE EXCEPTION 'Order already delivered. Only admin can modify status.';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger on the orders table
DROP TRIGGER IF EXISTS check_delivered_order_lock_trigger ON public.orders;
CREATE TRIGGER check_delivered_order_lock_trigger
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.check_delivered_order_lock();