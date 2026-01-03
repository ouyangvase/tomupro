-- Add suggested_qty column to driver_pickup_items for audit trail
ALTER TABLE public.driver_pickup_items 
ADD COLUMN IF NOT EXISTS suggested_qty integer DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.driver_pickup_items.suggested_qty IS 'System-calculated suggested quantity based on today assigned orders';