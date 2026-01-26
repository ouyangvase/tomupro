-- =====================================================
-- Admin-Only Data Visibility Sharing System
-- =====================================================

-- Core sharing permissions table
CREATE TABLE user_data_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who can see
  viewer_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Whose data is shared
  subject_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Granular scope toggles
  scope_orders boolean DEFAULT true NOT NULL,
  scope_products boolean DEFAULT true NOT NULL,
  scope_stock_balance boolean DEFAULT true NOT NULL,
  scope_inbound boolean DEFAULT false NOT NULL,
  
  -- Operation permission
  can_operate boolean DEFAULT false NOT NULL,
  
  -- Status
  active boolean DEFAULT true NOT NULL,
  
  -- Audit
  created_by_admin_id uuid REFERENCES profiles(id) NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  
  -- Constraints
  CONSTRAINT unique_viewer_subject UNIQUE (viewer_user_id, subject_user_id),
  CONSTRAINT no_self_share CHECK (viewer_user_id != subject_user_id)
);

-- Indexes for fast lookups
CREATE INDEX idx_shares_viewer ON user_data_shares(viewer_user_id) WHERE active = true;
CREATE INDEX idx_shares_subject ON user_data_shares(subject_user_id) WHERE active = true;

-- RLS: Admin only for management
ALTER TABLE user_data_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage data shares"
  ON user_data_shares
  FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin');

-- Read policy for viewers to see their own shares
CREATE POLICY "Users can view their own shares"
  ON user_data_shares
  FOR SELECT
  USING (viewer_user_id = auth.uid());

-- Audit log for shared data access
CREATE TABLE access_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES profiles(id) NOT NULL,
  subject_user_id uuid REFERENCES profiles(id) NOT NULL,
  action_type text NOT NULL, -- 'view', 'read', 'write'
  resource_type text NOT NULL, -- 'order', 'product', 'stock', 'inbound'
  resource_id uuid,
  share_id uuid REFERENCES user_data_shares(id),
  metadata jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_access_audit_actor ON access_audit_log(actor_user_id);
CREATE INDEX idx_access_audit_subject ON access_audit_log(subject_user_id);
CREATE INDEX idx_access_audit_timestamp ON access_audit_log(created_at DESC);

-- RLS: Admin read-only, authenticated users can insert their own
ALTER TABLE access_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit logs"
  ON access_audit_log
  FOR SELECT
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Users can insert their own audit logs"
  ON access_audit_log
  FOR INSERT
  WITH CHECK (actor_user_id = auth.uid());

-- Helper to check if user can operate on subject's data
CREATE OR REPLACE FUNCTION can_operate_on_user(p_viewer_id uuid, p_subject_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_data_shares
    WHERE viewer_user_id = p_viewer_id
      AND subject_user_id = p_subject_id
      AND can_operate = true
      AND active = true
  )
  OR p_viewer_id = p_subject_id  -- Can always operate on own data
  OR get_user_role(p_viewer_id) = 'admin';  -- Admin can operate on all
$$;

-- Helper to get share scopes for a viewer-subject pair
CREATE OR REPLACE FUNCTION get_share_scopes(p_viewer_id uuid, p_subject_id uuid)
RETURNS TABLE(
  has_access boolean,
  scope_orders boolean,
  scope_products boolean,
  scope_stock_balance boolean,
  scope_inbound boolean,
  can_operate boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    true AS has_access,
    uds.scope_orders,
    uds.scope_products,
    uds.scope_stock_balance,
    uds.scope_inbound,
    uds.can_operate
  FROM user_data_shares uds
  WHERE uds.viewer_user_id = p_viewer_id
    AND uds.subject_user_id = p_subject_id
    AND uds.active = true
  LIMIT 1;
$$;

-- Get all accessible user IDs for a given user (including shares)
CREATE OR REPLACE FUNCTION get_accessible_user_ids(p_user_id uuid DEFAULT NULL)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role app_role;
  v_result uuid[];
  v_shared_subjects uuid[];
  v_team_ids uuid[];
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  
  IF v_user_id IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;
  
  v_role := public.get_user_role(v_user_id);
  
  -- Admin can see all - return NULL to indicate no filter
  IF v_role = 'admin' THEN
    RETURN NULL;
  END IF;
  
  -- Start with own ID
  v_result := ARRAY[v_user_id];
  
  -- Add team members if manager
  IF v_role = 'manager' THEN
    SELECT ARRAY_AGG(DISTINCT salesperson_id)
    INTO v_team_ids
    FROM manager_salesperson_bindings
    WHERE manager_id = v_user_id AND active = true;
    
    IF v_team_ids IS NOT NULL THEN
      v_result := v_result || v_team_ids;
    END IF;
  END IF;
  
  -- Add shared subjects
  SELECT ARRAY_AGG(DISTINCT subject_user_id)
  INTO v_shared_subjects
  FROM user_data_shares
  WHERE viewer_user_id = v_user_id
    AND active = true;
  
  IF v_shared_subjects IS NOT NULL THEN
    v_result := v_result || v_shared_subjects;
  END IF;
  
  -- Return unique IDs
  RETURN ARRAY(SELECT DISTINCT unnest(v_result));
END;
$$;

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_data_share_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_data_shares_updated_at
  BEFORE UPDATE ON user_data_shares
  FOR EACH ROW
  EXECUTE FUNCTION update_data_share_updated_at();