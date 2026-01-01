-- Add email column to user_directory
ALTER TABLE public.user_directory ADD COLUMN IF NOT EXISTS email text;

-- Backfill email from profiles
UPDATE public.user_directory ud
SET email = p.email
FROM public.profiles p
WHERE ud.id = p.id;

-- Update the sync trigger to include email
CREATE OR REPLACE FUNCTION public.sync_user_directory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_directory (id, display_name, role, email, created_at)
    VALUES (NEW.id, NEW.display_name, NEW.role, NEW.email, NEW.created_at)
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      role = EXCLUDED.role,
      email = EXCLUDED.email;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.user_directory
    SET display_name = NEW.display_name, role = NEW.role, email = NEW.email
    WHERE id = NEW.id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.user_directory WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;