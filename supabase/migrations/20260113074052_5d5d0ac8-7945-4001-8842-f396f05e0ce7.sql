
-- Add RLS policy to allow runners to view products by owner_user_id for inbound shipment dropdown
-- This allows runners to see products owned by any salesperson (for selecting in inbound forms)
CREATE POLICY "Runner can view products for inbound selection"
ON products
FOR SELECT
USING (
  get_user_role(auth.uid()) = 'runner'::app_role
  AND is_active = true
);
