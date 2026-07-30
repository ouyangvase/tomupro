-- Allow each user to connect up to two verified Telegram destinations.
-- Existing notification preferences remain in user_telegram_settings.

CREATE TABLE IF NOT EXISTS public.user_telegram_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id text NOT NULL,
  label text NOT NULL DEFAULT 'Telegram',
  active boolean NOT NULL DEFAULT true,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_telegram_destinations_user_chat_key UNIQUE (user_id, chat_id),
  CONSTRAINT user_telegram_destinations_chat_id_format
    CHECK (btrim(chat_id) ~ '^-?[0-9]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS user_telegram_destinations_one_primary_idx
  ON public.user_telegram_destinations (user_id)
  WHERE active AND is_primary;

CREATE INDEX IF NOT EXISTS user_telegram_destinations_active_user_idx
  ON public.user_telegram_destinations (user_id, created_at)
  WHERE active;

ALTER TABLE public.user_telegram_destinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own telegram destinations"
  ON public.user_telegram_destinations;
CREATE POLICY "Users can read own telegram destinations"
  ON public.user_telegram_destinations
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.get_user_role(auth.uid()) = 'admin'
  );

CREATE OR REPLACE FUNCTION public.enforce_telegram_destination_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_count integer;
BEGIN
  NEW.chat_id := btrim(NEW.chat_id);
  NEW.label := COALESCE(NULLIF(btrim(NEW.label), ''), 'Telegram');
  NEW.updated_at := now();

  IF NEW.active THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));

    SELECT count(*)
    INTO v_active_count
    FROM public.user_telegram_destinations d
    WHERE d.user_id = NEW.user_id
      AND d.active
      AND d.id <> NEW.id;

    IF v_active_count >= 2 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'Maximum 2 Telegram chats connected';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_telegram_destination_limit
  ON public.user_telegram_destinations;
CREATE TRIGGER trg_enforce_telegram_destination_limit
  BEFORE INSERT OR UPDATE
  ON public.user_telegram_destinations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_telegram_destination_limit();

CREATE OR REPLACE FUNCTION public.sync_primary_telegram_chat_id(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id text;
BEGIN
  SELECT d.chat_id
  INTO v_chat_id
  FROM public.user_telegram_destinations d
  WHERE d.user_id = p_user_id
    AND d.active
    AND d.verified_at IS NOT NULL
  ORDER BY d.is_primary DESC, d.created_at ASC, d.id ASC
  LIMIT 1;

  UPDATE public.user_telegram_settings
  SET chat_id = v_chat_id,
      updated_at = now()
  WHERE user_id = p_user_id
    AND chat_id IS DISTINCT FROM v_chat_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_verified_telegram_destination(
  p_user_id uuid,
  p_chat_id text,
  p_label text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_destination_id uuid;
  v_has_primary boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;

  p_chat_id := btrim(COALESCE(p_chat_id, ''));
  IF p_chat_id !~ '^-?[0-9]+$' THEN
    RAISE EXCEPTION 'Enter a valid personal or group Chat ID using numbers only';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT EXISTS (
    SELECT 1
    FROM public.user_telegram_destinations
    WHERE user_id = p_user_id
      AND active
      AND is_primary
  )
  INTO v_has_primary;

  INSERT INTO public.user_telegram_destinations (
    user_id,
    chat_id,
    label,
    active,
    is_primary,
    verified_at
  )
  VALUES (
    p_user_id,
    p_chat_id,
    COALESCE(NULLIF(btrim(p_label), ''), CASE WHEN v_has_primary THEN 'Secondary Telegram' ELSE 'Primary Telegram' END),
    true,
    NOT v_has_primary,
    now()
  )
  ON CONFLICT (user_id, chat_id)
  DO UPDATE SET
    label = COALESCE(NULLIF(btrim(EXCLUDED.label), ''), public.user_telegram_destinations.label),
    active = true,
    verified_at = now(),
    updated_at = now()
  RETURNING id INTO v_destination_id;

  PERFORM public.sync_primary_telegram_chat_id(p_user_id);
  RETURN v_destination_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_my_telegram_destination(p_destination_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_deleted boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM public.user_telegram_destinations
  WHERE id = p_destination_id
    AND user_id = v_user_id;

  v_deleted := FOUND;
  IF NOT v_deleted THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_telegram_destinations
    WHERE user_id = v_user_id
      AND active
      AND is_primary
  ) THEN
    UPDATE public.user_telegram_destinations
    SET is_primary = true,
        updated_at = now()
    WHERE id = (
      SELECT id
      FROM public.user_telegram_destinations
      WHERE user_id = v_user_id
        AND active
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    );
  END IF;

  PERFORM public.sync_primary_telegram_chat_id(v_user_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_my_primary_telegram_destination(p_destination_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_telegram_destinations
    WHERE id = p_destination_id
      AND user_id = v_user_id
      AND active
      AND verified_at IS NOT NULL
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.user_telegram_destinations
  SET is_primary = false,
      updated_at = now()
  WHERE user_id = v_user_id
    AND is_primary;

  UPDATE public.user_telegram_destinations
  SET is_primary = true,
      updated_at = now()
  WHERE id = p_destination_id
    AND user_id = v_user_id;

  PERFORM public.sync_primary_telegram_chat_id(v_user_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_verified_telegram_destination(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_verified_telegram_destination(uuid, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.sync_primary_telegram_chat_id(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_primary_telegram_chat_id(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.remove_my_telegram_destination(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_my_telegram_destination(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.set_my_primary_telegram_destination(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_primary_telegram_destination(uuid)
  TO authenticated;

INSERT INTO public.user_telegram_destinations (
  user_id,
  chat_id,
  label,
  active,
  is_primary,
  verified_at,
  created_at,
  updated_at
)
SELECT
  s.user_id,
  btrim(s.chat_id),
  'Primary Telegram',
  true,
  true,
  COALESCE(s.linked_at, s.updated_at, s.created_at, now()),
  COALESCE(s.created_at, now()),
  COALESCE(s.updated_at, now())
FROM public.user_telegram_settings s
WHERE NULLIF(btrim(s.chat_id), '') IS NOT NULL
  AND btrim(s.chat_id) ~ '^-?[0-9]+$'
ON CONFLICT (user_id, chat_id)
DO UPDATE SET
  active = true,
  is_primary = true,
  verified_at = COALESCE(public.user_telegram_destinations.verified_at, EXCLUDED.verified_at),
  updated_at = GREATEST(public.user_telegram_destinations.updated_at, EXCLUDED.updated_at);

ALTER TABLE public.telegram_notification_logs
  ADD COLUMN IF NOT EXISTS telegram_destination_id uuid
    REFERENCES public.user_telegram_destinations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS telegram_message_id text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_key text;

CREATE UNIQUE INDEX IF NOT EXISTS telegram_notification_logs_delivery_key_idx
  ON public.telegram_notification_logs (delivery_key)
  WHERE delivery_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS telegram_notification_logs_destination_idx
  ON public.telegram_notification_logs (telegram_destination_id, sent_at DESC);

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
AS $$
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
       OR (v_log.status = 'pending' AND v_log.sent_at > now() - interval '5 minutes') THEN
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
$$;

REVOKE ALL ON FUNCTION public.claim_telegram_notification_delivery(
  text, uuid, uuid, text, text, text, uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_telegram_notification_delivery(
  text, uuid, uuid, text, text, text, uuid, text, text, uuid
) TO service_role;
