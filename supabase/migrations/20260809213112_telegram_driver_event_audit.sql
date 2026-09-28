BEGIN;

ALTER TABLE public.telegram_event_queue
  ADD COLUMN IF NOT EXISTS notification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS notification_reason text,
  ADD COLUMN IF NOT EXISTS notification_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eligible_recipient_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscribed_recipient_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS destination_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS send_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS success_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

ALTER TABLE public.telegram_event_queue
  DROP CONSTRAINT IF EXISTS telegram_event_queue_notification_status_check;

ALTER TABLE public.telegram_event_queue
  ADD CONSTRAINT telegram_event_queue_notification_status_check
  CHECK (notification_status IN ('pending', 'retrying', 'success', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_telegram_event_queue_notification_status
  ON public.telegram_event_queue (notification_status, processed, created_at);

CREATE TABLE IF NOT EXISTS public.telegram_driver_event_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE REFERENCES public.telegram_event_queue(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_ref text,
  event_type text NOT NULL CHECK (event_type IN ('driver_delivered', 'driver_failed')),
  runner_id uuid,
  event_created_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'retrying', 'success', 'failed', 'skipped')),
  reason text,
  eligible_recipient_count integer NOT NULL DEFAULT 0,
  subscribed_recipient_count integer NOT NULL DEFAULT 0,
  destination_count integer NOT NULL DEFAULT 0,
  send_attempt_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  finalized_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_driver_event_audit_created_at
  ON public.telegram_driver_event_audit (event_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_driver_event_audit_status
  ON public.telegram_driver_event_audit (status, event_created_at DESC);

ALTER TABLE public.telegram_driver_event_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read Telegram driver event audit" ON public.telegram_driver_event_audit;
CREATE POLICY "Admins can read Telegram driver event audit"
  ON public.telegram_driver_event_audit
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.ensure_telegram_driver_event_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.event_type IN ('driver_delivered', 'driver_failed') THEN
    INSERT INTO public.telegram_driver_event_audit (
      event_id,
      order_id,
      order_ref,
      event_type,
      runner_id,
      event_created_at,
      metadata
    )
    VALUES (
      NEW.id,
      NEW.order_id,
      COALESCE(NEW.metadata->>'order_code', NEW.metadata->>'order_ref'),
      NEW.event_type,
      NEW.runner_id,
      NEW.created_at,
      COALESCE(NEW.metadata, '{}'::jsonb)
    )
    ON CONFLICT (event_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ensure_telegram_driver_event_audit ON public.telegram_event_queue;
CREATE TRIGGER trg_ensure_telegram_driver_event_audit
AFTER INSERT ON public.telegram_event_queue
FOR EACH ROW
EXECUTE FUNCTION public.ensure_telegram_driver_event_audit();

DROP INDEX IF EXISTS public.idx_telegram_event_queue_pending_driver_unique;
UPDATE public.telegram_event_queue
SET dedupe_key = NULL
WHERE dedupe_key LIKE 'driver_delivered:%'
   OR dedupe_key LIKE 'driver_failed:%';
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_event_queue_dedupe_key
  ON public.telegram_event_queue (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.queue_telegram_order_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_event_type text;
  v_metadata jsonb;
  v_dedupe_key text;
BEGIN
  IF OLD.receipt_status IS DISTINCT FROM NEW.receipt_status THEN
    v_event_type := NULL;

    IF NEW.receipt_status = 'pending' AND OLD.receipt_status IS NULL THEN
      v_event_type := 'receipt_uploaded';
    ELSIF NEW.receipt_status = 'pending' AND OLD.receipt_status = 'rejected' THEN
      v_event_type := 'receipt_reuploaded';
    ELSIF NEW.receipt_status = 'rejected' THEN
      v_event_type := 'receipt_rejected';
    ELSIF NEW.receipt_status = 'confirmed' THEN
      v_event_type := 'receipt_confirmed';
    END IF;

    IF v_event_type IS NOT NULL THEN
      v_metadata := jsonb_build_object(
        'order_code', NEW.order_code,
        'customer_name', NEW.customer_name,
        'total_amount', NEW.total_amount,
        'payment_method', NEW.payment_method,
        'receipt_status', NEW.receipt_status
      );

      INSERT INTO public.telegram_event_queue (event_type, order_id, runner_id, metadata)
      VALUES (v_event_type, NEW.id, NEW.runner_id, v_metadata);
    END IF;
  END IF;

  IF OLD.runner_status IS DISTINCT FROM NEW.runner_status THEN
    v_event_type := NULL;

    IF NEW.runner_status = 'ASSIGNED' THEN
      v_event_type := 'order_assigned';
    ELSIF NEW.runner_status = 'TAKEN' THEN
      v_event_type := 'order_taken';
    ELSIF NEW.runner_status = 'DELIVERED' THEN
      v_event_type := 'order_delivered';
    ELSIF NEW.runner_status = 'FAILED_DELIVERY' THEN
      v_event_type := 'delivery_failed';
    END IF;

    IF v_event_type IS NOT NULL THEN
      v_metadata := jsonb_build_object(
        'order_code', NEW.order_code,
        'customer_name', NEW.customer_name,
        'total_amount', NEW.total_amount,
        'payment_method', NEW.payment_method,
        'runner_status', NEW.runner_status,
        'prev_runner_status', OLD.runner_status
      );

      INSERT INTO public.telegram_event_queue (event_type, order_id, runner_id, metadata)
      VALUES (v_event_type, NEW.id, NEW.runner_id, v_metadata);
    END IF;
  END IF;

  IF OLD.driver_status IS DISTINCT FROM NEW.driver_status THEN
    v_event_type := NULL;

    IF NEW.driver_status = 'DRIVER_DELIVERED' THEN
      v_event_type := 'driver_delivered';
    ELSIF NEW.driver_status = 'DRIVER_FAILED' THEN
      v_event_type := 'driver_failed';
    END IF;

    IF v_event_type IS NOT NULL THEN
      v_dedupe_key := md5(
        v_event_type || ':' || NEW.id::text || ':'
        || COALESCE(NEW.updated_at::text, clock_timestamp()::text) || ':'
        || COALESCE(NEW.driver_failed_reason, '') || ':'
        || COALESCE(NEW.driver_next_delivery_date::text, '')
      );
      v_metadata := jsonb_build_object(
        'order_code', NEW.order_code,
        'customer_name', NEW.customer_name,
        'total_amount', NEW.total_amount,
        'payment_method', NEW.payment_method,
        'driver_payment_method', NEW.driver_payment_method,
        'driver_status', NEW.driver_status,
        'prev_driver_status', OLD.driver_status,
        'driver_id', NEW.driver_id,
        'salesperson_id', NEW.salesperson_id,
        'order_owner_id', NEW.order_owner_id,
        'owner_salesperson_id_snapshot', NEW.owner_salesperson_id_snapshot,
        'owner_manager_id_snapshot', NEW.owner_manager_id_snapshot,
        'driver_delivered_at', NEW.driver_delivered_at,
        'driver_failed_reason', NEW.driver_failed_reason,
        'driver_failed_remark', NEW.driver_failed_remark,
        'updated_at', NEW.updated_at
      );

      INSERT INTO public.telegram_event_queue (event_type, order_id, runner_id, metadata, dedupe_key)
      VALUES (v_event_type, NEW.id, NEW.runner_id, v_metadata, v_dedupe_key)
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_telegram_notification_delivery(
  p_delivery_key text,
  p_user_id uuid,
  p_destination_id uuid,
  p_chat_id text,
  p_notification_type text,
  p_message_preview text DEFAULT NULL,
  p_order_id uuid DEFAULT NULL,
  p_order_ref text DEFAULT NULL,
  p_recipient_role text DEFAULT NULL,
  p_event_id uuid DEFAULT NULL
)
RETURNS TABLE(log_id uuid, should_send boolean, attempts integer, delivery_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_log public.telegram_notification_logs%ROWTYPE;
BEGIN
  SELECT *
  INTO v_log
  FROM public.telegram_notification_logs
  WHERE delivery_key = p_delivery_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_log.status = 'success'
       OR (v_log.status IN ('pending', 'retrying') AND v_log.sent_at > now()) THEN
      RETURN QUERY SELECT v_log.id, false, v_log.attempt_count, v_log.status;
      RETURN;
    END IF;

    UPDATE public.telegram_notification_logs
    SET status = 'pending',
        error_message = NULL,
        telegram_destination_id = p_destination_id,
        attempt_count = v_log.attempt_count + 1,
        sent_at = now()
    WHERE id = v_log.id
    RETURNING * INTO v_log;

    RETURN QUERY SELECT v_log.id, true, v_log.attempt_count, v_log.status;
    RETURN;
  END IF;

  INSERT INTO public.telegram_notification_logs (
    user_id,
    chat_id,
    notification_type,
    sent_at,
    status,
    message_preview,
    order_id,
    order_ref,
    recipient_role,
    event_id,
    telegram_destination_id,
    attempt_count,
    delivery_key
  )
  VALUES (
    p_user_id,
    p_chat_id,
    p_notification_type,
    now(),
    'pending',
    p_message_preview,
    p_order_id,
    p_order_ref,
    p_recipient_role,
    p_event_id,
    p_destination_id,
    1,
    p_delivery_key
  )
  RETURNING * INTO v_log;

  RETURN QUERY SELECT v_log.id, true, v_log.attempt_count, v_log.status;
END;
$function$;

DROP INDEX IF EXISTS public.idx_telegram_logs_event_user;

INSERT INTO public.telegram_driver_event_audit (
  event_id,
  order_id,
  order_ref,
  event_type,
  runner_id,
  event_created_at,
  status,
  reason,
  eligible_recipient_count,
  subscribed_recipient_count,
  destination_count,
  send_attempt_count,
  success_count,
  failed_count,
  attempt_count,
  last_error,
  last_attempt_at,
  next_retry_at,
  finalized_at,
  metadata
)
SELECT
  q.id,
  q.order_id,
  COALESCE(q.metadata->>'order_code', q.metadata->>'order_ref'),
  q.event_type,
  q.runner_id,
  q.created_at,
  CASE
    WHEN q.processed AND EXISTS (
      SELECT 1 FROM public.telegram_notification_logs l
      WHERE l.event_id = q.id AND l.status = 'success'
    ) THEN 'success'
    WHEN q.processed AND EXISTS (
      SELECT 1 FROM public.telegram_notification_logs l
      WHERE l.event_id = q.id AND l.status = 'failed'
    ) THEN 'failed'
    WHEN q.processed THEN 'skipped'
    WHEN EXISTS (
      SELECT 1 FROM public.telegram_notification_logs l
      WHERE l.event_id = q.id AND l.status IN ('pending', 'retrying')
    ) THEN 'retrying'
    ELSE 'pending'
  END,
  CASE
    WHEN q.processed AND EXISTS (
      SELECT 1 FROM public.telegram_notification_logs l
      WHERE l.event_id = q.id AND l.status = 'success'
    ) THEN 'backfilled_from_success_log'
    WHEN q.processed AND EXISTS (
      SELECT 1 FROM public.telegram_notification_logs l
      WHERE l.event_id = q.id AND l.status = 'failed'
    ) THEN 'backfilled_from_failed_log'
    WHEN q.processed THEN 'processed_without_recipient_log_before_audit_was_enabled'
    WHEN EXISTS (
      SELECT 1 FROM public.telegram_notification_logs l
      WHERE l.event_id = q.id AND l.status IN ('pending', 'retrying')
    ) THEN 'backfilled_from_pending_delivery_log'
    ELSE 'legacy_unprocessed_queue_event'
  END,
  0,
  0,
  0,
  COALESCE((SELECT count(*)::int FROM public.telegram_notification_logs l WHERE l.event_id = q.id AND l.status IN ('pending', 'retrying', 'success', 'failed')), 0),
  COALESCE((SELECT count(*)::int FROM public.telegram_notification_logs l WHERE l.event_id = q.id AND l.status = 'success'), 0),
  COALESCE((SELECT count(*)::int FROM public.telegram_notification_logs l WHERE l.event_id = q.id AND l.status = 'failed'), 0),
  COALESCE((SELECT max(l.attempt_count) FROM public.telegram_notification_logs l WHERE l.event_id = q.id), 0),
  (SELECT max(l.error_message) FROM public.telegram_notification_logs l WHERE l.event_id = q.id AND l.status IN ('failed', 'retrying')),
  (SELECT max(l.sent_at) FROM public.telegram_notification_logs l WHERE l.event_id = q.id),
  NULL,
  CASE WHEN q.processed THEN COALESCE((SELECT max(l.sent_at) FROM public.telegram_notification_logs l WHERE l.event_id = q.id), q.created_at) ELSE NULL END,
  COALESCE(q.metadata, '{}'::jsonb)
FROM public.telegram_event_queue q
WHERE q.event_type IN ('driver_delivered', 'driver_failed')
ON CONFLICT (event_id) DO NOTHING;

UPDATE public.telegram_event_queue q
SET notification_status = a.status,
    notification_reason = a.reason,
    notification_attempt_count = a.attempt_count,
    eligible_recipient_count = a.eligible_recipient_count,
    subscribed_recipient_count = a.subscribed_recipient_count,
    destination_count = a.destination_count,
    send_attempt_count = a.send_attempt_count,
    success_count = a.success_count,
    failed_count = a.failed_count,
    last_attempt_at = a.last_attempt_at,
    next_retry_at = a.next_retry_at,
    processed_at = a.finalized_at
FROM public.telegram_driver_event_audit a
WHERE a.event_id = q.id;

UPDATE public.telegram_driver_event_audit a
SET status = CASE WHEN a.success_count > 0 THEN 'success' ELSE 'failed' END,
    reason = CASE WHEN a.success_count > 0
      THEN 'reconciled_from_existing_success_log'
      ELSE 'reconciled_from_existing_failed_log'
    END,
    finalized_at = now(),
    updated_at = now()
WHERE a.status = 'pending'
  AND (a.success_count > 0 OR a.failed_count > 0)
  AND NOT EXISTS (
    SELECT 1
    FROM public.telegram_notification_logs l
    WHERE l.event_id = a.event_id
      AND l.status IN ('pending', 'retrying')
  );

UPDATE public.telegram_event_queue q
SET notification_status = a.status,
    notification_reason = a.reason,
    processed = true,
    processed_at = a.finalized_at
FROM public.telegram_driver_event_audit a
WHERE a.event_id = q.id
  AND a.status IN ('success', 'failed')
  AND q.processed = false;

CREATE OR REPLACE FUNCTION public.get_telegram_driver_event_audit(
  p_from timestamptz DEFAULT now() - interval '7 days',
  p_to timestamptz DEFAULT now(),
  p_limit integer DEFAULT 5000
)
RETURNS TABLE (
  source text,
  source_audit_id uuid,
  event_id uuid,
  order_id uuid,
  order_code text,
  event_type text,
  event_created_at timestamptz,
  status text,
  reason text,
  eligible_recipient_count integer,
  subscribed_recipient_count integer,
  destination_count integer,
  send_attempt_count integer,
  success_count integer,
  failed_count integer,
  attempt_count integer,
  last_error text,
  next_retry_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role')
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only administrators can read Telegram driver event audit';
  END IF;

  RETURN QUERY
  WITH queued AS (
    SELECT
      'queue'::text AS source,
      a.id AS source_audit_id,
      a.event_id,
      a.order_id,
      COALESCE(a.order_ref, o.order_code) AS order_code,
      a.event_type,
      a.event_created_at,
      a.status,
      a.reason,
      a.eligible_recipient_count,
      a.subscribed_recipient_count,
      a.destination_count,
      a.send_attempt_count,
      a.success_count,
      a.failed_count,
      a.attempt_count,
      a.last_error,
      a.next_retry_at
    FROM public.telegram_driver_event_audit a
    LEFT JOIN public.orders o ON o.id = a.order_id
    WHERE a.event_created_at >= p_from
      AND a.event_created_at < p_to
  ),
  missing AS (
    SELECT
      'missing_queue'::text AS source,
      al.id AS source_audit_id,
      NULL::uuid AS event_id,
      al.entity_id AS order_id,
      COALESCE(al.order_ref, o.order_code) AS order_code,
      CASE WHEN al.after_json->>'driver_status' = 'DRIVER_DELIVERED' THEN 'driver_delivered' ELSE 'driver_failed' END AS event_type,
      al.created_at AS event_created_at,
      'skipped'::text AS status,
      'historical_driver_status_event_missing_queue_not_replayed'::text AS reason,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      NULL::text,
      NULL::timestamptz
    FROM public.audit_logs al
    LEFT JOIN public.orders o ON o.id = al.entity_id
    WHERE al.entity_type = 'order'
      AND al.entity_id IS NOT NULL
      AND al.before_json->>'driver_status' IS DISTINCT FROM al.after_json->>'driver_status'
      AND al.after_json->>'driver_status' IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
      AND al.created_at >= p_from
      AND al.created_at < p_to
      AND NOT EXISTS (
        SELECT 1
        FROM public.telegram_event_queue q
        WHERE q.order_id = al.entity_id
          AND q.event_type = CASE WHEN al.after_json->>'driver_status' = 'DRIVER_DELIVERED' THEN 'driver_delivered' ELSE 'driver_failed' END
          AND q.created_at >= al.created_at - interval '2 seconds'
          AND q.created_at <= al.created_at + interval '30 seconds'
      )
  )
  SELECT * FROM queued
  UNION ALL
  SELECT * FROM missing
  ORDER BY event_created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5000), 20000));
END;
$function$;

REVOKE ALL ON FUNCTION public.get_telegram_driver_event_audit(timestamptz, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_telegram_driver_event_audit(timestamptz, timestamptz, integer) TO authenticated, service_role;

COMMIT;
