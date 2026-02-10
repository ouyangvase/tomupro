
-- Add batch_code column
ALTER TABLE public.claim_batches ADD COLUMN batch_code TEXT UNIQUE;

-- Backfill existing batches with sequential codes based on submitted_at
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY submitted_at ASC) AS rn
  FROM public.claim_batches
)
UPDATE public.claim_batches cb
SET batch_code = 'CB-' || LPAD(n.rn::TEXT, 4, '0')
FROM numbered n
WHERE cb.id = n.id;

-- Make NOT NULL after backfill
ALTER TABLE public.claim_batches ALTER COLUMN batch_code SET NOT NULL;

-- Create function to auto-generate batch_code on insert
CREATE OR REPLACE FUNCTION public.generate_batch_code()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(batch_code FROM 4) AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.claim_batches;
  
  NEW.batch_code := 'CB-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_batch_code
BEFORE INSERT ON public.claim_batches
FOR EACH ROW
WHEN (NEW.batch_code IS NULL)
EXECUTE FUNCTION public.generate_batch_code();
