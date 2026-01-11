-- Create invite_codes table
CREATE TABLE public.invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'salesperson',
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  is_active BOOLEAN DEFAULT true,
  max_uses INTEGER DEFAULT 1,
  used_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins can view all invite codes"
ON public.invite_codes FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can create invite codes"
ON public.invite_codes FOR INSERT
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can update invite codes"
ON public.invite_codes FOR UPDATE
USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can delete invite codes"
ON public.invite_codes FOR DELETE
USING (public.get_user_role(auth.uid()) = 'admin');

-- Create the validate_invite_code RPC (SECURITY DEFINER for public access)
CREATE OR REPLACE FUNCTION public.validate_invite_code(code_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_id UUID;
  v_role TEXT;
  v_used_count INTEGER;
  v_max_uses INTEGER;
BEGIN
  -- Find valid code
  SELECT id, role, used_count, max_uses
  INTO v_code_id, v_role, v_used_count, v_max_uses
  FROM public.invite_codes
  WHERE code = UPPER(TRIM(code_text))
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND used_count < max_uses
  LIMIT 1;
  
  -- If not found, return null
  IF v_code_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Increment used_count
  UPDATE public.invite_codes
  SET used_count = used_count + 1,
      is_active = CASE WHEN used_count + 1 >= max_uses THEN false ELSE is_active END
  WHERE id = v_code_id;
  
  RETURN v_role;
END;
$$;

-- Grant execute permission to authenticated and anon users (for registration)
GRANT EXECUTE ON FUNCTION public.validate_invite_code(TEXT) TO authenticated, anon;