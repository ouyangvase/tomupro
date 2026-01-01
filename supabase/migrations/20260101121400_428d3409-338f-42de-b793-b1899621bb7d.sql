-- Add foreign key constraint for runner_id in claim_batches
ALTER TABLE public.claim_batches 
ADD CONSTRAINT claim_batches_runner_id_fkey 
FOREIGN KEY (runner_id) REFERENCES public.profiles(id);

-- Add foreign key for admin_ack_by
ALTER TABLE public.claim_batches 
ADD CONSTRAINT claim_batches_admin_ack_by_fkey 
FOREIGN KEY (admin_ack_by) REFERENCES public.profiles(id);