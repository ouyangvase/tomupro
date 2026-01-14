-- Create manager_ranking_participants table
CREATE TABLE public.manager_ranking_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  manager_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  enabled_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT manager_ranking_participants_manager_id_key UNIQUE (manager_id)
);

-- Enable RLS
ALTER TABLE public.manager_ranking_participants ENABLE ROW LEVEL SECURITY;

-- RLS: Managers can only SELECT enabled participants
CREATE POLICY "Managers can view enabled participants"
ON public.manager_ranking_participants
FOR SELECT
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  OR (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager'
    AND is_enabled = true
  )
);

-- RLS: Only admins can update
CREATE POLICY "Admins can update participants"
ON public.manager_ranking_participants
FOR UPDATE
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- RLS: Only admins can insert (for manual adds)
CREATE POLICY "Admins can insert participants"
ON public.manager_ranking_participants
FOR INSERT
WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- RLS: Only admins can delete
CREATE POLICY "Admins can delete participants"
ON public.manager_ranking_participants
FOR DELETE
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Create trigger to auto-insert participant row when user becomes manager
CREATE OR REPLACE FUNCTION public.auto_create_manager_ranking_participant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When a user's role changes to manager, create participant row
  IF NEW.role = 'manager' AND (OLD.role IS NULL OR OLD.role != 'manager') THEN
    INSERT INTO public.manager_ranking_participants (manager_id, is_enabled, enabled_at)
    VALUES (NEW.id, true, now())
    ON CONFLICT (manager_id) DO UPDATE SET
      is_enabled = true,
      enabled_at = now(),
      disabled_at = NULL,
      updated_at = now();
  END IF;
  
  -- When a manager is deactivated, disable their ranking participation
  IF NEW.role = 'manager' AND OLD.is_active = true AND NEW.is_active = false THEN
    UPDATE public.manager_ranking_participants
    SET is_enabled = false, disabled_at = now(), updated_at = now()
    WHERE manager_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on profiles table
DROP TRIGGER IF EXISTS trigger_auto_create_manager_ranking_participant ON public.profiles;
CREATE TRIGGER trigger_auto_create_manager_ranking_participant
  AFTER INSERT OR UPDATE OF role, is_active ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_manager_ranking_participant();

-- Backfill existing managers
INSERT INTO public.manager_ranking_participants (manager_id, is_enabled, enabled_at)
SELECT id, true, now()
FROM public.profiles
WHERE role = 'manager' AND is_active = true
ON CONFLICT (manager_id) DO NOTHING;

-- Create index for performance
CREATE INDEX idx_manager_ranking_participants_enabled ON public.manager_ranking_participants(is_enabled) WHERE is_enabled = true;