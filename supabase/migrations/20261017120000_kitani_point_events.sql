-- KITANI reward points outbox: one row per order, queued the first time the order
-- becomes DELIVERED. Points are never taken back. send-kitani-points posts each
-- pending row to KITANI POST /api/v1/integrations/tomupro/events.

CREATE TABLE IF NOT EXISTS public.kitani_point_events (
  tomupro_order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  order_code text NOT NULL,
  phone text,
  total_amount_minor integer NOT NULL,
  delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'skipped')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_http_status integer,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kitani_point_events_pending
  ON public.kitani_point_events (next_retry_at)
  WHERE delivery_status = 'pending';

ALTER TABLE public.kitani_point_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.queue_kitani_point_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text := regexp_replace(NEW.phone, '\D', '', 'g');
  v_phone text;
BEGIN
  IF v_digits ~ '^(673)?\d{7}$' THEN
    v_phone := '+673' || right(v_digits, 7);
  END IF;

  INSERT INTO public.kitani_point_events (
    tomupro_order_id,
    order_code,
    phone,
    total_amount_minor,
    delivery_status
  )
  VALUES (
    NEW.id,
    NEW.order_code,
    v_phone,
    (NEW.total_amount * 100)::integer,
    CASE WHEN v_phone IS NULL THEN 'skipped' ELSE 'pending' END
  )
  ON CONFLICT (tomupro_order_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_kitani_point_event ON public.orders;
CREATE TRIGGER trg_queue_kitani_point_event
  AFTER UPDATE OF runner_status ON public.orders
  FOR EACH ROW
  WHEN (NEW.runner_status = 'DELIVERED' AND OLD.runner_status IS DISTINCT FROM 'DELIVERED')
  EXECUTE FUNCTION public.queue_kitani_point_event();

-- Claims up to 20 due rows and leases them for 5 minutes so overlapping
-- invocations never send the same row.
CREATE OR REPLACE FUNCTION public.claim_kitani_point_events()
RETURNS SETOF public.kitani_point_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.kitani_point_events
  SET next_retry_at = now() + interval '5 minutes'
  WHERE tomupro_order_id IN (
    SELECT tomupro_order_id
    FROM public.kitani_point_events
    WHERE delivery_status = 'pending'
      AND next_retry_at <= now()
    ORDER BY created_at
    LIMIT 20
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_kitani_point_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_kitani_point_events() TO service_role;

SELECT cron.schedule(
  'send-kitani-points',
  '* * * * *',
  $cron$
    SELECT net.http_post(
      url := (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'supabase_url'
      ) || '/functions/v1/send-kitani-points',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'service_role_key'
        )
      )
    )
    WHERE EXISTS (
      SELECT 1
      FROM public.kitani_point_events
      WHERE delivery_status = 'pending'
        AND next_retry_at <= now()
    );
  $cron$
);

COMMENT ON TABLE public.kitani_point_events IS
  'Outbox of delivered TOMUPRO orders that earn KITANI reward points, one row per order.';
