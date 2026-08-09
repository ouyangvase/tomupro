-- Keep invite-code validation read-only. Usage is claimed atomically by the
-- auth trigger only after Supabase has accepted the new user.
CREATE OR REPLACE FUNCTION public.validate_invite_code(code_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role
  INTO v_role
  FROM public.invite_codes
  WHERE code = UPPER(TRIM(COALESCE(code_text, '')))
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND COALESCE(used_count, 0) < COALESCE(max_uses, 1)
  LIMIT 1;

  RETURN v_role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_invite_code(TEXT) TO anon, authenticated;

-- The browser may send editable user metadata, so role assignment must not
-- trust the requested role. A valid admin-created invite is the only way to
-- receive its configured role; without one every self-registration is a
-- driver and is gated by driver onboarding until linked to a runner.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role public.app_role;
  v_invite_code TEXT;
  v_invite_role TEXT;
  v_runner_code TEXT;
  v_runner_id UUID;
  v_runner_name TEXT;
  v_link_id UUID;
BEGIN
  v_invite_code := NULLIF(UPPER(TRIM(NEW.raw_user_meta_data ->> 'invite_code')), '');
  v_runner_code := NULLIF(UPPER(TRIM(NEW.raw_user_meta_data ->> 'runner_code')), '');

  IF v_invite_code IS NULL THEN
    user_role := 'driver'::public.app_role;
  ELSE
    UPDATE public.invite_codes
    SET used_count = COALESCE(used_count, 0) + 1,
        is_active = CASE
          WHEN COALESCE(used_count, 0) + 1 >= max_uses THEN false
          ELSE is_active
        END
    WHERE code = v_invite_code
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
      AND COALESCE(used_count, 0) < COALESCE(max_uses, 1)
    RETURNING role INTO v_invite_role;

    IF v_invite_role IS NULL THEN
      RAISE EXCEPTION 'Invalid or expired invite code';
    END IF;

    IF v_invite_role NOT IN ('salesperson', 'runner', 'driver') THEN
      RAISE EXCEPTION 'Invite code has an unsupported registration role';
    END IF;

    user_role := v_invite_role::public.app_role;
  END IF;

  INSERT INTO public.profiles (id, role, display_name, email)
  VALUES (
    NEW.id,
    user_role,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role,
      display_name = EXCLUDED.display_name,
      email = EXCLUDED.email;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- A runner code is optional at signup. If it is valid, link immediately;
  -- otherwise the driver is intentionally sent through the normal onboarding
  -- screen and can enter a code after signing in.
  IF user_role = 'driver'::public.app_role AND v_runner_code IS NOT NULL THEN
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
      VALUES (v_runner_id, NEW.id, true, NEW.id, now())
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
  END IF;

  RETURN NEW;
END;
$$;
