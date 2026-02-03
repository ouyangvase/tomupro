-- Add driver_id column to cash_liabilities
ALTER TABLE public.cash_liabilities
ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES profiles(id);

-- Add driver_payment_method to orders (what driver reported)
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS driver_payment_method text;

-- Update RLS: Drivers can insert their own liabilities
DROP POLICY IF EXISTS "System creates liabilities" ON cash_liabilities;
CREATE POLICY "Drivers create own liabilities"
ON cash_liabilities FOR INSERT
WITH CHECK (driver_id = auth.uid());

-- Runners can view liabilities from their drivers
DROP POLICY IF EXISTS "Runners view own liabilities" ON cash_liabilities;
CREATE POLICY "Runners view driver liabilities"
ON cash_liabilities FOR SELECT
USING (
  runner_id = auth.uid() OR
  driver_id = auth.uid() OR
  get_user_role(auth.uid()) IN ('admin', 'manager')
);

-- Runners can update (settle) liabilities from their drivers
DROP POLICY IF EXISTS "Runners settle own liabilities" ON cash_liabilities;
CREATE POLICY "Runners settle driver liabilities"
ON cash_liabilities FOR UPDATE
USING (runner_id = auth.uid() AND status = 'OPEN');

-- Add index for driver queries
CREATE INDEX IF NOT EXISTS idx_cash_liabilities_driver_id ON cash_liabilities(driver_id);