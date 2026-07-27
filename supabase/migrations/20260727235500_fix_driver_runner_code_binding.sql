-- Make runner codes work for both driver signup and profile re-linking.

CREATE OR REPLACE FUNCTION public.validate_runner_code(p_code text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_runner_id uuid;
  v_runner_name text;
  v_code text := upper(trim(coalesce(p_code, '')));
BEGIN
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

  RETURN json_build_object(
    'success', true,
    'runner_id', v_runner_id,
    'runner_name', v_runner_name,
    'runner_code', v_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_runner_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_runner_code(text) TO anon, authenticated;

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
  v_previous_runner_name text;
BEGIN
  IF v_driver_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_driver_id
      AND role = 'driver'
      AND is_active = true
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
  WHERE driver_id = v_driver_id
  FOR UPDATE;

  IF v_link.id IS NOT NULL
     AND v_link.runner_id = v_runner_id
     AND v_link.is_active = true THEN
    RETURN json_build_object(
      'success', true,
      'runner_id', v_runner_id,
      'runner_name', v_runner_name,
      'already_linked', true,
      'relinked', false
    );
  END IF;

  IF v_link.id IS NOT NULL THEN
    SELECT display_name
    INTO v_previous_runner_name
    FROM public.profiles
    WHERE id = v_link.runner_id;

    UPDATE public.runner_drivers
    SET runner_id = v_runner_id,
        is_active = true
    WHERE id = v_link.id
    RETURNING id INTO v_link_id;
  ELSE
    INSERT INTO public.runner_drivers (runner_id, driver_id, is_active)
    VALUES (v_runner_id, v_driver_id, true)
    RETURNING id INTO v_link_id;
  END IF;

  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    action,
    actor_id,
    before_json,
    after_json
  )
  VALUES (
    'runner_driver',
    v_link_id,
    CASE WHEN v_link.id IS NULL THEN 'DRIVER_RUNNER_LINKED' ELSE 'DRIVER_RUNNER_RELINKED' END,
    v_driver_id,
    CASE
      WHEN v_link.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'runner_id', v_link.runner_id,
        'runner_name', v_previous_runner_name,
        'is_active', v_link.is_active
      )
    END,
    jsonb_build_object(
      'runner_id', v_runner_id,
      'runner_name', v_runner_name,
      'is_active', true
    )
  );

  RETURN json_build_object(
    'success', true,
    'runner_id', v_runner_id,
    'runner_name', v_runner_name,
    'already_linked', false,
    'relinked', v_link.id IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_driver_to_runner_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_driver_to_runner_by_code(text) TO authenticated;

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
        INSERT INTO public.runner_drivers (runner_id, driver_id, is_active)
        VALUES (v_runner_id, NEW.id, true)
        ON CONFLICT (driver_id) DO UPDATE
        SET runner_id = EXCLUDED.runner_id,
            is_active = true
        RETURNING id INTO v_link_id;

        INSERT INTO public.audit_logs (
          entity_type,
          entity_id,
          action,
          actor_id,
          after_json
        )
        VALUES (
          'runner_driver',
          v_link_id,
          'DRIVER_RUNNER_LINKED_SIGNUP',
          NEW.id,
          jsonb_build_object(
            'runner_id', v_runner_id,
            'runner_name', v_runner_name,
            'runner_code', v_runner_code,
            'is_active', true
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
