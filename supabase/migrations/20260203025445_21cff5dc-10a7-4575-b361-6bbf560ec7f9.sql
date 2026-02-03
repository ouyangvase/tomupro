-- Cash Settlement Batches table (must be created first due to FK reference)
CREATE TABLE public.cash_settlement_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id uuid NOT NULL REFERENCES profiles(id),
  total_amount numeric NOT NULL,
  order_count integer NOT NULL,
  status text NOT NULL DEFAULT 'SETTLED' CHECK (status = 'SETTLED'),
  settled_at timestamptz NOT NULL DEFAULT now(),
  settled_by uuid NOT NULL REFERENCES profiles(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Cash Liabilities table
CREATE TABLE public.cash_liabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id uuid NOT NULL REFERENCES profiles(id),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  order_code text NOT NULL,
  customer_name text,
  cash_amount numeric NOT NULL CHECK (cash_amount > 0),
  delivered_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SETTLED')),
  settlement_batch_id uuid REFERENCES cash_settlement_batches(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  
  CONSTRAINT settled_requires_batch CHECK (
    (status = 'SETTLED' AND settlement_batch_id IS NOT NULL AND settled_at IS NOT NULL)
    OR (status = 'OPEN' AND settlement_batch_id IS NULL AND settled_at IS NULL)
  )
);

-- Indexes for performance
CREATE INDEX idx_cash_liabilities_runner_status ON cash_liabilities(runner_id, status);
CREATE INDEX idx_cash_liabilities_delivered_at ON cash_liabilities(delivered_at);
CREATE INDEX idx_cash_settlement_batches_runner ON cash_settlement_batches(runner_id);

-- Enable RLS
ALTER TABLE public.cash_liabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_settlement_batches ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cash_liabilities
CREATE POLICY "Runners and admins view liabilities"
ON cash_liabilities FOR SELECT
USING (runner_id = auth.uid() OR get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "Runners and admins create liabilities"
ON cash_liabilities FOR INSERT
WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'runner'));

CREATE POLICY "Runners settle own liabilities"
ON cash_liabilities FOR UPDATE
USING (runner_id = auth.uid() AND status = 'OPEN')
WITH CHECK (runner_id = auth.uid());

-- No DELETE policy = no deletions allowed

-- RLS Policies for cash_settlement_batches
CREATE POLICY "View own or admin settlement batches"
ON cash_settlement_batches FOR SELECT
USING (runner_id = auth.uid() OR get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "Runners create settlement batches"
ON cash_settlement_batches FOR INSERT
WITH CHECK (runner_id = auth.uid() AND settled_by = auth.uid());

-- No UPDATE or DELETE policies = immutable after creation