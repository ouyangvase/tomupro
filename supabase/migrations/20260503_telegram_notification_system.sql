-- Telegram Notification System Migration
-- Run this in the Supabase SQL Editor

-- 1. telegram_bot_settings (single-row, admin-only)
CREATE TABLE IF NOT EXISTS telegram_bot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token TEXT,
  bot_enabled BOOLEAN NOT NULL DEFAULT false,
  daily_send_time TIME NOT NULL DEFAULT '09:00',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enforce single row
CREATE UNIQUE INDEX IF NOT EXISTS telegram_bot_settings_singleton ON telegram_bot_settings ((true));

-- Insert default row
INSERT INTO telegram_bot_settings (bot_enabled, daily_send_time)
VALUES (false, '09:00')
ON CONFLICT DO NOTHING;

-- RLS for telegram_bot_settings
ALTER TABLE telegram_bot_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read telegram bot settings"
  ON telegram_bot_settings FOR SELECT
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admin can update telegram bot settings"
  ON telegram_bot_settings FOR UPDATE
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- 2. user_telegram_settings (one row per user)
CREATE TABLE IF NOT EXISTS user_telegram_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT,
  telegram_enabled BOOLEAN NOT NULL DEFAULT false,
  receive_stock_balance BOOLEAN NOT NULL DEFAULT true,
  receive_delivered_not_claimed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for user_telegram_settings
ALTER TABLE user_telegram_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own telegram settings"
  ON user_telegram_settings FOR SELECT
  USING (auth.uid() = user_id OR public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Users can insert own telegram settings"
  ON user_telegram_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own telegram settings"
  ON user_telegram_settings FOR UPDATE
  USING (auth.uid() = user_id OR public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (auth.uid() = user_id OR public.get_user_role(auth.uid()) = 'admin');

-- 3. telegram_notification_permissions (admin-managed per-user)
CREATE TABLE IF NOT EXISTS telegram_notification_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  admin_enabled BOOLEAN NOT NULL DEFAULT false,
  can_receive_stock_balance BOOLEAN NOT NULL DEFAULT false,
  can_receive_delivered_not_claimed BOOLEAN NOT NULL DEFAULT false,
  allowed_stock_owner_ids UUID[] NOT NULL DEFAULT '{}',
  allowed_warehouse_ids UUID[] NOT NULL DEFAULT '{}',
  see_all_stock BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- RLS for telegram_notification_permissions
ALTER TABLE telegram_notification_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own telegram permissions"
  ON telegram_notification_permissions FOR SELECT
  USING (auth.uid() = user_id OR public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admin can insert telegram permissions"
  ON telegram_notification_permissions FOR INSERT
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admin can update telegram permissions"
  ON telegram_notification_permissions FOR UPDATE
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admin can delete telegram permissions"
  ON telegram_notification_permissions FOR DELETE
  USING (public.get_user_role(auth.uid()) = 'admin');

-- 4. telegram_notification_logs
CREATE TABLE IF NOT EXISTS telegram_notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT,
  notification_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  message_preview TEXT
);

-- RLS for telegram_notification_logs
ALTER TABLE telegram_notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own telegram logs"
  ON telegram_notification_logs FOR SELECT
  USING (auth.uid() = user_id OR public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Service can insert telegram logs"
  ON telegram_notification_logs FOR INSERT
  WITH CHECK (true);

-- Index for fast log queries
CREATE INDEX IF NOT EXISTS idx_telegram_logs_user_sent ON telegram_notification_logs (user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_logs_status ON telegram_notification_logs (status, sent_at DESC);
