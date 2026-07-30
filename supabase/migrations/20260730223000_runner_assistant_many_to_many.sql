-- Runner Assistants are a many-to-many relationship. Permissions remain one
-- global profile per Assistant and are mirrored to every active Runner link.

ALTER TABLE public.runner_assistants
  DROP CONSTRAINT IF EXISTS unique_runner_assistant;

ALTER TABLE public.runner_assistants
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.runner_assistants'::regclass
      AND conname = 'runner_assistants_assistant_runner_key'
  ) THEN
    ALTER TABLE public.runner_assistants
      ADD CONSTRAINT runner_assistants_assistant_runner_key
      UNIQUE (assistant_id, runner_id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_runner_assistants_runner_active
  ON public.runner_assistants (runner_id, assistant_id)
  WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.inherit_runner_assistant_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.runner_assistants%ROWTYPE;
BEGIN
  SELECT *
  INTO v_existing
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
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inherit_runner_assistant_permissions
  ON public.runner_assistants;
CREATE TRIGGER trg_inherit_runner_assistant_permissions
  BEFORE INSERT ON public.runner_assistants
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_runner_assistant_permissions();

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
      can_view_driver_workload
    ) IS DISTINCT FROM (
      NEW.can_deliver,
      NEW.can_confirm_receipt,
      NEW.can_manage_driver_stock,
      NEW.can_manage_driver_inbox,
      NEW.can_manage_cash_settlement,
      NEW.can_manage_driver_operations,
      NEW.can_view_stock_audit,
      NEW.can_manage_inbound_stock,
      NEW.can_view_driver_workload
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_runner_assistant_permissions
  ON public.runner_assistants;
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
    can_view_driver_workload
  ON public.runner_assistants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_runner_assistant_permissions();

CREATE OR REPLACE FUNCTION public.audit_runner_assistant_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'RUNNER_ASSISTANT_RUNNER_ADDED';
  ELSIF OLD.is_active AND NOT NEW.is_active THEN
    v_action := 'RUNNER_ASSISTANT_RUNNER_REMOVED';
  ELSIF NOT OLD.is_active AND NEW.is_active THEN
    v_action := 'RUNNER_ASSISTANT_RUNNER_REACTIVATED';
  ELSIF (
    OLD.can_deliver,
    OLD.can_confirm_receipt,
    OLD.can_manage_driver_stock,
    OLD.can_manage_driver_inbox,
    OLD.can_manage_cash_settlement,
    OLD.can_manage_driver_operations,
    OLD.can_view_stock_audit,
    OLD.can_manage_inbound_stock,
    OLD.can_view_driver_workload
  ) IS DISTINCT FROM (
    NEW.can_deliver,
    NEW.can_confirm_receipt,
    NEW.can_manage_driver_stock,
    NEW.can_manage_driver_inbox,
    NEW.can_manage_cash_settlement,
    NEW.can_manage_driver_operations,
    NEW.can_view_stock_audit,
    NEW.can_manage_inbound_stock,
    NEW.can_view_driver_workload
  ) THEN
    v_action := 'RUNNER_ASSISTANT_PERMISSIONS_CHANGED';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    action,
    before_json,
    after_json,
    actor_id,
    performed_by_user_id,
    performed_by_role,
    assigned_runner_id,
    action_type,
    action_description
  )
  VALUES (
    'runner_assistant_binding',
    NEW.id,
    v_action,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW),
    v_actor,
    v_actor,
    CASE WHEN v_actor IS NULL THEN NULL ELSE public.get_user_role(v_actor)::text END,
    NEW.runner_id,
    v_action,
    format('Assistant %s / Runner %s', NEW.assistant_id, NEW.runner_id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_runner_assistant_binding
  ON public.runner_assistants;
CREATE TRIGGER trg_audit_runner_assistant_binding
  AFTER INSERT OR UPDATE ON public.runner_assistants
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_runner_assistant_binding();

CREATE OR REPLACE FUNCTION public.add_runner_assistant_links(
  p_assistant_id uuid,
  p_runner_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_runner_id uuid;
  v_changed integer := 0;
  v_binding_id uuid;
BEGIN
  IF v_actor IS NULL OR public.get_user_role(v_actor) <> 'admin' THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  IF p_assistant_id IS NULL OR COALESCE(cardinality(p_runner_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Assistant and at least one Runner are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_assistant_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Assistant user is not active';
  END IF;

  FOR v_runner_id IN
    SELECT DISTINCT unnest(p_runner_ids)
  LOOP
    IF v_runner_id = p_assistant_id THEN
      RAISE EXCEPTION 'A user cannot assist themselves';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = v_runner_id
        AND role = 'runner'
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Runner % is not an active Runner', v_runner_id;
    END IF;

    INSERT INTO public.runner_assistants (
      runner_id,
      assistant_id,
      is_active,
      created_by,
      updated_at
    )
    VALUES (
      v_runner_id,
      p_assistant_id,
      true,
      v_actor,
      now()
    )
    ON CONFLICT (assistant_id, runner_id)
    DO UPDATE SET
      is_active = true,
      updated_at = now()
    WHERE public.runner_assistants.is_active = false
    RETURNING id INTO v_binding_id;

    IF v_binding_id IS NOT NULL THEN
      v_changed := v_changed + 1;
    END IF;
    v_binding_id := NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'changed_count', v_changed,
    'assistant_id', p_assistant_id
  );
END;
$$;

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
      updated_at = now()
  WHERE assistant_id = p_assistant_id;

  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'changed_count', v_changed);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_runner_assistant_link(
  p_binding_id uuid
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
  SET is_active = false,
      updated_at = now()
  WHERE id = p_binding_id
    AND is_active = true;

  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'changed_count', v_changed);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_runner_assistant(
  p_assistant_id uuid
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
  SET is_active = false,
      updated_at = now()
  WHERE assistant_id = p_assistant_id
    AND is_active = true;

  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'changed_count', v_changed);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_runner_assistant_runner_ids(
  p_assistant_id uuid,
  p_permissions text[]
)
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
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
      OR (ra.can_manage_driver_inbox AND 'driver_inbox' = ANY (p_permissions))
      OR (ra.can_manage_driver_stock AND 'driver_stock' = ANY (p_permissions))
      OR (ra.can_deliver AND 'deliver' = ANY (p_permissions))
      OR (ra.can_confirm_receipt AND 'confirm_receipt' = ANY (p_permissions))
    );
$$;

REVOKE ALL ON FUNCTION public.add_runner_assistant_links(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_runner_assistant_permissions(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_runner_assistant_link(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_runner_assistant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_runner_assistant_links(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_runner_assistant_permissions(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_runner_assistant_link(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_runner_assistant(uuid) TO authenticated;

COMMENT ON TABLE public.runner_assistants IS
  'Many-to-many Runner Assistant links. Permission columns form one global Assistant profile and are synchronized across links.';

CREATE OR REPLACE FUNCTION public.get_runner_assistant_delivered_orders(
  p_runner_id uuid,
  p_salesperson_id uuid DEFAULT NULL,
  p_salesperson_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  order_code text,
  order_date date,
  customer_name text,
  phone text,
  area text,
  address text,
  total_amount numeric,
  total_qty integer,
  payment_method text,
  runner_status text,
  reconciliation_status text,
  delivered_at timestamptz,
  salesperson_id uuid,
  salesperson_name text,
  runner_id uuid,
  runner_name text,
  driver_id uuid,
  driver_name text,
  items_summary text,
  items_json jsonb,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR p_runner_id IS NULL
     OR NOT public.has_runner_assistant_permission(auth.uid(), p_runner_id, 'deliver') THEN
    INSERT INTO public.audit_logs (
      entity_type,
      entity_id,
      action,
      actor_id,
      performed_by_user_id,
      performed_by_role,
      assigned_runner_id,
      action_type,
      action_description
    )
    VALUES (
      'runner_assistant_access',
      auth.uid(),
      'RUNNER_ASSISTANT_ACCESS_REJECTED',
      auth.uid(),
      auth.uid(),
      CASE WHEN auth.uid() IS NULL THEN NULL ELSE public.get_user_role(auth.uid())::text END,
      p_runner_id,
      'DELIVERED_ORDERS_ACCESS_REJECTED',
      format('Rejected Delivered Orders access for Runner %s', p_runner_id)
    );
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.get_delivered_orders_fast(
    p_runner_id,
    p_salesperson_id,
    p_salesperson_ids,
    p_limit,
    p_offset
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_runner_assistant_delivered_orders(
  uuid, uuid, uuid[], integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_runner_assistant_delivered_orders(
  uuid, uuid, uuid[], integer, integer
) TO authenticated;

NOTIFY pgrst, 'reload schema';
