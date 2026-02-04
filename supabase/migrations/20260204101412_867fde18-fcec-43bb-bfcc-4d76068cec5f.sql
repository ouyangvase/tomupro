-- Add force_password_reset flag to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS force_password_reset boolean NOT NULL DEFAULT false;

-- Add force_password_reset_at to track when it was triggered
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS force_password_reset_at timestamptz;

-- Add force_password_reset_by to track who triggered it
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS force_password_reset_by uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.profiles.force_password_reset IS 'When true, user must change password on next login';
COMMENT ON COLUMN public.profiles.force_password_reset_at IS 'When the force password reset was triggered';
COMMENT ON COLUMN public.profiles.force_password_reset_by IS 'Admin who triggered the force password reset';