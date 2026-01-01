-- Add new columns to notifications table if they don't exist
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS recipient_role text,
ADD COLUMN IF NOT EXISTS body text,
ADD COLUMN IF NOT EXISTS priority text DEFAULT 'MEDIUM',
ADD COLUMN IF NOT EXISTS entity_type text;

-- Update the reference_type column to entity_type for consistency (keep reference_type for backwards compatibility)
UPDATE public.notifications SET entity_type = reference_type WHERE entity_type IS NULL AND reference_type IS NOT NULL;

-- Create user_notification_settings table
CREATE TABLE IF NOT EXISTS public.user_notification_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled boolean DEFAULT true,
  digest_time_local time DEFAULT '09:00',
  in_app_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_notification_settings
CREATE POLICY "Users can view own settings"
ON public.user_notification_settings
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
ON public.user_notification_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
ON public.user_notification_settings
FOR UPDATE
USING (auth.uid() = user_id);

-- Create daily_task_snapshots table
CREATE TABLE IF NOT EXISTS public.daily_task_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  role text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metrics jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(snapshot_date, owner_user_id)
);

-- Enable RLS
ALTER TABLE public.daily_task_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policies for daily_task_snapshots
CREATE POLICY "Users can view own snapshots"
ON public.daily_task_snapshots
FOR SELECT
USING (owner_user_id = auth.uid());

CREATE POLICY "Managers can view salesperson snapshots"
ON public.daily_task_snapshots
FOR SELECT
USING (
  get_user_role(auth.uid()) = 'manager'::app_role
  AND role = 'salesperson'
);

CREATE POLICY "Admins can view all snapshots"
ON public.daily_task_snapshots
FOR SELECT
USING (get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "System can insert snapshots"
ON public.daily_task_snapshots
FOR INSERT
WITH CHECK (true);

-- Update notifications RLS to support role-based broadcasts
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
ON public.notifications
FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    user_id IS NULL 
    AND recipient_role IS NOT NULL 
    AND recipient_role = (SELECT role::text FROM profiles WHERE id = auth.uid())
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON public.notifications(priority) WHERE priority = 'HIGH';
CREATE INDEX IF NOT EXISTS idx_daily_task_snapshots_date ON public.daily_task_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_daily_task_snapshots_user ON public.daily_task_snapshots(owner_user_id);