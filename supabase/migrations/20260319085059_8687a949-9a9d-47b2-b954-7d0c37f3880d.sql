CREATE TABLE public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  order_ref text,
  order_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_status integer,
  response_body text,
  sync_status text NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'sent', 'failed', 'skipped')),
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  error_message text,
  idempotency_key text NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(idempotency_key)
);

CREATE TABLE public.integration_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_name text NOT NULL UNIQUE,
  webhook_url text,
  webhook_enabled boolean NOT NULL DEFAULT false,
  shared_secret text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wh_logs_sync_status ON public.webhook_logs(sync_status);
CREATE INDEX idx_wh_logs_order_id ON public.webhook_logs(order_id);
CREATE INDEX idx_wh_logs_created_at ON public.webhook_logs(created_at DESC);
CREATE INDEX idx_wh_logs_idem_key ON public.webhook_logs(idempotency_key);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage webhook_logs"
  ON public.webhook_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage integration_settings"
  ON public.integration_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role wh_logs access"
  ON public.webhook_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role int_settings access"
  ON public.integration_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.integration_settings (integration_name, webhook_url, webhook_enabled, shared_secret)
VALUES ('pulseone', '', false, '')
ON CONFLICT (integration_name) DO NOTHING;