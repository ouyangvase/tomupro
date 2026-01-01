-- Create user_directory table for dropdown sources
CREATE TABLE IF NOT EXISTS public.user_directory (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_directory ENABLE ROW LEVEL SECURITY;

-- RLS: All authenticated users can read
CREATE POLICY "User directory readable by all authenticated"
  ON public.user_directory
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- RLS: Only system/admin can insert/update (via trigger)
CREATE POLICY "Admin can manage user directory"
  ON public.user_directory
  FOR ALL
  USING (get_user_role(auth.uid()) = 'admin');

-- Create index for role filtering
CREATE INDEX idx_user_directory_role ON public.user_directory(role);

-- Populate user_directory from existing profiles
INSERT INTO public.user_directory (id, display_name, role, created_at)
SELECT id, display_name, role, created_at FROM public.profiles
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  role = EXCLUDED.role;

-- Create trigger to sync user_directory when profiles change
CREATE OR REPLACE FUNCTION public.sync_user_directory()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_directory (id, display_name, role, created_at)
    VALUES (NEW.id, NEW.display_name, NEW.role, NEW.created_at)
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      role = EXCLUDED.role;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.user_directory
    SET display_name = NEW.display_name, role = NEW.role
    WHERE id = NEW.id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.user_directory WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER sync_user_directory_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_directory();