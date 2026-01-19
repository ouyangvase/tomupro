-- Add composite indexes to improve query performance on orders table
-- These indexes will help with the common filter patterns used in the app

-- Index for status + created_at (used for listing orders by status)
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at 
ON public.orders(status, created_at DESC);

-- Index for salesperson_id + status (used for team visibility filtering)
CREATE INDEX IF NOT EXISTS idx_orders_salesperson_status 
ON public.orders(salesperson_id, status);

-- Index for runner_id + runner_status (used for runner inbox)
CREATE INDEX IF NOT EXISTS idx_orders_runner_status 
ON public.orders(runner_id, runner_status);

-- Index for status + runner_status (used for filtering READY orders by runner status)
CREATE INDEX IF NOT EXISTS idx_orders_status_runner_status 
ON public.orders(status, runner_status);

-- Index on salesperson_action_required for action inbox queries
CREATE INDEX IF NOT EXISTS idx_orders_salesperson_action_required 
ON public.orders(salesperson_action_required) 
WHERE salesperson_action_required = true;