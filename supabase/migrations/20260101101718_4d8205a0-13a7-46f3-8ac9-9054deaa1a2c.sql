-- Create unified reasons table
CREATE TABLE public.reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reason_type TEXT NOT NULL CHECK (reason_type IN ('CANCEL', 'FAILED_DELIVERY', 'DISPUTE')),
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES public.profiles(id)
);

-- Enable RLS
ALTER TABLE public.reasons ENABLE ROW LEVEL SECURITY;

-- Everyone can read active reasons
CREATE POLICY "Active reasons viewable by all authenticated"
ON public.reasons
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only Admin can insert
CREATE POLICY "Admin can insert reasons"
ON public.reasons
FOR INSERT
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

-- Only Admin can update
CREATE POLICY "Admin can update reasons"
ON public.reasons
FOR UPDATE
USING (get_user_role(auth.uid()) = 'admin'::app_role);

-- Only Admin can delete
CREATE POLICY "Admin can delete reasons"
ON public.reasons
FOR DELETE
USING (get_user_role(auth.uid()) = 'admin'::app_role);

-- Migrate existing cancel_reasons to new table
INSERT INTO public.reasons (reason_type, label, is_active, created_by)
SELECT 'CANCEL', reason, is_active, (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1)
FROM public.cancel_reasons;

-- Migrate existing failed_reasons to new table
INSERT INTO public.reasons (reason_type, label, is_active, created_by)
SELECT 'FAILED_DELIVERY', reason, is_active, (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1)
FROM public.failed_reasons;
