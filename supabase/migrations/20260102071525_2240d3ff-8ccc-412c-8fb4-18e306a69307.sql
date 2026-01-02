-- Add failed_remark column to orders table for storing runner's remark on failed delivery
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS failed_remark text NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.orders.failed_remark IS 'Runner remark/notes when marking order as failed delivery';