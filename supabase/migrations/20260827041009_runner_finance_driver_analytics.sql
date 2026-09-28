BEGIN;

ALTER TABLE public.runner_assistants
  ADD COLUMN IF NOT EXISTS can_view_driver_analytics boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.has_runner_assistant_permission(
  p_assistant_id uuid,
  p_runner_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.runner_assistants ra
    WHERE ra.assistant_id = p_assistant_id
      AND ra.runner_id = p_runner_id
      AND ra.is_active = true
      AND CASE p_permission
        WHEN 'cash_settlement' THEN ra.can_manage_cash_settlement
        WHEN 'driver_operations' THEN ra.can_manage_driver_operations
        WHEN 'stock_audit' THEN ra.can_view_stock_audit
        WHEN 'inbound_stock' THEN ra.can_manage_inbound_stock
        WHEN 'driver_workload' THEN ra.can_view_driver_workload
        WHEN 'driver_analytics' THEN ra.can_view_driver_analytics
        WHEN 'driver_inbox' THEN ra.can_manage_driver_inbox
        WHEN 'driver_stock' THEN ra.can_manage_driver_stock
        WHEN 'deliver' THEN ra.can_deliver
        WHEN 'confirm_receipt' THEN ra.can_confirm_receipt
        ELSE false
      END
  );
$$;

CREATE OR REPLACE FUNCTION public.get_runner_assistant_runner_ids(
  p_assistant_id uuid,
  p_permissions text[]
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT ra.runner_id), ARRAY[]::uuid[])
  FROM public.runner_assistants ra
  WHERE ra.assistant_id = p_assistant_id
    AND ra.is_active = true
    AND (
      (ra.can_manage_cash_settlement AND 'cash_settlement' = ANY (p_permissions))
      OR (ra.can_manage_driver_operations AND 'driver_operations' = ANY (p_permissions))
      OR (ra.can_view_stock_audit AND 'stock_audit' = ANY (p_permissions))
      OR (ra.can_manage_inbound_stock AND 'inbound_stock' = ANY (p_permissions))
      OR (ra.can_view_driver_workload AND 'driver_workload' = ANY (p_permissions))
      OR (ra.can_view_driver_analytics AND 'driver_analytics' = ANY (p_permissions))
      OR (ra.can_manage_driver_inbox AND 'driver_inbox' = ANY (p_permissions))
      OR (ra.can_manage_driver_stock AND 'driver_stock' = ANY (p_permissions))
      OR (ra.can_deliver AND 'deliver' = ANY (p_permissions))
      OR (ra.can_confirm_receipt AND 'confirm_receipt' = ANY (p_permissions))
    );
$$;

CREATE OR REPLACE FUNCTION public.inherit_runner_assistant_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.runner_assistants%ROWTYPE;
BEGIN
  SELECT * INTO v_existing
  FROM public.runner_assistants
  WHERE assistant_id = NEW.assistant_id
  ORDER BY is_active DESC, created_at ASC
  LIMIT 1;

  IF FOUND THEN
    NEW.can_deliver := v_existing.can_deliver;
    NEW.can_confirm_receipt := v_existing.can_confirm_receipt;
    NEW.can_manage_driver_stock := v_existing.can_manage_driver_stock;
    NEW.can_manage_driver_inbox := v_existing.can_manage_driver_inbox;
    NEW.can_manage_cash_settlement := v_existing.can_manage_cash_settlement;
    NEW.can_manage_driver_operations := v_existing.can_manage_driver_operations;
    NEW.can_view_stock_audit := v_existing.can_view_stock_audit;
    NEW.can_manage_inbound_stock := v_existing.can_manage_inbound_stock;
    NEW.can_view_driver_workload := v_existing.can_view_driver_workload;
    NEW.can_view_driver_analytics := v_existing.can_view_driver_analytics;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_runner_assistant_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  UPDATE public.runner_assistants
  SET can_deliver = NEW.can_deliver,
      can_confirm_receipt = NEW.can_confirm_receipt,
      can_manage_driver_stock = NEW.can_manage_driver_stock,
      can_manage_driver_inbox = NEW.can_manage_driver_inbox,
      can_manage_cash_settlement = NEW.can_manage_cash_settlement,
      can_manage_driver_operations = NEW.can_manage_driver_operations,
      can_view_stock_audit = NEW.can_view_stock_audit,
      can_manage_inbound_stock = NEW.can_manage_inbound_stock,
      can_view_driver_workload = NEW.can_view_driver_workload,
      can_view_driver_analytics = NEW.can_view_driver_analytics,
      updated_at = now()
  WHERE assistant_id = NEW.assistant_id
    AND id <> NEW.id
    AND (
      can_deliver,
      can_confirm_receipt,
      can_manage_driver_stock,
      can_manage_driver_inbox,
      can_manage_cash_settlement,
      can_manage_driver_operations,
      can_view_stock_audit,
      can_manage_inbound_stock,
      can_view_driver_workload,
      can_view_driver_analytics
    ) IS DISTINCT FROM (
      NEW.can_deliver,
      NEW.can_confirm_receipt,
      NEW.can_manage_driver_stock,
      NEW.can_manage_driver_inbox,
      NEW.can_manage_cash_settlement,
      NEW.can_manage_driver_operations,
      NEW.can_view_stock_audit,
      NEW.can_manage_inbound_stock,
      NEW.can_view_driver_workload,
      NEW.can_view_driver_analytics
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inherit_runner_assistant_permissions ON public.runner_assistants;
CREATE TRIGGER trg_inherit_runner_assistant_permissions
  BEFORE INSERT ON public.runner_assistants
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_runner_assistant_permissions();

DROP TRIGGER IF EXISTS trg_sync_runner_assistant_permissions ON public.runner_assistants;
CREATE TRIGGER trg_sync_runner_assistant_permissions
  AFTER UPDATE OF
    can_deliver,
    can_confirm_receipt,
    can_manage_driver_stock,
    can_manage_driver_inbox,
    can_manage_cash_settlement,
    can_manage_driver_operations,
    can_view_stock_audit,
    can_manage_inbound_stock,
    can_view_driver_workload,
    can_view_driver_analytics
  ON public.runner_assistants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_runner_assistant_permissions();

CREATE OR REPLACE FUNCTION public.set_runner_assistant_permissions(
  p_assistant_id uuid,
  p_permissions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_changed integer;
BEGIN
  IF v_actor IS NULL OR public.get_user_role(v_actor) <> 'admin' THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  UPDATE public.runner_assistants
  SET can_deliver = COALESCE((p_permissions ->> 'can_deliver')::boolean, can_deliver),
      can_confirm_receipt = COALESCE((p_permissions ->> 'can_confirm_receipt')::boolean, can_confirm_receipt),
      can_manage_driver_stock = COALESCE((p_permissions ->> 'can_manage_driver_stock')::boolean, can_manage_driver_stock),
      can_manage_driver_inbox = COALESCE((p_permissions ->> 'can_manage_driver_inbox')::boolean, can_manage_driver_inbox),
      can_manage_cash_settlement = COALESCE((p_permissions ->> 'can_manage_cash_settlement')::boolean, can_manage_cash_settlement),
      can_manage_driver_operations = COALESCE((p_permissions ->> 'can_manage_driver_operations')::boolean, can_manage_driver_operations),
      can_view_stock_audit = COALESCE((p_permissions ->> 'can_view_stock_audit')::boolean, can_view_stock_audit),
      can_manage_inbound_stock = COALESCE((p_permissions ->> 'can_manage_inbound_stock')::boolean, can_manage_inbound_stock),
      can_view_driver_workload = COALESCE((p_permissions ->> 'can_view_driver_workload')::boolean, can_view_driver_workload),
      can_view_driver_analytics = COALESCE((p_permissions ->> 'can_view_driver_analytics')::boolean, can_view_driver_analytics),
      updated_at = now()
  WHERE assistant_id = p_assistant_id;

  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'changed_count', v_changed);
END;
$$;

DROP POLICY IF EXISTS "Runner assistants can view bound runner drivers" ON public.runner_drivers;
CREATE POLICY "Runner assistants can view bound runner drivers"
  ON public.runner_drivers FOR SELECT
  USING (
    runner_id = ANY (
      COALESCE(
        public.get_runner_assistant_runner_ids(
          auth.uid(),
          ARRAY['driver_inbox', 'driver_stock', 'driver_operations', 'driver_workload', 'driver_analytics', 'cash_settlement']::text[]
        ),
        ARRAY[]::uuid[]
      )
    )
  );

DROP POLICY IF EXISTS "Runner assistants can view bound driver profiles" ON public.profiles;
CREATE POLICY "Runner assistants can view bound driver profiles"
  ON public.profiles FOR SELECT
  USING (
    id IN (
      SELECT rd.driver_id
      FROM public.runner_drivers rd
      WHERE rd.is_active = true
        AND rd.runner_id = ANY (
          COALESCE(
            public.get_runner_assistant_runner_ids(
              auth.uid(),
              ARRAY['driver_inbox', 'driver_stock', 'driver_operations', 'driver_workload', 'driver_analytics', 'cash_settlement']::text[]
            ),
            ARRAY[]::uuid[]
          )
        )
    )
  );

DO $migration$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_old text;
  v_new text := $new$
  IF v_actor_id IS NULL OR (
    v_actor_id <> p_driver_id
    AND v_role NOT IN ('admin', 'runner', 'runner_assistant')
  ) THEN
    RAISE EXCEPTION 'Driver Analytics is only available to an authorized Runner, Driver, or administrator';
  END IF;

  IF v_actor_id <> p_driver_id
    AND v_role = 'runner'
    AND NOT EXISTS (
      SELECT 1
      FROM public.runner_drivers rd
      WHERE rd.runner_id = v_actor_id
        AND rd.driver_id = p_driver_id
        AND rd.is_active = true
    )
  THEN
    RAISE EXCEPTION 'Driver is not linked to this Runner';
  END IF;

  IF v_actor_id <> p_driver_id
    AND v_role = 'runner_assistant'
    AND NOT EXISTS (
      SELECT 1
      FROM public.runner_drivers rd
      WHERE rd.driver_id = p_driver_id
        AND rd.is_active = true
        AND public.has_runner_assistant_permission(v_actor_id, rd.runner_id, 'driver_analytics')
    )
  THEN
    RAISE EXCEPTION 'Driver Analytics access is not enabled for this Runner';
  END IF;
$new$;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_driver_analytics(uuid,date,date,date,date)'::regprocedure,
    'public.get_driver_analytics_day(uuid,date)'::regprocedure
  ]
  LOOP
    SELECT pg_get_functiondef(v_signature) INTO v_definition;
    v_old := CASE
      WHEN v_signature::text LIKE '%get_driver_analytics_day%'
        THEN $old_day$
  IF v_actor_id IS NULL OR (v_actor_id <> p_driver_id AND v_role <> 'admin') THEN
    RAISE EXCEPTION 'Driver Analytics details are only available to the Driver or an administrator';
  END IF;$old_day$
      ELSE $old_summary$
  IF v_actor_id IS NULL OR (v_actor_id <> p_driver_id AND v_role <> 'admin') THEN
    RAISE EXCEPTION 'Driver Analytics is only available to the Driver or an administrator';
  END IF;$old_summary$
    END;
    IF strpos(v_definition, v_old) = 0 THEN
      RAISE EXCEPTION 'Unable to patch Driver Analytics authorization for %', v_signature;
    END IF;
    EXECUTE replace(v_definition, v_old, v_new);
  END LOOP;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.get_runner_driver_analytics(
  p_runner_ids uuid[],
  p_range_from date,
  p_range_to date,
  p_calendar_from date,
  p_calendar_to date,
  p_detail_date date DEFAULT NULL,
  p_driver_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_role text := public.get_user_role(v_actor_id)::text;
  v_runner_ids uuid[] := ARRAY(
    SELECT DISTINCT runner_id
    FROM unnest(COALESCE(p_runner_ids, ARRAY[]::uuid[])) AS requested(runner_id)
    WHERE runner_id IS NOT NULL
  );
  v_driver record;
  v_analytics jsonb;
  v_day jsonb;
  v_drivers jsonb := '[]'::jsonb;
BEGIN
  IF v_actor_id IS NULL OR cardinality(v_runner_ids) = 0 THEN
    RAISE EXCEPTION 'At least one Runner scope is required';
  END IF;

  IF v_role = 'runner' AND NOT v_actor_id = ANY(v_runner_ids) THEN
    RAISE EXCEPTION 'Runner Analytics scope is invalid';
  END IF;

  IF v_role = 'runner_assistant' AND EXISTS (
    SELECT 1
    FROM unnest(v_runner_ids) AS requested(runner_id)
    WHERE NOT public.has_runner_assistant_permission(v_actor_id, requested.runner_id, 'driver_analytics')
  ) THEN
    RAISE EXCEPTION 'Driver Analytics access is not enabled for this Runner';
  END IF;

  IF v_role NOT IN ('admin', 'runner', 'runner_assistant') THEN
    RAISE EXCEPTION 'Driver Analytics is not available for this user';
  END IF;

  IF p_range_from IS NULL OR p_range_to IS NULL OR p_range_from > p_range_to
    OR p_calendar_from IS NULL OR p_calendar_to IS NULL OR p_calendar_from > p_calendar_to
  THEN
    RAISE EXCEPTION 'Invalid analytics date range';
  END IF;

  FOR v_driver IN
    SELECT DISTINCT rd.driver_id,
      COALESCE(driver_profile.display_name, driver_profile.email, 'Unknown Driver') AS driver_name
    FROM public.runner_drivers rd
    JOIN public.profiles driver_profile ON driver_profile.id = rd.driver_id
    WHERE rd.runner_id = ANY(v_runner_ids)
      AND rd.is_active = true
      AND (p_driver_id IS NULL OR rd.driver_id = p_driver_id)
    ORDER BY driver_name, rd.driver_id
  LOOP
    v_analytics := public.get_driver_analytics(
      v_driver.driver_id,
      p_range_from,
      p_range_to,
      p_calendar_from,
      p_calendar_to
    );
    v_day := CASE
      WHEN p_detail_date IS NULL THEN NULL
      ELSE public.get_driver_analytics_day(v_driver.driver_id, p_detail_date)
    END;

    v_drivers := v_drivers || jsonb_build_array(jsonb_build_object(
      'driver_id', v_driver.driver_id,
      'driver_name', v_driver.driver_name,
      'analytics', v_analytics,
      'day', v_day
    ));
  END LOOP;

  RETURN jsonb_build_object('drivers', v_drivers);
END;
$$;

REVOKE ALL ON FUNCTION public.has_runner_assistant_permission(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_runner_assistant_permission(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_runner_assistant_runner_ids(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_runner_assistant_runner_ids(uuid, text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.set_runner_assistant_permissions(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_runner_assistant_permissions(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.get_runner_driver_analytics(uuid[], date, date, date, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_runner_driver_analytics(uuid[], date, date, date, date, date, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_runner_driver_analytics(uuid[], date, date, date, date, date, uuid) IS
  'Returns Delivery Analytics for the active Drivers linked to authorized Runner scopes.';

NOTIFY pgrst, 'reload schema';

COMMIT;
