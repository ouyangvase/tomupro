
-- Add unique constraint to prevent duplicate stock movements per order_item
-- This ensures idempotent deduction at the database level
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_order_item_unique 
ON public.stock_movements (reference_id, movement_type) 
WHERE reference_type = 'ORDER_ITEM';

-- Add inventory_deducted_at timestamp for better auditing (optional enhancement)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS inventory_deducted_at TIMESTAMP WITH TIME ZONE;

-- Update existing orders that have stock_deducted = true to set the timestamp
UPDATE public.orders 
SET inventory_deducted_at = delivered_at 
WHERE stock_deducted = true AND inventory_deducted_at IS NULL;
