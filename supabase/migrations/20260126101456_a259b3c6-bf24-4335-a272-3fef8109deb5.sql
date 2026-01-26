-- Table to track admin impersonation sessions for audit
CREATE TABLE public.admin_impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES public.profiles(id) NOT NULL,
  target_user_id uuid REFERENCES public.profiles(id) NOT NULL,
  target_role app_role NOT NULL,
  started_at timestamptz DEFAULT now() NOT NULL,
  ended_at timestamptz,
  actions_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX idx_impersonation_admin ON public.admin_impersonation_sessions(admin_id);
CREATE INDEX idx_impersonation_active ON public.admin_impersonation_sessions(admin_id) WHERE ended_at IS NULL;

-- RLS: Only admins can read/write
ALTER TABLE public.admin_impersonation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage impersonation sessions"
  ON public.admin_impersonation_sessions
  FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

-- Add Impersonation Fields to Audit Logs
ALTER TABLE public.audit_logs
ADD COLUMN impersonated_user_id uuid REFERENCES public.profiles(id),
ADD COLUMN impersonation_session_id uuid REFERENCES public.admin_impersonation_sessions(id);

COMMENT ON COLUMN public.audit_logs.impersonated_user_id IS 'If set, admin was viewing as this user when action was performed';
COMMENT ON COLUMN public.audit_logs.impersonation_session_id IS 'Links to the impersonation session record';

-- Create RPC function to get visible owner IDs for a specific user (for impersonation)
CREATE OR REPLACE FUNCTION public.get_visible_owner_ids_for_user(p_user_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role app_role;
  v_result uuid[];
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;
  
  IF v_role = 'admin' THEN
    RETURN NULL; -- Admin sees all (null = no filter)
  ELSIF v_role = 'manager' THEN
    -- Return manager + team members
    SELECT ARRAY_AGG(DISTINCT member_id) INTO v_result
    FROM (
      -- From manager_salesperson_bindings
      SELECT salesperson_id as member_id 
      FROM manager_salesperson_bindings
      WHERE manager_id = p_user_id AND active = true
      UNION
      -- From group_members
      SELECT gm.member_user_id as member_id
      FROM manager_groups mg
      JOIN group_members gm ON gm.group_id = mg.id
      WHERE mg.manager_user_id = p_user_id
      UNION
      -- Include self
      SELECT p_user_id as member_id
    ) sub;
    RETURN COALESCE(v_result, ARRAY[p_user_id]);
  ELSE
    -- Salesperson, runner, driver: only own data
    RETURN ARRAY[p_user_id];
  END IF;
END;
$$;