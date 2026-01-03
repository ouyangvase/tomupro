-- Add exchange rate and RM conversion columns to claim_batches
ALTER TABLE public.claim_batches
ADD COLUMN IF NOT EXISTS exchange_rate_to_rm numeric(10,4),
ADD COLUMN IF NOT EXISTS total_bnd numeric(12,2),
ADD COLUMN IF NOT EXISTS total_rm numeric(12,2);

-- Update existing data: set total_bnd from total_amount for backward compatibility
UPDATE public.claim_batches 
SET total_bnd = total_amount 
WHERE total_bnd IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.claim_batches.exchange_rate_to_rm IS 'Exchange rate from BND to RM (e.g., 3.1223)';
COMMENT ON COLUMN public.claim_batches.total_bnd IS 'Total claim amount in BND';
COMMENT ON COLUMN public.claim_batches.total_rm IS 'Total claim amount converted to RM (total_bnd * exchange_rate_to_rm)';