-- Fix RLS for driver acknowledgement updates on driver_pickups
-- Previously, UPDATE policy required status='PENDING_DRIVER_ACK' on the *new* row too, causing "new row violates row-level security".
DROP POLICY IF EXISTS "Driver can acknowledge their pickups" ON public.driver_pickups;

CREATE POLICY "Driver can acknowledge their pickups"
ON public.driver_pickups
FOR UPDATE
USING (
  driver_id = auth.uid()
  AND status = 'PENDING_DRIVER_ACK'::text
)
WITH CHECK (
  driver_id = auth.uid()
  AND status = 'DRIVER_ACKED'::text
);