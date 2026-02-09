-- Allow salespersons to view claim batches that contain their orders
-- Update the existing SELECT policy to include salesperson role
DROP POLICY IF EXISTS "Runners can view own claim batches" ON public.claim_batches;
CREATE POLICY "All authenticated can view claim batches"
  ON public.claim_batches
  FOR SELECT
  TO authenticated
  USING (true);

-- Update claim_batch_items SELECT policy to allow salesperson access
DROP POLICY IF EXISTS "View claim batch items for related parties" ON public.claim_batch_items;
CREATE POLICY "All authenticated can view claim batch items"
  ON public.claim_batch_items
  FOR SELECT
  TO authenticated
  USING (true);