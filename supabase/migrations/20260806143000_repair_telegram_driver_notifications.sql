-- Keep verified Telegram destinations eligible for event notifications.
-- A successful verification is the user's explicit opt-in; older connected
-- destinations are repaired once so driver events are not silently skipped.

INSERT INTO public.user_telegram_settings (user_id, telegram_enabled)
SELECT DISTINCT d.user_id, true
FROM public.user_telegram_destinations d
WHERE d.active
  AND d.verified_at IS NOT NULL
ON CONFLICT (user_id)
DO UPDATE SET
  telegram_enabled = true,
  updated_at = now();

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

  INSERT INTO public.user_telegram_settings (user_id, telegram_enabled)
  VALUES (p_user_id, true)
  ON CONFLICT (user_id)
  DO UPDATE SET
    telegram_enabled = true,
    updated_at = now();

  PERFORM public.sync_primary_telegram_chat_id(p_user_id);
  RETURN v_destination_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
