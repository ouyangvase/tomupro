-- Drivers can read item rows for orders assigned to them.
-- Orders themselves already have a driver SELECT policy; this policy lets the
-- nested order_items relation render product/SKU/qty in the driver app/export.
DROP POLICY IF EXISTS "Drivers can view assigned order items" ON public.order_items;

CREATE POLICY "Drivers can view assigned order items"
ON public.order_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.driver_id = auth.uid()
  )
);
