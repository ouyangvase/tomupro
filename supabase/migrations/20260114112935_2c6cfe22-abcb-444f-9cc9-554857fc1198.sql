-- Add created_by columns for permanent order attribution
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS created_by_user_id uuid,
ADD COLUMN IF NOT EXISTS created_by_name_snapshot text;

-- Backfill existing orders: copy salesperson_id to created_by_user_id
UPDATE public.orders 
SET created_by_user_id = salesperson_id
WHERE created_by_user_id IS NULL;

-- Backfill created_by_name_snapshot from profiles
UPDATE public.orders o
SET created_by_name_snapshot = p.display_name
FROM public.profiles p
WHERE o.salesperson_id = p.id 
AND o.created_by_name_snapshot IS NULL;

-- Make created_by_user_id NOT NULL after backfill
ALTER TABLE public.orders 
ALTER COLUMN created_by_user_id SET NOT NULL;

-- Add default for new orders
ALTER TABLE public.orders 
ALTER COLUMN created_by_user_id SET DEFAULT auth.uid();

-- Create trigger to auto-populate created_by_name_snapshot on insert
CREATE OR REPLACE FUNCTION public.set_order_created_by_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set on INSERT if not already provided
  IF NEW.created_by_name_snapshot IS NULL THEN
    SELECT display_name INTO NEW.created_by_name_snapshot
    FROM public.profiles
    WHERE id = NEW.salesperson_id;
    
    -- Fallback if profile not found
    IF NEW.created_by_name_snapshot IS NULL THEN
      NEW.created_by_name_snapshot := 'Unknown User';
    END IF;
  END IF;
  
  -- Set created_by_user_id if not provided
  IF NEW.created_by_user_id IS NULL THEN
    NEW.created_by_user_id := NEW.salesperson_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS set_order_created_by_snapshot_trigger ON public.orders;
CREATE TRIGGER set_order_created_by_snapshot_trigger
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.set_order_created_by_snapshot();

-- Update RLS policies for Admin/Manager to view all orders regardless of profile status
-- Drop existing manager policies that check salesperson_id against active profiles
DROP POLICY IF EXISTS "Manager can view group member orders" ON public.orders;
DROP POLICY IF EXISTS "Manager can view team orders" ON public.orders;

-- Recreate manager SELECT policy using created_by_user_id instead of salesperson_id
CREATE POLICY "Manager can view team orders including inactive"
ON public.orders FOR SELECT
USING (
  get_user_role(auth.uid()) = 'manager'::app_role 
  AND (
    created_by_user_id = auth.uid() 
    OR salesperson_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM manager_groups mg
      JOIN group_members gm ON gm.group_id = mg.id
      WHERE mg.manager_user_id = auth.uid() 
      AND (gm.member_user_id = orders.salesperson_id OR gm.member_user_id = orders.created_by_user_id)
    )
    OR is_in_manager_team(salesperson_id, auth.uid())
    OR is_in_manager_team(created_by_user_id, auth.uid())
  )
);