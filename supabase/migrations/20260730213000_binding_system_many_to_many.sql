-- Canonical many-to-many binding support.
-- This migration never mutates orders, delivery assignments, or stock.

ALTER TABLE public.manager_salesperson_bindings
  ADD COLUMN IF NOT EXISTS removed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.runner_drivers
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS removed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Replace the old one-active-manager-per-salesperson rule with pair identity.
DROP INDEX IF EXISTS public.idx_unique_salesperson_binding;

CREATE UNIQUE INDEX IF NOT EXISTS uq_manager_salesperson_binding_pair
  ON public.manager_salesperson_bindings(manager_id, salesperson_id);

CREATE INDEX IF NOT EXISTS idx_msb_salesperson
  ON public.manager_salesperson_bindings(salesperson_id);

-- Preserve both legacy manager team sources in the canonical junction table.
INSERT INTO public.manager_salesperson_bindings (
  manager_id,
  salesperson_id,
  active,
  created_at,
  ended_at,
  created_by,
  updated_at
)
SELECT
  mg.manager_user_id,
  gm.member_user_id,
  true,
  gm.created_at,
  NULL,
  NULL,
  now()
FROM public.group_members gm
JOIN public.manager_groups mg ON mg.id = gm.group_id
JOIN public.profiles sp ON sp.id = gm.member_user_id
WHERE sp.role = 'salesperson'
ON CONFLICT (manager_id, salesperson_id) DO UPDATE
SET active = true,
    ended_at = NULL,
    removed_by = NULL,
    updated_at = now();

INSERT INTO public.manager_salesperson_bindings (
  manager_id,
  salesperson_id,
  active,
  created_at,
  ended_at,
  created_by,
  updated_at
)
SELECT
  sp.manager_id,
  sp.id,
  true,
  COALESCE(sp.created_at, now()),
  NULL,
  NULL,
  now()
FROM public.profiles sp
JOIN public.profiles manager ON manager.id = sp.manager_id
WHERE sp.role = 'salesperson'
  AND sp.manager_id IS NOT NULL
  AND manager.role = 'manager'
ON CONFLICT (manager_id, salesperson_id) DO UPDATE
SET active = true,
    ended_at = NULL,
    removed_by = NULL,
    updated_at = now();

-- Replace the old one-runner-per-driver constraint with pair identity.
ALTER TABLE public.runner_drivers
  DROP CONSTRAINT IF EXISTS unique_driver;

CREATE UNIQUE INDEX IF NOT EXISTS uq_runner_driver_binding_pair
  ON public.runner_drivers(runner_id, driver_id);

CREATE INDEX IF NOT EXISTS idx_runner_drivers_runner
  ON public.runner_drivers(runner_id);

CREATE INDEX IF NOT EXISTS idx_runner_drivers_driver
  ON public.runner_drivers(driver_id);

CREATE OR REPLACE FUNCTION public.add_manager_salesperson_bindings(
  p_manager_id uuid,
  p_salesperson_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_salesperson_id uuid;
  v_binding public.manager_salesperson_bindings%ROWTYPE;
  v_existing public.manager_salesperson_bindings%ROWTYPE;
  v_changed_count integer := 0;
BEGIN
  IF v_actor_id IS NULL OR public.get_user_role(v_actor_id)::text <> 'admin' THEN
    RAISE EXCEPTION 'You are not authorized to manage bindings';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_manager_id AND role = 'manager' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Manager is not active or does not exist';
  END IF;

  IF COALESCE(cardinality(p_salesperson_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one salesperson';
  END IF;

  FOREACH v_salesperson_id IN ARRAY p_salesperson_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = v_salesperson_id AND role = 'salesperson' AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Salesperson % is not active or does not exist', v_salesperson_id;
    END IF;

    SELECT *
    INTO v_existing
    FROM public.manager_salesperson_bindings
    WHERE manager_id = p_manager_id
      AND salesperson_id = v_salesperson_id
    FOR UPDATE;

    IF v_existing.id IS NOT NULL AND v_existing.active THEN
      CONTINUE;
    END IF;

    INSERT INTO public.manager_salesperson_bindings (
      manager_id,
      salesperson_id,
      active,
      ended_at,
      created_by,
      removed_by,
      updated_at
    )
    VALUES (
      p_manager_id,
      v_salesperson_id,
      true,
      NULL,
      v_actor_id,
      NULL,
      now()
    )
    ON CONFLICT (manager_id, salesperson_id) DO UPDATE
    SET active = true,
        ended_at = NULL,
        created_by = v_actor_id,
        removed_by = NULL,
        updated_at = now()
    RETURNING * INTO v_binding;

    INSERT INTO public.audit_logs (
      entity_type,
      entity_id,
      action,
      actor_id,
      before_json,
      after_json
    )
    VALUES (
      'manager_salesperson_binding',
      v_binding.id,
      CASE WHEN v_existing.id IS NULL THEN 'BINDING_CREATED' ELSE 'BINDING_REACTIVATED' END,
      v_actor_id,
      CASE
        WHEN v_existing.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'relationship_type', 'manager_salesperson',
          'manager_id', v_existing.manager_id,
          'salesperson_id', v_existing.salesperson_id,
          'active', v_existing.active,
          'ended_at', v_existing.ended_at
        )
      END,
      jsonb_build_object(
        'relationship_type', 'manager_salesperson',
        'manager_id', p_manager_id,
        'manager_name', (SELECT display_name FROM public.profiles WHERE id = p_manager_id),
        'salesperson_id', v_salesperson_id,
        'salesperson_name', (SELECT display_name FROM public.profiles WHERE id = v_salesperson_id),
        'active', true
      )
    );

    v_changed_count := v_changed_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'changed_count', v_changed_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_manager_salesperson_binding(
  p_binding_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_binding public.manager_salesperson_bindings%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL OR public.get_user_role(v_actor_id)::text <> 'admin' THEN
    RAISE EXCEPTION 'You are not authorized to manage bindings';
  END IF;

  SELECT *
  INTO v_binding
  FROM public.manager_salesperson_bindings
  WHERE id = p_binding_id
  FOR UPDATE;

  IF v_binding.id IS NULL THEN
    RAISE EXCEPTION 'Binding does not exist';
  END IF;

  IF NOT v_binding.active THEN
    RETURN jsonb_build_object('success', true, 'changed_count', 0);
  END IF;

  UPDATE public.manager_salesperson_bindings
  SET active = false,
      ended_at = now(),
      removed_by = v_actor_id,
      updated_at = now()
  WHERE id = p_binding_id;

  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    action,
    actor_id,
    before_json,
    after_json
  )
  VALUES (
    'manager_salesperson_binding',
    v_binding.id,
    'BINDING_REMOVED',
    v_actor_id,
    jsonb_build_object(
      'relationship_type', 'manager_salesperson',
      'manager_id', v_binding.manager_id,
      'salesperson_id', v_binding.salesperson_id,
      'active', true
    ),
    jsonb_build_object(
      'relationship_type', 'manager_salesperson',
      'manager_id', v_binding.manager_id,
      'manager_name', (SELECT display_name FROM public.profiles WHERE id = v_binding.manager_id),
      'salesperson_id', v_binding.salesperson_id,
      'salesperson_name', (SELECT display_name FROM public.profiles WHERE id = v_binding.salesperson_id),
      'active', false,
      'removed_at', now()
    )
  );

  RETURN jsonb_build_object('success', true, 'changed_count', 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_runner_driver_bindings(
  p_runner_id uuid,
  p_driver_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_driver_id uuid;
  v_binding public.runner_drivers%ROWTYPE;
  v_existing public.runner_drivers%ROWTYPE;
  v_changed_count integer := 0;
BEGIN
  IF v_actor_id IS NULL OR public.get_user_role(v_actor_id)::text <> 'admin' THEN
    RAISE EXCEPTION 'You are not authorized to manage bindings';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_runner_id AND role = 'runner' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Runner is not active or does not exist';
  END IF;

  IF COALESCE(cardinality(p_driver_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one driver';
  END IF;

  FOREACH v_driver_id IN ARRAY p_driver_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = v_driver_id AND role = 'driver' AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Driver % is not active or does not exist', v_driver_id;
    END IF;

    SELECT *
    INTO v_existing
    FROM public.runner_drivers
    WHERE runner_id = p_runner_id
      AND driver_id = v_driver_id
    FOR UPDATE;

    IF v_existing.id IS NOT NULL AND v_existing.is_active THEN
      CONTINUE;
    END IF;

    INSERT INTO public.runner_drivers (
      runner_id,
      driver_id,
      is_active,
      created_by,
      removed_by,
      removed_at,
      updated_at
    )
    VALUES (
      p_runner_id,
      v_driver_id,
      true,
      v_actor_id,
      NULL,
      NULL,
      now()
    )
    ON CONFLICT (runner_id, driver_id) DO UPDATE
    SET is_active = true,
        created_by = v_actor_id,
        removed_by = NULL,
        removed_at = NULL,
        updated_at = now()
    RETURNING * INTO v_binding;

    INSERT INTO public.audit_logs (
      entity_type,
      entity_id,
      action,
      actor_id,
      before_json,
      after_json
    )
    VALUES (
      'runner_driver_binding',
      v_binding.id,
      CASE WHEN v_existing.id IS NULL THEN 'BINDING_CREATED' ELSE 'BINDING_REACTIVATED' END,
      v_actor_id,
      CASE
        WHEN v_existing.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'relationship_type', 'runner_driver',
          'runner_id', v_existing.runner_id,
          'driver_id', v_existing.driver_id,
          'active', v_existing.is_active,
          'removed_at', v_existing.removed_at
        )
      END,
      jsonb_build_object(
        'relationship_type', 'runner_driver',
        'runner_id', p_runner_id,
        'runner_name', (SELECT display_name FROM public.profiles WHERE id = p_runner_id),
        'driver_id', v_driver_id,
        'driver_name', (SELECT display_name FROM public.profiles WHERE id = v_driver_id),
        'active', true
      )
    );

    v_changed_count := v_changed_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'changed_count', v_changed_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_runner_driver_binding(
  p_binding_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_binding public.runner_drivers%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL OR public.get_user_role(v_actor_id)::text <> 'admin' THEN
    RAISE EXCEPTION 'You are not authorized to manage bindings';
  END IF;

  SELECT *
  INTO v_binding
  FROM public.runner_drivers
  WHERE id = p_binding_id
  FOR UPDATE;

  IF v_binding.id IS NULL THEN
    RAISE EXCEPTION 'Binding does not exist';
  END IF;

  IF NOT v_binding.is_active THEN
    RETURN jsonb_build_object('success', true, 'changed_count', 0);
  END IF;

  UPDATE public.runner_drivers
  SET is_active = false,
      removed_by = v_actor_id,
      removed_at = now(),
      updated_at = now()
  WHERE id = p_binding_id;

  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    action,
    actor_id,
    before_json,
    after_json
  )
  VALUES (
    'runner_driver_binding',
    v_binding.id,
    'BINDING_REMOVED',
    v_actor_id,
    jsonb_build_object(
      'relationship_type', 'runner_driver',
      'runner_id', v_binding.runner_id,
      'driver_id', v_binding.driver_id,
      'active', true
    ),
    jsonb_build_object(
      'relationship_type', 'runner_driver',
      'runner_id', v_binding.runner_id,
      'runner_name', (SELECT display_name FROM public.profiles WHERE id = v_binding.runner_id),
      'driver_id', v_binding.driver_id,
      'driver_name', (SELECT display_name FROM public.profiles WHERE id = v_binding.driver_id),
      'active', false,
      'removed_at', now()
    )
  );

  RETURN jsonb_build_object('success', true, 'changed_count', 1);
END;
$$;

REVOKE ALL ON FUNCTION public.add_manager_salesperson_bindings(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_manager_salesperson_binding(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_runner_driver_bindings(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_runner_driver_binding(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.add_manager_salesperson_bindings(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_manager_salesperson_binding(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_runner_driver_bindings(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_runner_driver_binding(uuid) TO authenticated;

-- Driver self-linking now adds/reactivates one pair instead of replacing another runner.
CREATE OR REPLACE FUNCTION public.link_driver_to_runner_by_code(p_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_driver_id uuid := auth.uid();
  v_runner_id uuid;
  v_runner_name text;
  v_code text := upper(trim(coalesce(p_code, '')));
  v_link public.runner_drivers%ROWTYPE;
  v_link_id uuid;
BEGIN
  IF v_driver_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_driver_id AND role = 'driver' AND is_active = true
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Only active drivers can use this feature');
  END IF;

  SELECT id, display_name
  INTO v_runner_id, v_runner_name
  FROM public.profiles
  WHERE runner_code = v_code
    AND role = 'runner'
    AND is_active = true
  LIMIT 1;

  IF v_runner_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid runner code');
  END IF;

  SELECT *
  INTO v_link
  FROM public.runner_drivers
  WHERE runner_id = v_runner_id
    AND driver_id = v_driver_id
  FOR UPDATE;

  IF v_link.id IS NOT NULL AND v_link.is_active THEN
    RETURN json_build_object(
      'success', true,
      'runner_id', v_runner_id,
      'runner_name', v_runner_name,
      'already_linked', true,
      'relinked', false
    );
  END IF;

  INSERT INTO public.runner_drivers (
    runner_id,
    driver_id,
    is_active,
    created_by,
    removed_by,
    removed_at,
    updated_at
  )
  VALUES (
    v_runner_id,
    v_driver_id,
    true,
    v_driver_id,
    NULL,
    NULL,
    now()
  )
  ON CONFLICT (runner_id, driver_id) DO UPDATE
  SET is_active = true,
      created_by = v_driver_id,
      removed_by = NULL,
      removed_at = NULL,
      updated_at = now()
  RETURNING id INTO v_link_id;

  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    action,
    actor_id,
    before_json,
    after_json
  )
  VALUES (
    'runner_driver_binding',
    v_link_id,
    CASE WHEN v_link.id IS NULL THEN 'DRIVER_RUNNER_LINKED' ELSE 'DRIVER_RUNNER_REACTIVATED' END,
    v_driver_id,
    CASE
      WHEN v_link.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'relationship_type', 'runner_driver',
        'runner_id', v_runner_id,
        'driver_id', v_driver_id,
        'active', v_link.is_active
      )
    END,
    jsonb_build_object(
      'relationship_type', 'runner_driver',
      'runner_id', v_runner_id,
      'runner_name', v_runner_name,
      'driver_id', v_driver_id,
      'active', true
    )
  );

  RETURN json_build_object(
    'success', true,
    'runner_id', v_runner_id,
    'runner_name', v_runner_name,
    'already_linked', false,
    'relinked', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_driver_to_runner_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_driver_to_runner_by_code(text) TO authenticated;

-- Existing singular callers keep a stable primary runner without blocking extra links.
CREATE OR REPLACE FUNCTION public.get_driver_parent_runner(p_driver_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT runner_id
  FROM public.runner_drivers
  WHERE driver_id = p_driver_id
    AND is_active = true
  ORDER BY created_at, id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_role public.app_role;
  requested_role text;
  v_runner_code text;
  v_runner_id uuid;
  v_runner_name text;
  v_link_id uuid;
BEGIN
  requested_role := NEW.raw_user_meta_data ->> 'role';
  v_runner_code := nullif(upper(trim(NEW.raw_user_meta_data ->> 'runner_code')), '');

  IF requested_role = 'admin' THEN
    user_role := 'admin'::public.app_role;
  ELSIF requested_role = 'manager' THEN
    user_role := 'manager'::public.app_role;
  ELSIF requested_role = 'salesperson' THEN
    user_role := 'salesperson'::public.app_role;
  ELSIF requested_role = 'runner' THEN
    user_role := 'runner'::public.app_role;
  ELSIF requested_role = 'driver' THEN
    user_role := 'driver'::public.app_role;
  ELSIF requested_role = 'finance_viewer' THEN
    user_role := 'finance_viewer'::public.app_role;
  ELSE
    user_role := 'driver'::public.app_role;
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, role, display_name, email)
    VALUES (
      NEW.id,
      user_role,
      coalesce(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
      NEW.email
    );
  EXCEPTION
    WHEN unique_violation THEN
      UPDATE public.profiles
      SET role = user_role,
          display_name = coalesce(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
          email = NEW.email
      WHERE id = NEW.id;
    WHEN OTHERS THEN
      RAISE WARNING '[handle_new_user] profile insert failed: % %', SQLERRM, SQLSTATE;
  END;

  BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, user_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING '[handle_new_user] user_roles insert failed: % %', SQLERRM, SQLSTATE;
  END;

  IF user_role = 'driver'::public.app_role AND v_runner_code IS NOT NULL THEN
    BEGIN
      SELECT id, display_name
      INTO v_runner_id, v_runner_name
      FROM public.profiles
      WHERE runner_code = v_runner_code
        AND role = 'runner'
        AND is_active = true
      LIMIT 1;

      IF v_runner_id IS NOT NULL THEN
        INSERT INTO public.runner_drivers (
          runner_id,
          driver_id,
          is_active,
          created_by,
          updated_at
        )
        VALUES (
          v_runner_id,
          NEW.id,
          true,
          NEW.id,
          now()
        )
        ON CONFLICT (runner_id, driver_id) DO UPDATE
        SET is_active = true,
            created_by = NEW.id,
            removed_by = NULL,
            removed_at = NULL,
            updated_at = now()
        RETURNING id INTO v_link_id;

        INSERT INTO public.audit_logs (
          entity_type,
          entity_id,
          action,
          actor_id,
          after_json
        )
        VALUES (
          'runner_driver_binding',
          v_link_id,
          'DRIVER_RUNNER_LINKED_SIGNUP',
          NEW.id,
          jsonb_build_object(
            'relationship_type', 'runner_driver',
            'runner_id', v_runner_id,
            'runner_name', v_runner_name,
            'driver_id', NEW.id,
            'runner_code', v_runner_code,
            'active', true
          )
        );
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING '[handle_new_user] runner binding failed: % %', SQLERRM, SQLSTATE;
    END;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
