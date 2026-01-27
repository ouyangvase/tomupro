-- Update/create functions only (table already exists)

-- 1. Create updated get_accessible_owner_ids function with scope support
CREATE OR REPLACE FUNCTION public.get_accessible_owner_ids(p_scope TEXT DEFAULT 'orders')
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role app_role;
  v_result uuid[];
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;
  
  SELECT role INTO v_role FROM profiles WHERE id = v_user_id;
  
  -- Admin sees all (null = no filter)
  IF v_role = 'admin' THEN
    RETURN NULL;
  END IF;
  
  -- Start with own ID
  v_result := ARRAY[v_user_id];
  
  -- Add team members (for managers)
  IF v_role = 'manager' THEN
    v_result := v_result || COALESCE(ARRAY(
      SELECT salesperson_id FROM manager_salesperson_bindings
      WHERE manager_id = v_user_id AND active = true
      UNION
      SELECT gm.member_user_id FROM manager_groups mg
      JOIN group_members gm ON gm.group_id = mg.id
      WHERE mg.manager_user_id = v_user_id
      UNION
      SELECT id FROM profiles
      WHERE manager_id = v_user_id AND is_active = true
    ), ARRAY[]::uuid[]);
  END IF;
  
  -- Add runner bindings (for runners)
  IF v_role = 'runner' THEN
    v_result := v_result || COALESCE(ARRAY(
      SELECT salesperson_id FROM bindings
      WHERE runner_id = v_user_id AND active = true
      UNION
      SELECT manager_id FROM manager_runner_bindings
      WHERE runner_id = v_user_id
    ), ARRAY[]::uuid[]);
  END IF;
  
  -- Add shared subjects based on scope
  v_result := v_result || COALESCE(ARRAY(
    SELECT subject_user_id FROM user_data_shares
    WHERE viewer_user_id = v_user_id
      AND active = true
      AND CASE p_scope
        WHEN 'orders' THEN scope_orders
        WHEN 'products' THEN scope_products
        WHEN 'stock' THEN scope_stock_balance
        WHEN 'inbound' THEN scope_inbound
        ELSE scope_orders
      END = true
  ), ARRAY[]::uuid[]);
  
  -- Return unique IDs
  RETURN ARRAY(SELECT DISTINCT unnest(v_result));
END;
$$;

-- 2. Create helper function to check if user can operate on shared data
CREATE OR REPLACE FUNCTION public.can_operate_on_shared_data(p_viewer_id uuid, p_subject_id uuid, p_scope TEXT DEFAULT 'orders')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_data_shares
    WHERE viewer_user_id = p_viewer_id
      AND subject_user_id = p_subject_id
      AND active = true
      AND can_operate = true
      AND CASE p_scope
        WHEN 'orders' THEN scope_orders
        WHEN 'products' THEN scope_products
        WHEN 'stock' THEN scope_stock_balance
        WHEN 'inbound' THEN scope_inbound
        ELSE scope_orders
      END = true
  )
$$;

-- 3. Create trigger to update updated_at (drop first if exists)
DROP TRIGGER IF EXISTS update_user_data_shares_updated_at ON public.user_data_shares;

CREATE OR REPLACE FUNCTION public.update_user_data_shares_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_data_shares_updated_at
  BEFORE UPDATE ON public.user_data_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_data_shares_updated_at();

-- 4. Update is_in_manager_team to include data shares
CREATE OR REPLACE FUNCTION public.is_in_manager_team(p_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Own data
    p_owner_id = auth.uid()
    OR
    -- Admin sees all
    get_user_role(auth.uid()) = 'admin'
    OR
    -- Manager team visibility
    (
      get_user_role(auth.uid()) = 'manager'
      AND (
        EXISTS (
          SELECT 1 FROM manager_salesperson_bindings
          WHERE manager_id = auth.uid() AND salesperson_id = p_owner_id AND active = true
        )
        OR EXISTS (
          SELECT 1 FROM manager_groups mg
          JOIN group_members gm ON gm.group_id = mg.id
          WHERE mg.manager_user_id = auth.uid() AND gm.member_user_id = p_owner_id
        )
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE id = p_owner_id AND manager_id = auth.uid()
        )
      )
    )
    OR
    -- Data share visibility (any scope grants basic visibility)
    EXISTS (
      SELECT 1 FROM user_data_shares
      WHERE viewer_user_id = auth.uid()
        AND subject_user_id = p_owner_id
        AND active = true
    )
$$;

-- 5. Add share_id to access_audit_log if not exists
ALTER TABLE public.access_audit_log 
  ADD COLUMN IF NOT EXISTS share_id UUID REFERENCES public.user_data_shares(id) ON DELETE SET NULL;