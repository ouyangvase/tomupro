-- Fix 1: Update stock_movements RLS policy to also allow manager role
DROP POLICY IF EXISTS "Create stock movements for authorized users" ON stock_movements;

CREATE POLICY "Create stock movements for authorized users"
ON stock_movements
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND get_user_role(auth.uid()) IN ('salesperson', 'admin', 'runner', 'manager')
);

-- Fix 2: Update check constraint to allow 'FAILED_DELIVERY' as a valid salesperson_action_type
ALTER TABLE orders DROP CONSTRAINT IF EXISTS check_salesperson_action_type;

ALTER TABLE orders ADD CONSTRAINT check_salesperson_action_type
CHECK (
  salesperson_action_type IS NULL
  OR salesperson_action_type IN ('FOLLOWUP_CUSTOMER', 'RESCHEDULE_DELIVERY', 'UPDATE_ADDRESS', 'CANCEL_ORDER', 'FAILED_DELIVERY')
);