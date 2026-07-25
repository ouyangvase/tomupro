DO $$
BEGIN
  ALTER TABLE public.driver_returns
    ADD COLUMN IF NOT EXISTS acknowledged_by uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'driver_returns_driver_id_fkey'
      AND conrelid = 'public.driver_returns'::regclass
  ) THEN
    ALTER TABLE public.driver_returns
      ADD CONSTRAINT driver_returns_driver_id_fkey
      FOREIGN KEY (driver_id)
      REFERENCES public.profiles(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'driver_returns_runner_id_fkey'
      AND conrelid = 'public.driver_returns'::regclass
  ) THEN
    ALTER TABLE public.driver_returns
      ADD CONSTRAINT driver_returns_runner_id_fkey
      FOREIGN KEY (runner_id)
      REFERENCES public.profiles(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'driver_returns_acknowledged_by_fkey'
      AND conrelid = 'public.driver_returns'::regclass
  ) THEN
    ALTER TABLE public.driver_returns
      ADD CONSTRAINT driver_returns_acknowledged_by_fkey
      FOREIGN KEY (acknowledged_by)
      REFERENCES public.profiles(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'driver_return_items_return_id_fkey'
      AND conrelid = 'public.driver_return_items'::regclass
  ) THEN
    ALTER TABLE public.driver_return_items
      ADD CONSTRAINT driver_return_items_return_id_fkey
      FOREIGN KEY (return_id)
      REFERENCES public.driver_returns(id)
      ON DELETE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_driver_return_items_return_id
  ON public.driver_return_items(return_id);

NOTIFY pgrst, 'reload schema';
