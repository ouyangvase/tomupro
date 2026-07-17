CREATE TABLE IF NOT EXISTS public.kitani_order_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  kitani_delivery_intent_id text,
  invitation_url text,
  message text,
  template_key text NOT NULL DEFAULT 'delivery_invitation',
  template_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'AWAITING_CUSTOMER_LOCATION',
  source text NOT NULL DEFAULT 'TOMUPRO',
  expires_at timestamptz,
  confirmed_at timestamptz,
  delivered_event_sent_at timestamptz,
  last_error text,
  request_payload jsonb,
  response_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kitani_order_links_order_unique UNIQUE (order_id),
  CONSTRAINT kitani_order_links_status_check CHECK (
    status IN (
      'AWAITING_CUSTOMER_LOCATION',
      'LOCATION_CONFIRMED',
      'SUBMITTED_TO_TOMUPRO',
      'DELIVERED',
      'FAILED',
      'CANCELLED',
      'EXPIRED',
      'REVOKED'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_kitani_order_links_status
  ON public.kitani_order_links(status);

CREATE INDEX IF NOT EXISTS idx_kitani_order_links_delivery_intent
  ON public.kitani_order_links(kitani_delivery_intent_id)
  WHERE kitani_delivery_intent_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_kitani_order_links_updated_at ON public.kitani_order_links;
CREATE TRIGGER update_kitani_order_links_updated_at
  BEFORE UPDATE ON public.kitani_order_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.kitani_order_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Kitani links follow order access" ON public.kitani_order_links;
CREATE POLICY "Kitani links follow order access"
  ON public.kitani_order_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = kitani_order_links.order_id
        AND (
          auth.uid() = o.salesperson_id
          OR auth.uid() = o.runner_id
          OR public.get_user_role(auth.uid()) IN ('admin', 'manager')
        )
    )
  );
