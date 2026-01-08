-- Fix: Allow product deletion by cascading to stock_movements
ALTER TABLE public.stock_movements
DROP CONSTRAINT IF EXISTS stock_movements_product_id_fkey;

ALTER TABLE public.stock_movements
ADD CONSTRAINT stock_movements_product_id_fkey
FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

-- Also update other tables that reference products
ALTER TABLE public.order_items
DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;

ALTER TABLE public.order_items
ADD CONSTRAINT order_items_product_id_fkey
FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.inbound_items
DROP CONSTRAINT IF EXISTS inbound_items_product_id_fkey;

ALTER TABLE public.inbound_items
ADD CONSTRAINT inbound_items_product_id_fkey
FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.driver_pickup_items
DROP CONSTRAINT IF EXISTS driver_pickup_items_product_id_fkey;

ALTER TABLE public.driver_pickup_items
ADD CONSTRAINT driver_pickup_items_product_id_fkey
FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE public.driver_return_items
DROP CONSTRAINT IF EXISTS driver_return_items_product_id_fkey;

ALTER TABLE public.driver_return_items
ADD CONSTRAINT driver_return_items_product_id_fkey
FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE public.stock_transfer_items
DROP CONSTRAINT IF EXISTS stock_transfer_items_product_id_fkey;

ALTER TABLE public.stock_transfer_items
ADD CONSTRAINT stock_transfer_items_product_id_fkey
FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;