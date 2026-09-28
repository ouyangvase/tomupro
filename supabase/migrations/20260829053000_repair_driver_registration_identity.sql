-- Repair the three accidental Sharul registrations found during the
-- production audit, then enforce normalized-email uniqueness for future signups.
-- The repair is deliberately guarded by the audited canonical Gmail identity
-- and refuses to remove any account with business-data references.
DO $$
DECLARE
  canonical_id UUID := 'a5226dee-ef64-4fbe-a659-522077577815';
  duplicate_ids UUID[] := ARRAY[
    'c1b3f237-45fb-4156-ac1c-1d4ef5a68afc'::UUID,
    'b32f3a98-545f-411e-98c4-ad16db8a5b7a'::UUID
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = canonical_id
      AND lower(btrim(email)) = 'sahrul.razi0312@gmail.com'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orders
    WHERE driver_id = ANY(duplicate_ids)
       OR runner_id = ANY(duplicate_ids)
       OR salesperson_id = ANY(duplicate_ids)
       OR created_by_user_id = ANY(duplicate_ids)
       OR driver_assigned_by = ANY(duplicate_ids)
       OR driver_started_by = ANY(duplicate_ids)
       OR runner_reviewed_by = ANY(duplicate_ids)
       OR receipt_uploaded_by = ANY(duplicate_ids)
  ) OR EXISTS (
    SELECT 1 FROM public.runner_drivers
    WHERE driver_id = ANY(duplicate_ids)
       OR runner_id = ANY(duplicate_ids)
       OR created_by = ANY(duplicate_ids)
       OR removed_by = ANY(duplicate_ids)
  ) OR EXISTS (
    SELECT 1 FROM public.runner_assistants
    WHERE assistant_id = ANY(duplicate_ids)
       OR runner_id = ANY(duplicate_ids)
       OR created_by = ANY(duplicate_ids)
  ) OR EXISTS (
    SELECT 1 FROM public.products
    WHERE owner_user_id = ANY(duplicate_ids)
       OR created_by = ANY(duplicate_ids)
  ) OR EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE created_by = ANY(duplicate_ids)
  ) OR EXISTS (
    SELECT 1 FROM public.stock_transfers
    WHERE from_owner_id = ANY(duplicate_ids)
       OR to_owner_id = ANY(duplicate_ids)
       OR created_by = ANY(duplicate_ids)
       OR approved_by = ANY(duplicate_ids)
  ) OR EXISTS (
    SELECT 1 FROM public.warehouse_members
    WHERE user_id = ANY(duplicate_ids)
       OR created_by = ANY(duplicate_ids)
  ) OR EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = ANY(duplicate_ids)
       OR invited_by = ANY(duplicate_ids)
  ) OR EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE actor_id = ANY(duplicate_ids)
       OR performed_by_user_id = ANY(duplicate_ids)
  ) THEN
    RAISE EXCEPTION 'Refusing duplicate identity repair: audited account has business-data references';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE owner_user_id = ANY(duplicate_ids)
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Refusing duplicate identity repair: audited account has an active warehouse';
  END IF;

  -- Keep user-facing notifications attached to the surviving identity.
  UPDATE public.notifications
  SET user_id = canonical_id
  WHERE user_id = ANY(duplicate_ids);

  -- These warehouses were inactive signup artifacts and have no child rows.
  DELETE FROM public.warehouses
  WHERE owner_user_id = ANY(duplicate_ids);

  DELETE FROM public.user_roles
  WHERE user_id = ANY(duplicate_ids);

  DELETE FROM public.user_directory
  WHERE id = ANY(duplicate_ids);

  DELETE FROM public.profiles
  WHERE id = ANY(duplicate_ids);

  -- Remove only the two audited, unreferenced Auth identities. Existing audit
  -- rows use generic entity IDs and are intentionally preserved.
  DELETE FROM auth.users
  WHERE id = ANY(duplicate_ids);
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_normalized_email_unique_idx
  ON public.profiles (lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

-- Keep the existing registration role and Runner Code behavior, while making
-- email identity deterministic and preventing concurrent duplicate profiles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role public.app_role;
  v_email TEXT;
  v_invite_code TEXT;
  v_invite_role TEXT;
  v_runner_code TEXT;
  v_runner_id UUID;
  v_runner_name TEXT;
  v_link_id UUID;
BEGIN
  v_email := NULLIF(lower(btrim(NEW.email)), '');
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(btrim(email)) = v_email
      AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'An account with this email already exists';
  END IF;

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
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(v_email, '@', 1)),
    v_email
  )
  ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role,
      display_name = EXCLUDED.display_name,
      email = EXCLUDED.email;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF user_role = 'driver'::public.app_role AND v_runner_code IS NOT NULL THEN
    SELECT id, display_name
    INTO v_runner_id, v_runner_name
    FROM public.profiles
    WHERE runner_code = v_runner_code
      AND role = 'runner'
      AND is_active = true
    LIMIT 1;

    IF v_runner_id IS NULL THEN
      RAISE EXCEPTION 'Invalid runner code';
    END IF;

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

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
