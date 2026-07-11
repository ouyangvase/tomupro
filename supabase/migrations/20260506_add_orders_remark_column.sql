-- Add remark column to orders table for storing imported remark/notes from CSV
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS remark text NULL;

COMMENT ON COLUMN public.orders.remark IS 'General remark imported from order CSV or entered manually';
