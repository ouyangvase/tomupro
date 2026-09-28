-- TOMU SELLER ACCOUNT IDENTITY
--
-- `seller_accounts.account_code` is the existing human-readable account
-- identifier. Keep it as the canonical storage column and expose it in
-- application/integration payloads as `tomu_account_code`.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tomu_seller_account_code text;

CREATE SEQUENCE IF NOT EXISTS public.seller_account_code_seq;

DO $$
DECLARE
  v_max_code bigint;
BEGIN
  SELECT COALESCE(
    max((substring(account_code from '^TOMU-([0-9]{6})$'))::bigint),
    0
  )
  INTO v_max_code
  FROM public.seller_accounts;

  IF v_max_code > 0 THEN
    PERFORM setval('public.seller_account_code_seq', v_max_code, true);
  ELSE
    PERFORM setval('public.seller_account_code_seq', 1, false);
  END IF;
END $$;

-- Existing non-empty account codes are preserved. Empty legacy values are
-- repaired before the default is applied.
UPDATE public.seller_accounts
SET account_code = 'TOMU-' || lpad(nextval('public.seller_account_code_seq')::text, 6, '0')
WHERE btrim(account_code) = '';

ALTER TABLE public.seller_accounts
  ALTER COLUMN account_code SET DEFAULT (
    'TOMU-' || lpad(nextval('public.seller_account_code_seq')::text, 6, '0')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.seller_accounts'::regclass
      AND conname = 'seller_accounts_tomu_account_code_key'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.seller_accounts'::regclass
        AND conname = 'seller_accounts_account_code_key'
    ) THEN
      ALTER TABLE public.seller_accounts
        RENAME CONSTRAINT seller_accounts_account_code_key
        TO seller_accounts_tomu_account_code_key;
    ELSE
      ALTER TABLE public.seller_accounts
        ADD CONSTRAINT seller_accounts_tomu_account_code_key UNIQUE (account_code);
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_tomu_account_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.account_code IS NULL OR btrim(NEW.account_code) = '' THEN
    NEW.account_code := 'TOMU-' || lpad(nextval('public.seller_account_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_tomu_account_code_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.account_code IS DISTINCT FROM NEW.account_code THEN
    RAISE EXCEPTION 'Tomu Account Code is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_tomu_account_code_trigger ON public.seller_accounts;
CREATE TRIGGER ensure_tomu_account_code_trigger
  BEFORE INSERT ON public.seller_accounts
  FOR EACH ROW EXECUTE FUNCTION public.ensure_tomu_account_code();

DROP TRIGGER IF EXISTS prevent_tomu_account_code_change_trigger ON public.seller_accounts;
CREATE TRIGGER prevent_tomu_account_code_change_trigger
  BEFORE UPDATE ON public.seller_accounts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tomu_account_code_change();

COMMENT ON COLUMN public.seller_accounts.account_code IS
  'Immutable human-readable Tomu seller/store account code; expose as tomu_account_code.';

CREATE TABLE IF NOT EXISTS public.seller_account_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_account_id uuid NOT NULL REFERENCES public.seller_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  membership_role text NOT NULL DEFAULT 'MEMBER' CHECK (membership_role IN ('OWNER', 'MEMBER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  UNIQUE (seller_account_id, user_id)
);

CREATE INDEX IF NOT EXISTS seller_account_members_user_idx
  ON public.seller_account_members(user_id);

INSERT INTO public.seller_account_members (seller_account_id, user_id, membership_role, created_by)
SELECT id, profile_id, 'OWNER', created_by
FROM public.seller_accounts
ON CONFLICT (seller_account_id, user_id) DO UPDATE
SET membership_role = 'OWNER';

CREATE OR REPLACE FUNCTION public.add_seller_account_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.seller_account_members (seller_account_id, user_id, membership_role, created_by)
  VALUES (NEW.id, NEW.profile_id, 'OWNER', NEW.created_by)
  ON CONFLICT (seller_account_id, user_id) DO UPDATE
  SET membership_role = 'OWNER';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS add_seller_account_owner_membership_trigger ON public.seller_accounts;
CREATE TRIGGER add_seller_account_owner_membership_trigger
  AFTER INSERT ON public.seller_accounts
  FOR EACH ROW EXECUTE FUNCTION public.add_seller_account_owner_membership();

ALTER TABLE public.seller_account_members ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.seller_account_members TO authenticated;

CREATE POLICY seller_account_members_self_read
  ON public.seller_account_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY seller_account_members_admin_manage
  ON public.seller_account_members FOR ALL TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY seller_accounts_member_read
  ON public.seller_accounts FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.seller_account_members sam
      WHERE sam.seller_account_id = seller_accounts.id
        AND sam.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.normalize_miri_seller_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller public.seller_accounts%ROWTYPE;
BEGIN
  IF NEW.order_type = 'MIRI_INBOUND_PICKUP' AND NEW.tomu_seller_account_id IS NOT NULL THEN
    SELECT sa.*
    INTO v_seller
    FROM public.seller_accounts sa
    WHERE sa.id::text = btrim(NEW.tomu_seller_account_id)
       OR sa.account_code = btrim(NEW.tomu_seller_account_id)
    LIMIT 1;

    IF v_seller.id IS NULL THEN
      RAISE EXCEPTION 'Unknown Tomu seller account';
    END IF;

    NEW.tomu_seller_account_id := v_seller.id::text;
    NEW.tomu_seller_account_code := v_seller.account_code;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_miri_seller_identity_trigger ON public.orders;
CREATE TRIGGER normalize_miri_seller_identity_trigger
  BEFORE INSERT OR UPDATE OF order_type, tomu_seller_account_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.normalize_miri_seller_identity();

UPDATE public.orders o
SET tomu_seller_account_id = sa.id::text,
    tomu_seller_account_code = sa.account_code
FROM public.seller_accounts sa
WHERE o.order_type = 'MIRI_INBOUND_PICKUP'
  AND (
    o.tomu_seller_account_id = sa.id::text
    OR o.tomu_seller_account_id = sa.account_code
  );

CREATE INDEX IF NOT EXISTS orders_miri_tomu_seller_code_idx
  ON public.orders(tomu_seller_account_code)
  WHERE order_type = 'MIRI_INBOUND_PICKUP';

CREATE OR REPLACE FUNCTION public.miri_pickup_order_response(
  p_order_id uuid,
  p_duplicate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'success', true,
    'duplicate', p_duplicate,
    'tomu_order_id', o.order_code,
    'tomu_order_uuid', o.id,
    'tomu_seller_account_id', o.tomu_seller_account_id,
    'tomu_account_code', o.tomu_seller_account_code,
    'status', CASE
      WHEN o.runner_status::text = 'DELIVERED' THEN 'DELIVERED'
      WHEN o.status::text = 'CANCELLED' THEN 'CANCELLED'
      ELSE 'ASSIGNED_AWAITING_DELIVERY'
    END,
    'area_code', o.area,
    'settlement_base', to_char(o.settlement_base_amount, 'FM999999990.00'),
    'actual_pickup_charge', to_char(o.actual_pickup_charge, 'FM999999990.00'),
    'internal_offset', to_char(o.internal_settlement_offset, 'FM999999990.00'),
    'net_runner_payable', to_char(o.runner_payable_amount, 'FM999999990.00'),
    'net_seller_charge', to_char(o.seller_charge_amount, 'FM999999990.00'),
    'content_status', o.content_verification_status
  )
  FROM public.orders o
  WHERE o.id = p_order_id;
$$;
