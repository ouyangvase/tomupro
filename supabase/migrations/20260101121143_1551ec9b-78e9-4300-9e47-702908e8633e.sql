-- Create claim_batch_status enum
CREATE TYPE public.claim_batch_status AS ENUM ('ADMIN_ACK_PENDING', 'CLAIMED');

-- Create claim_batches table
CREATE TABLE public.claim_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  runner_id UUID NOT NULL,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  status public.claim_batch_status NOT NULL DEFAULT 'ADMIN_ACK_PENDING',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  admin_ack_at TIMESTAMPTZ,
  admin_ack_by UUID,
  note TEXT
);

-- Create claim_batch_items table
CREATE TABLE public.claim_batch_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES public.claim_batches(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, order_id)
);

-- Enable RLS
ALTER TABLE public.claim_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_batch_items ENABLE ROW LEVEL SECURITY;

-- RLS for claim_batches
-- Runners can view their own batches
CREATE POLICY "Runners can view own claim batches" ON public.claim_batches
  FOR SELECT USING (
    auth.uid() = runner_id 
    OR get_user_role(auth.uid()) IN ('admin', 'manager')
  );

-- Runners can create batches (via edge function with service role)
CREATE POLICY "System can insert claim batches" ON public.claim_batches
  FOR INSERT WITH CHECK (true);

-- Admin can update claim batches (for acknowledgment)
CREATE POLICY "Admin can update claim batches" ON public.claim_batches
  FOR UPDATE USING (get_user_role(auth.uid()) = 'admin');

-- RLS for claim_batch_items
CREATE POLICY "View claim batch items for related parties" ON public.claim_batch_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.claim_batches cb
      WHERE cb.id = claim_batch_items.batch_id
      AND (cb.runner_id = auth.uid() OR get_user_role(auth.uid()) IN ('admin', 'manager'))
    )
  );

CREATE POLICY "System can insert claim batch items" ON public.claim_batch_items
  FOR INSERT WITH CHECK (true);

-- Update RLS on stock_balance_view to allow runners to view all
-- stock_balance_view is a view and needs to be accessible
-- Views inherit permissions from underlying tables, so we need to ensure runners can access
-- Create a policy on stock_movements for runners to view all (read-only)
DROP POLICY IF EXISTS "Users can view own warehouse movements" ON public.stock_movements;

CREATE POLICY "Authenticated users can view stock movements" ON public.stock_movements
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Add indexes for performance
CREATE INDEX idx_claim_batches_runner_id ON public.claim_batches(runner_id);
CREATE INDEX idx_claim_batches_status ON public.claim_batches(status);
CREATE INDEX idx_claim_batch_items_batch_id ON public.claim_batch_items(batch_id);
CREATE INDEX idx_claim_batch_items_order_id ON public.claim_batch_items(order_id);