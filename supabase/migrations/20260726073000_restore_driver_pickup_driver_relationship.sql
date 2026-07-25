-- Restore the relationship used by runner pickup schedule queries.
-- The column remained in production, but its foreign key was missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.driver_pickups'::regclass
      AND conname = 'driver_pickups_driver_id_fkey'
  ) THEN
    ALTER TABLE public.driver_pickups
      ADD CONSTRAINT driver_pickups_driver_id_fkey
      FOREIGN KEY (driver_id)
      REFERENCES public.profiles(id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_driver_pickups_driver_schedule
  ON public.driver_pickups (driver_id, pickup_date DESC, status);
