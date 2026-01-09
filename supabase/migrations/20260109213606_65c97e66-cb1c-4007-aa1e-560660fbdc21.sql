-- Add delivery charge breakdown columns to claim_batches
ALTER TABLE public.claim_batches 
ADD COLUMN IF NOT EXISTS gross_bnd NUMERIC,
ADD COLUMN IF NOT EXISTS delivery_charges_bnd NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_bnd NUMERIC,
ADD COLUMN IF NOT EXISTS gross_rm NUMERIC,
ADD COLUMN IF NOT EXISTS delivery_charges_rm NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_rm NUMERIC;

-- Update existing batches to set gross = total (assuming no charges were tracked before)
UPDATE public.claim_batches 
SET 
  gross_bnd = COALESCE(total_bnd, total_amount),
  net_bnd = COALESCE(total_bnd, total_amount),
  gross_rm = COALESCE(total_rm, total_amount * exchange_rate_to_rm),
  net_rm = COALESCE(total_rm, total_amount * exchange_rate_to_rm),
  delivery_charges_bnd = 0,
  delivery_charges_rm = 0
WHERE gross_bnd IS NULL;