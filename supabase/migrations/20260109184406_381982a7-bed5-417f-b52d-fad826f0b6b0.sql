
-- Add composite unique constraint on order_items to prevent duplicate SKUs within the same order
-- This enforces at the database level that no two items in the same order can have the same product_id

-- Create unique index for order_id + product_id where product_id is NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS order_items_order_product_unique 
ON public.order_items (order_id, product_id) 
WHERE product_id IS NOT NULL;

-- Add check constraint to ensure product_id is not null (SKU is mandatory for new orders)
ALTER TABLE public.order_items
ADD CONSTRAINT order_items_product_required 
CHECK (product_id IS NOT NULL);
