-- Add buffer_qty column to driver_pickup_items for proper Required/Buffer/Total tracking
-- Current: qty (actual), suggested_qty (system calculated)
-- New: required_qty (from orders), buffer_qty (runner extra), qty becomes total

-- Rename suggested_qty to required_qty (since that's what it represents)
ALTER TABLE public.driver_pickup_items 
  RENAME COLUMN suggested_qty TO required_qty;

-- Add buffer_qty column (defaults to 0)
ALTER TABLE public.driver_pickup_items 
  ADD COLUMN IF NOT EXISTS buffer_qty integer NOT NULL DEFAULT 0;

-- Update existing records: buffer_qty = qty - required_qty (if positive)
UPDATE public.driver_pickup_items 
SET buffer_qty = GREATEST(qty - COALESCE(required_qty, 0), 0)
WHERE buffer_qty = 0;