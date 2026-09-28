-- Telegram sends must use only the current verified destinations.
-- user_telegram_settings.chat_id is a legacy compatibility field and must
-- mirror the current primary destination, never act as a send fallback.

UPDATE public.user_telegram_settings s
SET chat_id = primary_destination.chat_id,
    updated_at = now()
FROM (
  SELECT DISTINCT ON (d.user_id)
    d.user_id,
    d.chat_id
  FROM public.user_telegram_destinations d
  WHERE d.active
    AND d.verified_at IS NOT NULL
  ORDER BY d.user_id, d.is_primary DESC, d.created_at ASC, d.id ASC
) AS primary_destination
WHERE s.user_id = primary_destination.user_id
  AND s.chat_id IS DISTINCT FROM primary_destination.chat_id;

UPDATE public.user_telegram_settings s
SET chat_id = NULL,
    updated_at = now()
WHERE s.chat_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_telegram_destinations d
    WHERE d.user_id = s.user_id
      AND d.active
      AND d.verified_at IS NOT NULL
  );

NOTIFY pgrst, 'reload schema';
