-- =====================================================
-- User Offboarding (Resignation) Feature - Schema Updates
-- =====================================================

-- 1. Create user_status enum type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE user_status AS ENUM ('active', 'disabled', 'resigned');
  END IF;
END
$$;

-- 2. Add offboarding columns to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS status user_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_reason text,
  ADD COLUMN IF NOT EXISTS disabled_by uuid REFERENCES profiles(id);

-- Create index for quick status filtering
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);

-- 3. Create transfer_status enum type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transfer_status') THEN
    CREATE TYPE transfer_status AS ENUM (
      'draft',
      'pending_manager_approval',
      'approved',
      'rejected',
      'applied',
      'cancelled'
    );
  END IF;
END
$$;

-- 4. Add approval workflow columns to stock_transfers table
ALTER TABLE stock_transfers
  ADD COLUMN IF NOT EXISTS status transfer_status NOT NULL DEFAULT 'pending_manager_approval',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS offboarding_transfer boolean NOT NULL DEFAULT false;

-- Create indexes for transfer queries
CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON stock_transfers(status);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_owner ON stock_transfers(to_owner_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_offboarding ON stock_transfers(offboarding_transfer) WHERE offboarding_transfer = true;

-- 5. Create auth blocking trigger function
-- This function bans/unbans the user in auth.users when profile status changes
CREATE OR REPLACE FUNCTION handle_user_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- When user becomes disabled or resigned, ban them
  IF NEW.status IN ('disabled', 'resigned') AND (OLD.status IS NULL OR OLD.status = 'active') THEN
    UPDATE auth.users 
    SET banned_until = '2099-12-31 23:59:59+00'::timestamptz
    WHERE id = NEW.id;
    
    -- Log the action
    INSERT INTO audit_logs (actor_id, entity_type, entity_id, action, after_json)
    VALUES (
      NEW.disabled_by,
      'profile',
      NEW.id,
      CASE WHEN NEW.status = 'resigned' THEN 'user_resigned' ELSE 'user_disabled' END,
      jsonb_build_object(
        'user_id', NEW.id,
        'status', NEW.status,
        'reason', NEW.disabled_reason,
        'disabled_by', NEW.disabled_by
      )
    );
  
  -- When user is reactivated, unban them
  ELSIF NEW.status = 'active' AND OLD.status IN ('disabled', 'resigned') THEN
    UPDATE auth.users 
    SET banned_until = NULL
    WHERE id = NEW.id;
    
    -- Log the reactivation
    INSERT INTO audit_logs (actor_id, entity_type, entity_id, action, after_json)
    VALUES (
      auth.uid(),
      'profile',
      NEW.id,
      'user_reactivated',
      jsonb_build_object(
        'user_id', NEW.id,
        'previous_status', OLD.status
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger on profiles table
DROP TRIGGER IF EXISTS on_profile_status_change ON profiles;
CREATE TRIGGER on_profile_status_change
  AFTER UPDATE OF status ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION handle_user_status_change();

-- 6. RLS Policies for stock_transfers

-- Enable RLS on stock_transfers if not already enabled
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to recreate with correct logic)
DROP POLICY IF EXISTS "Admin can view all transfers" ON stock_transfers;
DROP POLICY IF EXISTS "Manager can view own pending transfers" ON stock_transfers;
DROP POLICY IF EXISTS "Admin can create transfers" ON stock_transfers;
DROP POLICY IF EXISTS "Manager can update own transfers" ON stock_transfers;
DROP POLICY IF EXISTS "Users can view transfers involving them" ON stock_transfers;

-- Admin can see all transfers
CREATE POLICY "Admin can view all transfers" ON stock_transfers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Users can view transfers where they are source or destination
CREATE POLICY "Users can view transfers involving them" ON stock_transfers
  FOR SELECT USING (
    from_owner_id = auth.uid() OR to_owner_id = auth.uid()
  );

-- Only admin can create offboarding transfers
CREATE POLICY "Admin can create transfers" ON stock_transfers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admin or recipient manager can update transfers
CREATE POLICY "Users can update transfers" ON stock_transfers
  FOR UPDATE USING (
    -- Admin can update any transfer
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR
    -- Manager can update pending transfers where they are the recipient
    (to_owner_id = auth.uid() AND status = 'pending_manager_approval')
  );

-- 7. RLS Policies for stock_transfer_items

-- Enable RLS on stock_transfer_items if not already enabled
ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admin can view all transfer items" ON stock_transfer_items;
DROP POLICY IF EXISTS "Users can view transfer items for their transfers" ON stock_transfer_items;
DROP POLICY IF EXISTS "Admin can insert transfer items" ON stock_transfer_items;

-- Admin can see all transfer items
CREATE POLICY "Admin can view all transfer items" ON stock_transfer_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Users can view items for transfers involving them
CREATE POLICY "Users can view transfer items for their transfers" ON stock_transfer_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM stock_transfers st
      WHERE st.id = stock_transfer_items.transfer_id
      AND (st.from_owner_id = auth.uid() OR st.to_owner_id = auth.uid())
    )
  );

-- Only admin can create transfer items
CREATE POLICY "Admin can insert transfer items" ON stock_transfer_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 8. Function to atomically apply a stock transfer
-- This is called by the edge function after manager approval
CREATE OR REPLACE FUNCTION apply_stock_transfer(p_transfer_id uuid, p_approver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_transfer stock_transfers%ROWTYPE;
  v_item RECORD;
  v_from_warehouse_id uuid;
  v_to_warehouse_id uuid;
  v_result jsonb;
  v_items_processed int := 0;
  v_total_qty numeric := 0;
BEGIN
  -- Lock and fetch the transfer
  SELECT * INTO v_transfer
  FROM stock_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer not found');
  END IF;
  
  -- Verify status is pending or approved (not already applied)
  IF v_transfer.status NOT IN ('pending_manager_approval', 'approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer is not in a valid state for application. Current status: ' || v_transfer.status);
  END IF;
  
  -- Get warehouse IDs
  v_from_warehouse_id := v_transfer.from_warehouse_id;
  v_to_warehouse_id := v_transfer.to_warehouse_id;
  
  IF v_from_warehouse_id IS NULL OR v_to_warehouse_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid warehouse IDs in transfer');
  END IF;
  
  -- Process each transfer item
  FOR v_item IN 
    SELECT sti.*, p.sku_name, p.sku_code
    FROM stock_transfer_items sti
    JOIN products p ON p.id = sti.product_id
    WHERE sti.transfer_id = p_transfer_id
  LOOP
    -- Create TRANSFER_OUT movement from source warehouse
    INSERT INTO stock_movements (
      warehouse_id,
      product_id,
      movement_type,
      qty_change,
      reference_type,
      reference_id,
      created_by
    ) VALUES (
      v_from_warehouse_id,
      v_item.product_id,
      'TRANSFER_OUT',
      -v_item.qty,
      'MANUAL',
      v_item.id::text,
      p_approver_id
    );
    
    -- Create TRANSFER_IN movement to destination warehouse
    INSERT INTO stock_movements (
      warehouse_id,
      product_id,
      movement_type,
      qty_change,
      reference_type,
      reference_id,
      created_by
    ) VALUES (
      v_to_warehouse_id,
      v_item.product_id,
      'TRANSFER_IN',
      v_item.qty,
      'MANUAL',
      v_item.id::text,
      p_approver_id
    );
    
    v_items_processed := v_items_processed + 1;
    v_total_qty := v_total_qty + v_item.qty;
  END LOOP;
  
  -- Update the transfer status to applied
  UPDATE stock_transfers
  SET 
    status = 'applied',
    approved_by = p_approver_id,
    approved_at = now()
  WHERE id = p_transfer_id;
  
  -- Log the action
  INSERT INTO audit_logs (actor_id, entity_type, entity_id, action, after_json)
  VALUES (
    p_approver_id,
    'stock_transfer',
    p_transfer_id,
    'transfer_applied',
    jsonb_build_object(
      'transfer_id', p_transfer_id,
      'from_owner_id', v_transfer.from_owner_id,
      'to_owner_id', v_transfer.to_owner_id,
      'items_processed', v_items_processed,
      'total_qty', v_total_qty
    )
  );
  
  RETURN jsonb_build_object(
    'success', true, 
    'items_processed', v_items_processed,
    'total_qty', v_total_qty
  );
END;
$$;

-- 9. Function to reject a stock transfer
CREATE OR REPLACE FUNCTION reject_stock_transfer(p_transfer_id uuid, p_rejector_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_transfer stock_transfers%ROWTYPE;
BEGIN
  -- Lock and fetch the transfer
  SELECT * INTO v_transfer
  FROM stock_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer not found');
  END IF;
  
  -- Verify status is pending
  IF v_transfer.status != 'pending_manager_approval' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer is not pending approval');
  END IF;
  
  -- Update the transfer status to rejected
  UPDATE stock_transfers
  SET 
    status = 'rejected',
    rejection_reason = p_reason,
    approved_by = p_rejector_id,
    approved_at = now()
  WHERE id = p_transfer_id;
  
  -- Log the action
  INSERT INTO audit_logs (actor_id, entity_type, entity_id, action, after_json)
  VALUES (
    p_rejector_id,
    'stock_transfer',
    p_transfer_id,
    'transfer_rejected',
    jsonb_build_object(
      'transfer_id', p_transfer_id,
      'from_owner_id', v_transfer.from_owner_id,
      'to_owner_id', v_transfer.to_owner_id,
      'reason', p_reason
    )
  );
  
  RETURN jsonb_build_object('success', true);
END;
$$;