-- Performance-only changes. These indexes support existing queries and do not
-- change assignment, delivery, payment, or lifecycle behavior.

CREATE INDEX IF NOT EXISTS idx_driver_pickup_items_pickup_id
  ON public.driver_pickup_items (pickup_id);
