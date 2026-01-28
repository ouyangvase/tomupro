-- 1) Remove redundant manager-only trigger + function
DROP TRIGGER IF EXISTS trg_ensure_manager_warehouse ON public.profiles;
DROP FUNCTION IF EXISTS public.ensure_manager_warehouse();

-- 2) Make role-change warehouse automation "one-active-warehouse" safe
CREATE OR REPLACE FUNCTION public.auto_create_warehouse_on_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wh_type public.warehouse_type;
  v_existing_id uuid;
BEGIN
  -- Only act when role is inserted/changed
  IF (TG_OP = 'INSERT') OR (OLD.role IS DISTINCT FROM NEW.role) THEN

    -- If new role requires a warehouse, ensure the correct one is active
    IF NEW.role IN ('salesperson', 'runner', 'manager') THEN
      v_wh_type := CASE
        WHEN NEW.role = 'salesperson' THEN 'SALESPERSON'::public.warehouse_type
        WHEN NEW.role = 'manager' THEN 'MANAGER'::public.warehouse_type
        ELSE 'RUNNER'::public.warehouse_type
      END;

      -- Prefer already-active warehouse of correct type; else newest of that type
      SELECT w.id
      INTO v_existing_id
      FROM public.warehouses w
      WHERE w.owner_user_id = NEW.id
        AND w.warehouse_type = v_wh_type
      ORDER BY w.is_active DESC, w.created_at DESC
      LIMIT 1;

      -- Deactivate ALL active warehouses first to satisfy unique partial index
      UPDATE public.warehouses
      SET is_active = false
      WHERE owner_user_id = NEW.id
        AND is_active = true;

      -- Activate existing or create new
      IF v_existing_id IS NOT NULL THEN
        UPDATE public.warehouses
        SET is_active = true
        WHERE id = v_existing_id;
      ELSE
        INSERT INTO public.warehouses (warehouse_type, owner_user_id, name, is_active)
        VALUES (
          v_wh_type,
          NEW.id,
          COALESCE(NEW.display_name, 'User') || '''s Warehouse',
          true
        );
      END IF;

    ELSE
      -- Optional safety: if switching to a role that shouldn't have a warehouse,
      -- ensure none remain active (prevents stale "active warehouse" lingering).
      UPDATE public.warehouses
      SET is_active = false
      WHERE owner_user_id = NEW.id
        AND is_active = true;
    END IF;

  END IF;

  RETURN NEW;
END;
$function$;