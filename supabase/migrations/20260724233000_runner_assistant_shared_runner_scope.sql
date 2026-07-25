DROP POLICY IF EXISTS "Runner assistants can view bound runner drivers"
  ON public.runner_drivers;

CREATE POLICY "Runner assistants can view bound runner drivers"
  ON public.runner_drivers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.runner_assistants ra
      WHERE ra.assistant_id = auth.uid()
        AND ra.runner_id = runner_drivers.runner_id
        AND ra.is_active = true
        AND (ra.can_manage_driver_inbox = true OR ra.can_manage_driver_stock = true)
    )
  );

DROP POLICY IF EXISTS "Runner assistants can view bound driver profiles"
  ON public.profiles;

CREATE POLICY "Runner assistants can view bound driver profiles"
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.runner_drivers rd
      JOIN public.runner_assistants ra ON ra.runner_id = rd.runner_id
      WHERE rd.driver_id = profiles.id
        AND rd.is_active = true
        AND ra.assistant_id = auth.uid()
        AND ra.is_active = true
        AND (ra.can_manage_driver_inbox = true OR ra.can_manage_driver_stock = true)
    )
  );

DROP POLICY IF EXISTS "Runner assistants can manage bound runner pickups"
  ON public.driver_pickups;

CREATE POLICY "Runner assistants can manage bound runner pickups"
  ON public.driver_pickups
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.runner_assistants ra
      WHERE ra.assistant_id = auth.uid()
        AND ra.runner_id = driver_pickups.runner_id
        AND ra.is_active = true
        AND ra.can_manage_driver_stock = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.runner_assistants ra
      WHERE ra.assistant_id = auth.uid()
        AND ra.runner_id = driver_pickups.runner_id
        AND ra.is_active = true
        AND ra.can_manage_driver_stock = true
    )
  );

DROP POLICY IF EXISTS "Runner assistants can manage bound runner pickup items"
  ON public.driver_pickup_items;

CREATE POLICY "Runner assistants can manage bound runner pickup items"
  ON public.driver_pickup_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.driver_pickups dp
      JOIN public.runner_assistants ra ON ra.runner_id = dp.runner_id
      WHERE dp.id = driver_pickup_items.pickup_id
        AND ra.assistant_id = auth.uid()
        AND ra.is_active = true
        AND ra.can_manage_driver_stock = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.driver_pickups dp
      JOIN public.runner_assistants ra ON ra.runner_id = dp.runner_id
      WHERE dp.id = driver_pickup_items.pickup_id
        AND ra.assistant_id = auth.uid()
        AND ra.is_active = true
        AND ra.can_manage_driver_stock = true
    )
  );

DROP POLICY IF EXISTS "Runner assistants can manage bound runner returns"
  ON public.driver_returns;

CREATE POLICY "Runner assistants can manage bound runner returns"
  ON public.driver_returns
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.runner_assistants ra
      WHERE ra.assistant_id = auth.uid()
        AND ra.runner_id = driver_returns.runner_id
        AND ra.is_active = true
        AND ra.can_manage_driver_stock = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.runner_assistants ra
      WHERE ra.assistant_id = auth.uid()
        AND ra.runner_id = driver_returns.runner_id
        AND ra.is_active = true
        AND ra.can_manage_driver_stock = true
    )
  );

DROP POLICY IF EXISTS "Runner assistants can manage bound runner return items"
  ON public.driver_return_items;

CREATE POLICY "Runner assistants can manage bound runner return items"
  ON public.driver_return_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.driver_returns dr
      JOIN public.runner_assistants ra ON ra.runner_id = dr.runner_id
      WHERE dr.id = driver_return_items.return_id
        AND ra.assistant_id = auth.uid()
        AND ra.is_active = true
        AND ra.can_manage_driver_stock = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.driver_returns dr
      JOIN public.runner_assistants ra ON ra.runner_id = dr.runner_id
      WHERE dr.id = driver_return_items.return_id
        AND ra.assistant_id = auth.uid()
        AND ra.is_active = true
        AND ra.can_manage_driver_stock = true
    )
  );

NOTIFY pgrst, 'reload schema';
