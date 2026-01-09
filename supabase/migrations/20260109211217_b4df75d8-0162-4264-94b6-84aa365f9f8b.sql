-- =====================================================
-- PART 1: Add new movement type enum values
-- =====================================================

-- Add new movement types for idempotent delivery/return tracking
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'DELIVER_DEDUCT' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'movement_type')) THEN
    ALTER TYPE movement_type ADD VALUE 'DELIVER_DEDUCT';
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'RETURN_TO_OWNER' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'movement_type')) THEN
    ALTER TYPE movement_type ADD VALUE 'RETURN_TO_OWNER';
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'REVERSAL' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'movement_type')) THEN
    ALTER TYPE movement_type ADD VALUE 'REVERSAL';
  END IF;
END $$;

-- Add order_id column to stock_movements for better idempotency tracking
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id);

-- Add unique constraint for viewer_user_id + owner_user_id on stock_visibility_overrides
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'stock_visibility_overrides_viewer_owner_unique'
  ) THEN
    CREATE UNIQUE INDEX stock_visibility_overrides_viewer_owner_unique 
    ON stock_visibility_overrides (viewer_user_id, owner_user_id);
  END IF;
END $$;