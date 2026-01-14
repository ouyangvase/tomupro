-- Add MANAGER to warehouse_type enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MANAGER' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'warehouse_type')) THEN
    ALTER TYPE warehouse_type ADD VALUE 'MANAGER';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;