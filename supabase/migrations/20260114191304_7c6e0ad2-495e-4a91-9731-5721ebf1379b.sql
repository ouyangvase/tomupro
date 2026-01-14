-- Allow runners to read their own manager bindings (required for Runner Inbound target user dropdown)
ALTER TABLE public.manager_runner_bindings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'manager_runner_bindings'
      AND policyname = 'manager_runner_bindings_select_runner'
  ) THEN
    CREATE POLICY manager_runner_bindings_select_runner
      ON public.manager_runner_bindings
      FOR SELECT
      TO authenticated
      USING (runner_id = auth.uid());
  END IF;
END$$;

-- Unified view for runner target users (salespersons + managers bound to runner)
CREATE OR REPLACE VIEW public.v_runner_target_users
WITH (security_invoker=on) AS
  SELECT
    b.runner_id,
    p.id AS user_id,
    p.display_name AS name,
    p.email,
    p.role,
    w.id AS warehouse_id
  FROM public.bindings b
  JOIN public.profiles p ON p.id = b.salesperson_id
  LEFT JOIN LATERAL (
    SELECT id
    FROM public.warehouses
    WHERE owner_user_id = p.id
      AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1
  ) w ON true
  WHERE b.active = true

  UNION ALL

  SELECT
    m.runner_id,
    p.id AS user_id,
    p.display_name AS name,
    p.email,
    p.role,
    w.id AS warehouse_id
  FROM public.manager_runner_bindings m
  JOIN public.profiles p ON p.id = m.manager_id
  LEFT JOIN LATERAL (
    SELECT id
    FROM public.warehouses
    WHERE owner_user_id = p.id
      AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1
  ) w ON true;