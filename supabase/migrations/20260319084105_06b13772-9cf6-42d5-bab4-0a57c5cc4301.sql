
-- Integration webhook logs for idempotency and audit
CREATE TABLE public.integration_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  order_ref TEXT,
  source_system TEXT DEFAULT 'TOMUPRO',
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- SKU cost reference table
CREATE TABLE public.sku_cost (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_code TEXT NOT NULL UNIQUE,
  sku_name TEXT,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BND',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profit orders from webhook deliveries
CREATE TABLE public.profit_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_ref TEXT NOT NULL UNIQUE,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  cogs NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_profit NUMERIC(12,2) NOT NULL DEFAULT 0,
  profit_status TEXT NOT NULL DEFAULT 'pending' CHECK (profit_status IN ('pending', 'confirmed', 'at_risk', 'cancelled')),
  source TEXT NOT NULL DEFAULT 'TOMUPRO',
  items JSONB NOT NULL DEFAULT '[]',
  missing_skus JSONB DEFAULT '[]',
  payment_type TEXT,
  webhook_log_id UUID REFERENCES public.integration_webhook_logs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.integration_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sku_cost ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_orders ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated users can read
CREATE POLICY "Authenticated users can read webhook logs"
  ON public.integration_webhook_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read sku_cost"
  ON public.sku_cost FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage sku_cost"
  ON public.sku_cost FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read profit_orders"
  ON public.profit_orders FOR SELECT TO authenticated USING (true);

-- Service role needs insert/update for edge function (bypasses RLS by default)

-- Index for fast idempotency lookups
CREATE INDEX idx_webhook_logs_idempotency ON public.integration_webhook_logs(idempotency_key);
CREATE INDEX idx_profit_orders_order_ref ON public.profit_orders(order_ref);
CREATE INDEX idx_sku_cost_sku_code ON public.sku_cost(sku_code);
