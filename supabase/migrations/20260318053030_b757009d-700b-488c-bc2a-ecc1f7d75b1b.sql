
-- Add order_source to distinguish runner-created pickup orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_source text NOT NULL DEFAULT 'SALESPERSON';

-- Add pickup_fee for runner pickup orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pickup_fee numeric DEFAULT 0;

-- Index for fast filtering of pickup orders
CREATE INDEX IF NOT EXISTS idx_orders_order_source ON public.orders(order_source);
CREATE INDEX IF NOT EXISTS idx_orders_operational_status ON public.orders(operational_status);
