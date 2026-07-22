-- Runner-owned stock location remarks.
-- These notes describe where a runner physically keeps a visible stock item,
-- without changing product data, warehouse ownership, or stock balances.

CREATE TABLE IF NOT EXISTS public.runner_stock_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  remark text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT runner_stock_locations_unique_item UNIQUE (runner_id, warehouse_id, product_id),
  CONSTRAINT runner_stock_locations_remark_length CHECK (char_length(remark) <= 180)
);

CREATE INDEX IF NOT EXISTS idx_runner_stock_locations_runner
  ON public.runner_stock_locations (runner_id);

CREATE INDEX IF NOT EXISTS idx_runner_stock_locations_item
  ON public.runner_stock_locations (warehouse_id, product_id);

ALTER TABLE public.runner_stock_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read runner stock locations" ON public.runner_stock_locations;
CREATE POLICY "Admins can read runner stock locations"
  ON public.runner_stock_locations
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Runners can read own stock locations" ON public.runner_stock_locations;
CREATE POLICY "Runners can read own stock locations"
  ON public.runner_stock_locations
  FOR SELECT
  USING (
    runner_id = auth.uid()
    AND public.has_role(auth.uid(), 'runner')
  );

DROP POLICY IF EXISTS "Runners can insert own stock locations" ON public.runner_stock_locations;
CREATE POLICY "Runners can insert own stock locations"
  ON public.runner_stock_locations
  FOR INSERT
  WITH CHECK (
    runner_id = auth.uid()
    AND updated_by = auth.uid()
    AND public.has_role(auth.uid(), 'runner')
    AND EXISTS (
      SELECT 1
      FROM public.warehouses w
      WHERE w.id = warehouse_id
        AND public.can_view_stock(w.owner_user_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Runners can update own stock locations" ON public.runner_stock_locations;
CREATE POLICY "Runners can update own stock locations"
  ON public.runner_stock_locations
  FOR UPDATE
  USING (
    runner_id = auth.uid()
    AND public.has_role(auth.uid(), 'runner')
  )
  WITH CHECK (
    runner_id = auth.uid()
    AND updated_by = auth.uid()
    AND public.has_role(auth.uid(), 'runner')
    AND EXISTS (
      SELECT 1
      FROM public.warehouses w
      WHERE w.id = warehouse_id
        AND public.can_view_stock(w.owner_user_id, auth.uid())
    )
  );

DROP TRIGGER IF EXISTS update_runner_stock_locations_updated_at ON public.runner_stock_locations;
CREATE TRIGGER update_runner_stock_locations_updated_at
  BEFORE UPDATE ON public.runner_stock_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE ON public.runner_stock_locations TO authenticated;
