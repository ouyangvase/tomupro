-- Fix RLS policy for products table to allow managers to see team products in embedded joins
-- This fixes the "No items" display issue when managers view team orders

-- Drop existing policy that uses created_by (incorrect field)
DROP POLICY IF EXISTS "Manager can view team products" ON products;

-- Create corrected policy that uses owner_user_id
CREATE POLICY "Manager can view team products" ON products
  FOR SELECT
  TO public
  USING (
    (get_user_role(auth.uid()) = 'manager'::app_role) 
    AND (
      (owner_user_id = auth.uid())  -- Own products
      OR is_in_manager_team(owner_user_id, auth.uid())  -- Team products
    )
  );