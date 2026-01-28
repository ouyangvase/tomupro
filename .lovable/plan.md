
Goal
- Fix “duplicate key value violates unique constraint idx_unique_active_warehouse_per_user” when changing a user’s role in /settings/users.

What’s happening (root cause)
- The role update on `public.profiles` triggers TWO warehouse-creation triggers:
  1) `on_profile_role_change` → `auto_create_warehouse_on_role_change()`
  2) `trg_ensure_manager_warehouse` → `ensure_manager_warehouse()`
- Both functions can attempt to create/activate a new `warehouses.is_active = true` row while another active warehouse already exists for the same user.
- Because the system enforces “only one active warehouse per user” via the partial unique index `idx_unique_active_warehouse_per_user (owner_user_id) WHERE is_active = true`, this causes the update to fail.

Evidence from backend
- `public.profiles` currently has both triggers installed:
  - `on_profile_role_change` (auto_create_warehouse_on_role_change)
  - `trg_ensure_manager_warehouse` (ensure_manager_warehouse)

Fix strategy
1) Remove the redundant/broken manager-only trigger
   - Drop trigger `trg_ensure_manager_warehouse` from `public.profiles`
   - Drop function `public.ensure_manager_warehouse()`
   Rationale:
   - `auto_create_warehouse_on_role_change()` already covers manager role (so this trigger is unnecessary).
   - `ensure_manager_warehouse()` uses `ON CONFLICT DO NOTHING` but does not target the partial unique index, so it can still throw the unique violation.

2) Make `auto_create_warehouse_on_role_change()` safe with the “one active warehouse” rule
   - Update the function to:
     - Determine the correct warehouse type (SALESPERSON / RUNNER / MANAGER) based on NEW.role
     - Find an existing warehouse of that type for the user (prefer active, else newest)
     - Deactivate ALL currently active warehouses for the user
     - Activate the chosen existing warehouse OR insert a new one as active
   - This guarantees the unique index cannot be violated during the role-change transaction.

3) Verification steps (after migration)
   - Confirm only one role-change warehouse trigger remains:
     - `on_profile_role_change` exists
     - `trg_ensure_manager_warehouse` no longer exists
   - In UI (/settings/users), change roles that previously failed (e.g., salesperson → manager, manager → salesperson) and confirm:
     - No error toast appears
     - Role updates persist after refresh
   - Spot-check warehouses for the changed user:
     - Exactly one active warehouse remains
     - Warehouse type matches the role

Database migration (what I will implement)
- Create a new migration SQL (Test environment) with:

```sql
-- 1) Remove redundant manager-only trigger + function
DROP TRIGGER IF EXISTS trg_ensure_manager_warehouse ON public.profiles;
DROP FUNCTION IF EXISTS public.ensure_manager_warehouse();

-- 2) Make role-change warehouse automation “one-active-warehouse” safe
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
      -- Optional safety: if switching to a role that shouldn’t have a warehouse,
      -- ensure none remain active (prevents stale “active warehouse” lingering).
      UPDATE public.warehouses
      SET is_active = false
      WHERE owner_user_id = NEW.id
        AND is_active = true;
    END IF;

  END IF;

  RETURN NEW;
END;
$function$;
```

Frontend changes (optional, not required for the error)
- Leave the UI as-is initially; the DB fix should stop the error.
- If you want to reduce redundant warehouse writes later, we can simplify /settings/users by removing the extra post-save warehouse calls and rely purely on the database trigger.

Risks / Notes
- After a role change, the active warehouse may switch types (by design). Since balances are calculated from active warehouses only, a promoted/demoted user might see different “current stock” if stock exists in the now-inactive warehouse. If this is not desired, we can add an explicit “transfer stock” workflow on role change (separate improvement).

Acceptance criteria
- Changing any user’s role in /settings/users no longer triggers the unique constraint error.
- For any user, there is never more than one `warehouses` row with `is_active = true`.
- The active warehouse type matches the user’s role when role is salesperson/runner/manager.
