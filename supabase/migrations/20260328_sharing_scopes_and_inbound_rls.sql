-- ============================================================
-- Expand data sharing scopes + Inbound RLS with data sharing
-- ============================================================

-- 1. Add new scope columns to user_data_shares
ALTER TABLE public.user_data_shares
  ADD COLUMN IF NOT EXISTS scope_delivered_orders BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scope_claims BOOLEAN NOT NULL DEFAULT false;

-- 2. Update get_accessible_owner_ids to support new scopes
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
        WHEN 'delivered_orders' THEN scope_delivered_orders
        WHEN 'claims' THEN scope_claims
        ELSE scope_orders
      END = true
  ), ARRAY[]::uuid[]);

  -- Return unique IDs
  RETURN ARRAY(SELECT DISTINCT unnest(v_result));
END;
$$;

-- 3. Update can_operate_on_shared_data to support new scopes
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
        WHEN 'delivered_orders' THEN scope_delivered_orders
        WHEN 'claims' THEN scope_claims
        ELSE scope_orders
      END = true
  )
$$;

-- 4. Update inbound_shipments RLS to include data sharing
-- Drop existing policy
DROP POLICY IF EXISTS "Inbound shipments viewable by relevant users" ON public.inbound_shipments;

-- New policy: own data + data sharing + admin
CREATE POLICY "Inbound shipments viewable by relevant users"
  ON public.inbound_shipments
  FOR SELECT
  USING (
    auth.uid() = runner_id
    OR auth.uid() = salesperson_id
    OR get_user_role(auth.uid()) = 'admin'
    OR EXISTS (
      SELECT 1 FROM user_data_shares
      WHERE viewer_user_id = auth.uid()
        AND subject_user_id = inbound_shipments.salesperson_id
        AND scope_inbound = true
        AND active = true
    )
  );

-- 5. Update inbound_items RLS to match
DROP POLICY IF EXISTS "Inbound items access by related parties" ON public.inbound_items;

CREATE POLICY "Inbound items access by related parties"
  ON public.inbound_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM inbound_shipments s
      WHERE s.id = inbound_items.inbound_id
        AND (
          auth.uid() = s.runner_id
          OR auth.uid() = s.salesperson_id
          OR get_user_role(auth.uid()) = 'admin'
          OR EXISTS (
            SELECT 1 FROM user_data_shares
            WHERE viewer_user_id = auth.uid()
              AND subject_user_id = s.salesperson_id
              AND scope_inbound = true
              AND active = true
          )
        )
    )
  );
