-- Fix the overly permissive INSERT policy on commission_snapshots
-- Only allow inserts from authenticated users (system/admin context)
DROP POLICY IF EXISTS "System can insert commission snapshots" ON public.commission_snapshots;

CREATE POLICY "Admins can create commission snapshots"
ON public.commission_snapshots
FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);