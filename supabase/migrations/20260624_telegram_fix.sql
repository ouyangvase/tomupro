-- Add missing columns to telegram_notification_permissions
-- These are referenced by the Edge Function and Admin UI but were not in the original migration
ALTER TABLE public.telegram_notification_permissions
  ADD COLUMN IF NOT EXISTS can_view_all_data boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allowed_runner_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allowed_team_user_ids uuid[] NOT NULL DEFAULT '{}';

-- Add missing column to user_telegram_settings
-- Referenced by TelegramUserSettings UI and send-telegram-daily edge function
ALTER TABLE public.user_telegram_settings
  ADD COLUMN IF NOT EXISTS hide_zero_stock_sku boolean NOT NULL DEFAULT false;
