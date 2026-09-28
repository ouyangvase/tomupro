-- Partial customer payments.
-- total_amount remains the order's sales value.  Confirmed customer transfers
-- live in order_payments. cod_amount retains the payment plan balance;
-- collectible COD is total less confirmed transfers. Existing driver_* columns remain the Driver's final
-- delivery collection report and are not reused for customer prepayments.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cod_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_plan text NOT NULL DEFAULT 'COD',
  ADD COLUMN IF NOT EXISTS payment_history_unverified boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_plan_valid'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_plan_valid
      CHECK (payment_plan IN ('COD', 'PARTIAL_TRANSFER_COD', 'TRANSFER')) NOT VALID;
  END IF;
END;
$$;

UPDATE public.orders
SET payment_plan = CASE
  WHEN payment_method::text = 'TRANSFER' THEN 'TRANSFER'
  ELSE 'COD'
END
WHERE payment_plan IS NULL OR payment_plan = 'COD' AND payment_method::text = 'TRANSFER';


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_cod_amount_within_total'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_cod_amount_within_total
      CHECK (cod_amount >= 0 AND cod_amount <= total_amount) NOT VALID;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_type text NOT NULL CHECK (payment_type IN ('TRANSFER', 'COD')),
  source text NOT NULL DEFAULT 'CUSTOMER_PREPAYMENT'
    CHECK (source IN ('CUSTOMER_PREPAYMENT', 'DRIVER_COLLECTION', 'MIGRATION')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'VOIDED')),
  receipt_url text,
  receipt_status text CHECK (receipt_status IS NULL OR receipt_status IN ('pending', 'confirmed', 'rejected')),
  reference text,
  recorded_by uuid REFERENCES public.profiles(id),
  confirmed_by uuid REFERENCES public.profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_payments_one_current_source UNIQUE (order_id, payment_type, source)
);

CREATE INDEX IF NOT EXISTS idx_order_payments_order_status
  ON public.order_payments(order_id, status, payment_type);

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_payments FROM anon, authenticated;
GRANT ALL ON public.order_payments TO service_role;
CREATE UNIQUE INDEX order_payments_one_active_transfer
  ON public.order_payments(order_id)
  WHERE payment_type = 'TRANSFER' AND source IN ('CUSTOMER_PREPAYMENT', 'MIGRATION') AND status <> 'VOIDED';

-- Payment rows are exposed through scoped RPCs only.  In particular, a user
-- must not be able to read another user's receipts by guessing an order id.
DROP POLICY IF EXISTS "No direct order payment reads" ON public.order_payments;
DROP POLICY IF EXISTS "No direct order payment writes" ON public.order_payments;

CREATE TABLE IF NOT EXISTS public.order_payment_migration_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  classification text NOT NULL,
  legacy_payment_method text,
  legacy_receipt_status text,
  legacy_receipt_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

ALTER TABLE public.order_payment_migration_report ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_payment_migration_report FROM anon, authenticated;
GRANT SELECT ON public.order_payment_migration_report TO authenticated;
CREATE POLICY payment_migration_admin_read ON public.order_payment_migration_report
  FOR SELECT TO authenticated USING (public.get_user_role(auth.uid())::text = 'admin');

-- Historical COD orders have always represented the full amount as COD due.
-- Confirmed legacy transfer receipts are migrated as confirmed customer
-- transfers.  Pending/missing transfer evidence is reported for review and is
-- deliberately not guessed as paid.
UPDATE public.orders
SET cod_amount = CASE
  WHEN payment_method::text = 'COD' THEN GREATEST(total_amount, 0)
  ELSE 0
END
WHERE payment_plan IN ('COD', 'TRANSFER');

INSERT INTO public.order_payments (
  order_id, payment_type, source, amount, status, receipt_url,
  receipt_status, confirmed_at, created_at, updated_at
)
SELECT
  o.id,
  'TRANSFER',
  'CUSTOMER_PREPAYMENT',
  GREATEST(o.total_amount, 0),
  'CONFIRMED',
  o.receipt_url,
  'confirmed',
  COALESCE(o.receipt_confirmed_at, o.updated_at),
  o.created_at,
  o.updated_at
FROM public.orders o
WHERE o.payment_method::text = 'TRANSFER'
  AND o.receipt_status = 'confirmed'
  AND NULLIF(o.receipt_url, '') IS NOT NULL
ON CONFLICT (order_id, payment_type, source) DO UPDATE
SET amount = EXCLUDED.amount,
    status = EXCLUDED.status,
    receipt_url = EXCLUDED.receipt_url,
    receipt_status = EXCLUDED.receipt_status,
    confirmed_at = EXCLUDED.confirmed_at,
    updated_at = now();

INSERT INTO public.order_payment_migration_report (
  order_id, classification, legacy_payment_method, legacy_receipt_status,
  legacy_receipt_url, notes
)
SELECT
  o.id,
  CASE
    WHEN o.payment_method::text = 'TRANSFER'
      AND o.receipt_status = 'confirmed'
      AND NULLIF(o.receipt_url, '') IS NOT NULL
      THEN 'TRANSFER_MIGRATED_CONFIRMED'
    WHEN o.payment_method::text = 'TRANSFER'
      THEN 'TRANSFER_NEEDS_REVIEW'
    ELSE 'COD_MIGRATED'
  END,
  o.payment_method::text,
  o.receipt_status,
  o.receipt_url,
  CASE
    WHEN o.payment_method::text = 'TRANSFER'
      AND o.receipt_status = 'confirmed'
      AND NULLIF(o.receipt_url, '') IS NOT NULL
      THEN 'Migrated from the existing confirmed receipt.'
    WHEN o.payment_method::text = 'TRANSFER'
      THEN 'Existing transfer record has no confirmed receipt evidence; no paid amount was guessed.'
    ELSE 'Legacy COD order; total amount retained as COD due.'
  END
FROM public.orders o
ON CONFLICT (order_id) DO NOTHING;

-- Retain unconfirmed legacy receipts as pending evidence, never as paid money.
INSERT INTO public.order_payments(order_id, payment_type, source, amount, status, receipt_url, receipt_status)
SELECT id, 'TRANSFER', 'CUSTOMER_PREPAYMENT', GREATEST(total_amount, 0),
  CASE WHEN receipt_status = 'rejected' THEN 'REJECTED' ELSE 'PENDING' END,
  receipt_url, CASE WHEN receipt_status = 'rejected' THEN 'rejected' ELSE 'pending' END
FROM public.orders WHERE payment_method::text = 'TRANSFER'
ON CONFLICT (order_id, payment_type, source) DO NOTHING;

-- Closed legacy orders must never become collectible again merely because old
-- payment evidence is incomplete. Keep that uncertainty visible for Finance;
-- do not invent a cash or transfer payment from a historical COD number.
UPDATE public.orders o SET payment_history_unverified = true
WHERE (o.runner_status::text = 'DELIVERED' OR o.reconciliation_status::text = 'SETTLED')
  AND COALESCE(o.driver_cash_amount, 0) + COALESCE(o.driver_transfer_amount, 0)
    + COALESCE((SELECT sum(p.amount) FROM public.order_payments p WHERE p.order_id = o.id AND p.status = 'CONFIRMED'), 0) < o.total_amount;
UPDATE public.order_payment_migration_report r
SET classification = 'CLOSED_PAYMENT_NEEDS_REVIEW',
    notes = 'Closed legacy order: retain closed status and do not collect again. Available payment evidence does not reconcile the total.'
FROM public.orders o WHERE o.id = r.order_id AND o.payment_history_unverified;

CREATE OR REPLACE FUNCTION private.order_transfer_paid_amount(p_order_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount) FILTER (
    WHERE payment_type = 'TRANSFER'
      AND source = 'CUSTOMER_PREPAYMENT'
      AND status = 'CONFIRMED'
  ), 0)::numeric
  FROM public.order_payments
  WHERE order_id = p_order_id;
$$;

CREATE OR REPLACE FUNCTION private.order_cod_due_amount(p_order_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN o.payment_history_unverified THEN 0
    WHEN o.payment_plan = 'COD' THEN GREATEST(o.cod_amount, 0)
    ELSE GREATEST(COALESCE(o.total_amount, 0) - private.order_transfer_paid_amount(o.id), 0) END::numeric
  FROM public.orders o
  WHERE o.id = p_order_id;
$$;

CREATE OR REPLACE FUNCTION public.get_order_payment_summary(p_order_id uuid)
RETURNS TABLE (
  order_id uuid,
  total_amount numeric,
  transfer_paid_amount numeric,
  cod_due_amount numeric,
  driver_cash_collected numeric,
  driver_transfer_collected numeric,
  total_collected numeric,
  outstanding_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    COALESCE(o.total_amount, 0)::numeric,
    private.order_transfer_paid_amount(o.id),
    private.order_cod_due_amount(o.id),
    LEAST(o.cod_amount, GREATEST(COALESCE(o.driver_cash_amount, 0), 0))::numeric,
    LEAST(GREATEST(o.cod_amount - COALESCE(o.driver_cash_amount, 0), 0), GREATEST(COALESCE(o.driver_transfer_amount, 0), 0))::numeric,
    LEAST(
      COALESCE(o.total_amount, 0),
      private.order_transfer_paid_amount(o.id)
        + LEAST(o.cod_amount, GREATEST(COALESCE(o.driver_cash_amount, 0), 0) + GREATEST(COALESCE(o.driver_transfer_amount, 0), 0))
    )::numeric,
    CASE WHEN o.payment_history_unverified THEN NULL ELSE GREATEST(
      COALESCE(o.total_amount, 0)
      - private.order_transfer_paid_amount(o.id)
      - LEAST(o.cod_amount, GREATEST(COALESCE(o.driver_cash_amount, 0), 0) + GREATEST(COALESCE(o.driver_transfer_amount, 0), 0)),
      0
    ) END::numeric
  FROM public.orders o
  WHERE o.id = p_order_id
    AND (
      public.get_user_role(auth.uid())::text = 'admin'
      OR o.salesperson_id = auth.uid()
      OR o.runner_id = auth.uid()
      OR o.driver_id = auth.uid()
      OR public.has_runner_assistant_permission(auth.uid(), o.runner_id, 'deliver')
      OR public.has_runner_assistant_permission(auth.uid(), o.runner_id, 'confirm_receipt')
      OR (public.get_user_role(auth.uid())::text = 'manager' AND o.salesperson_id = ANY(public.get_visible_owner_ids()))
    );
$$;

REVOKE ALL ON FUNCTION public.get_order_payment_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_payment_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_unauthorized_payment_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.payment_method IS DISTINCT FROM OLD.payment_method
      OR NEW.payment_plan IS DISTINCT FROM OLD.payment_plan
      OR NEW.cod_amount IS DISTINCT FROM OLD.cod_amount
      OR NEW.receipt_url IS DISTINCT FROM OLD.receipt_url
      OR NEW.receipt_status IS DISTINCT FROM OLD.receipt_status
      OR NEW.payment_history_unverified IS DISTINCT FROM OLD.payment_history_unverified)
     AND current_setting('tomupro.payment_update_authorized', true) IS DISTINCT FROM 'true'
     AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Payment changes must use the payment update workflow';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_payment_edit_guard ON public.orders;
CREATE TRIGGER orders_payment_edit_guard
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_unauthorized_payment_edit();

-- Enforce delivery gates for every caller, including direct Driver updates and
-- Runner review RPCs. Locking the order also serializes receipt confirmation.
CREATE OR REPLACE FUNCTION public.check_order_payment_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.payment_history_unverified := false;
    IF NEW.payment_plan = 'PARTIAL_TRANSFER_COD'
       AND current_setting('tomupro.payment_update_authorized', true) IS DISTINCT FROM 'true'
       AND COALESCE(auth.role(), '') <> 'service_role' THEN
      RAISE EXCEPTION 'Create partial payments through the payment workflow';
    END IF;
    IF NEW.payment_method::text = 'TRANSFER' AND NEW.payment_plan = 'COD' THEN
      NEW.payment_plan := 'TRANSFER';
    END IF;
    IF NEW.payment_plan = 'COD' THEN NEW.cod_amount := NEW.total_amount; END IF;
    IF NEW.payment_plan = 'TRANSFER' THEN NEW.cod_amount := 0; END IF;
    IF NEW.payment_plan = 'PARTIAL_TRANSFER_COD' AND (NEW.receipt_url IS NULL OR NEW.receipt_url !~ '^https://[^/[:space:]]+') THEN
      RAISE EXCEPTION 'An HTTPS receipt is required for every transfer portion';
    END IF;
    IF NEW.payment_plan = 'PARTIAL_TRANSFER_COD' AND (NEW.cod_amount <= 0 OR NEW.cod_amount >= NEW.total_amount) THEN
      RAISE EXCEPTION 'Partial COD balance must be between zero and the order total';
    END IF;
    -- A caller may submit evidence, but only the confirmation workflow can accept it.
    IF NEW.payment_plan <> 'COD' THEN NEW.receipt_status := 'pending'; END IF;
  ELSE
    IF NEW.total_amount IS DISTINCT FROM OLD.total_amount
       AND current_setting('tomupro.payment_update_authorized', true) IS DISTINCT FROM 'true' THEN
      IF OLD.payment_plan <> 'COD' OR OLD.driver_status::text = 'DRIVER_DELIVERED'
         OR OLD.runner_status::text = 'DELIVERED' THEN
        RAISE EXCEPTION 'Change the order total through the payment update workflow';
      END IF;
      NEW.cod_amount := NEW.total_amount;
    END IF;
    IF (NEW.driver_status::text = 'DRIVER_DELIVERED' AND NEW.driver_status IS DISTINCT FROM OLD.driver_status)
       OR (NEW.runner_status::text = 'DELIVERED' AND NEW.runner_status IS DISTINCT FROM OLD.runner_status) THEN
      IF NEW.payment_plan <> 'COD' AND (
        NEW.receipt_status IS DISTINCT FROM 'confirmed'
        OR private.order_transfer_paid_amount(NEW.id) <> NEW.total_amount - NEW.cod_amount
      ) THEN
        RAISE EXCEPTION 'Receipt must be confirmed before delivery for transfer payments';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER orders_z_payment_state BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.check_order_payment_state();

CREATE OR REPLACE FUNCTION public.initialize_order_transfer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.payment_plan <> 'COD' THEN
    INSERT INTO public.order_payments(order_id, payment_type, source, amount, receipt_url, receipt_status, recorded_by)
    VALUES (NEW.id, 'TRANSFER', 'CUSTOMER_PREPAYMENT', NEW.total_amount - NEW.cod_amount, NEW.receipt_url, 'pending', auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER orders_initialize_transfer AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.initialize_order_transfer();

CREATE OR REPLACE FUNCTION public.prevent_driver_payment_overcollection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cod_due numeric;
BEGIN
  IF NEW.driver_cash_amount IS DISTINCT FROM OLD.driver_cash_amount
     OR NEW.driver_transfer_amount IS DISTINCT FROM OLD.driver_transfer_amount
     OR NEW.driver_payment_method IS DISTINCT FROM OLD.driver_payment_method THEN
    IF OLD.runner_accept_status::text = 'ACCEPTED' OR OLD.runner_review_status = 'REVIEWED' AND OLD.runner_status::text = 'DELIVERED' THEN
      RAISE EXCEPTION 'Accepted collections require a finance correction';
    END IF;
    IF COALESCE(NEW.driver_cash_amount, 0) < 0
       OR COALESCE(NEW.driver_transfer_amount, 0) < 0 THEN
      RAISE EXCEPTION 'Driver payment amounts cannot be negative';
    END IF;
    v_cod_due := NEW.cod_amount;
    IF COALESCE(NEW.driver_cash_amount, 0) + COALESCE(NEW.driver_transfer_amount, 0) > v_cod_due THEN
      RAISE EXCEPTION 'Driver payment cannot exceed COD due amount';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_driver_payment_guard ON public.orders;
CREATE TRIGGER orders_driver_payment_guard
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_driver_payment_overcollection();

CREATE OR REPLACE FUNCTION public.set_order_payment_plan(
  p_order_id uuid,
  p_payment_plan text,
  p_transfer_amount numeric,
  p_receipt_url text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_total_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text := public.get_user_role(v_actor)::text;
  v_order public.orders%ROWTYPE;
  v_total numeric;
  v_transfer numeric;
  v_cod numeric;
  v_receipt_url text;
  v_receipt_status text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.payment_history_unverified THEN RAISE EXCEPTION 'Legacy payment history requires Finance review'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'manager', 'salesperson')
     OR (v_role <> 'admin' AND v_order.salesperson_id IS DISTINCT FROM v_actor
       AND NOT (v_role = 'manager' AND public.is_in_manager_team(v_order.salesperson_id, v_actor))) THEN
    RAISE EXCEPTION 'Payment update is not authorized';
  END IF;
  IF p_payment_plan IS NULL OR p_payment_plan NOT IN ('COD', 'PARTIAL_TRANSFER_COD', 'TRANSFER') THEN
    RAISE EXCEPTION 'Invalid payment plan';
  END IF;

  v_total := COALESCE(p_total_amount, v_order.total_amount, 0);
  IF v_total < 0 OR v_total::text IN ('NaN', 'Infinity', '-Infinity') OR v_total <> round(v_total, 2) THEN
    RAISE EXCEPTION 'Invalid order total';
  END IF;
  IF p_transfer_amount IS NULL OR p_transfer_amount < 0 OR p_transfer_amount > v_total
     OR p_transfer_amount::text IN ('NaN', 'Infinity', '-Infinity') OR p_transfer_amount <> round(p_transfer_amount, 2) THEN
    RAISE EXCEPTION 'Invalid BND transfer amount';
  END IF;
  v_transfer := CASE
    WHEN p_payment_plan = 'COD' THEN 0
    WHEN p_payment_plan = 'TRANSFER' THEN v_total
    ELSE COALESCE(p_transfer_amount, 0)
  END;
  IF v_transfer < 0 OR v_transfer > v_total OR v_transfer::text IN ('NaN', 'Infinity', '-Infinity') OR v_transfer <> round(v_transfer, 2) THEN
    RAISE EXCEPTION 'Transfer amount must be between 0 and the order total';
  END IF;
  p_payment_plan := CASE WHEN v_transfer = 0 THEN 'COD' WHEN v_transfer = v_total THEN 'TRANSFER' ELSE 'PARTIAL_TRANSFER_COD' END;

  v_cod := v_total - v_transfer;
  v_receipt_url := CASE
    WHEN v_transfer = 0 THEN NULL
    ELSE COALESCE(NULLIF(p_receipt_url, ''), v_order.receipt_url)
  END;
  v_receipt_status := CASE WHEN v_transfer > 0 AND v_receipt_url IS NOT NULL THEN 'pending' ELSE NULL END;

  IF v_transfer > 0 AND (v_receipt_url IS NULL OR v_receipt_url !~ '^https://[^/[:space:]]+') THEN
    RAISE EXCEPTION 'An HTTPS receipt is required for every transfer portion';
  END IF;
  -- Retrying an unchanged plan must not reopen a confirmed receipt.
  IF v_order.payment_plan = p_payment_plan AND v_order.total_amount = v_total
     AND v_order.cod_amount = v_cod AND v_order.receipt_url IS NOT DISTINCT FROM v_receipt_url
     AND (v_transfer = 0 OR EXISTS (
       SELECT 1 FROM public.order_payments WHERE order_id = p_order_id
         AND source = 'CUSTOMER_PREPAYMENT' AND payment_type = 'TRANSFER' AND amount = v_transfer
     )) THEN
    RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
  END IF;
  IF v_order.runner_status::text = 'DELIVERED' OR v_order.driver_status::text = 'DRIVER_DELIVERED'
     OR COALESCE(v_order.driver_cash_amount, 0) + COALESCE(v_order.driver_transfer_amount, 0) > 0 THEN
    RAISE EXCEPTION 'Payment cannot be changed after collection or delivery';
  END IF;
  -- Transfers can be recorded after assignment, before collection. The order
  -- lock serializes this change with Driver submission and receipt approval.
  IF EXISTS (SELECT 1 FROM public.order_payments WHERE order_id = p_order_id AND status = 'CONFIRMED') THEN
    RAISE EXCEPTION 'Confirmed payments cannot be overwritten; a finance correction is required';
  END IF;

  PERFORM set_config('tomupro.payment_update_authorized', 'true', true);
  UPDATE public.orders
  SET total_amount = v_total,
      payment_plan = p_payment_plan,
      payment_method = CASE WHEN p_payment_plan = 'TRANSFER' THEN 'TRANSFER'::public.payment_method ELSE 'COD'::public.payment_method END,
      cod_amount = round(v_cod, 2),
      receipt_url = v_receipt_url,
      receipt_status = v_receipt_status,
      receipt_confirmed_by = NULL,
      receipt_confirmed_at = NULL,
      receipt_rejected_reason = NULL,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_payments (
    order_id, payment_type, source, amount, status, receipt_url,
    receipt_status, recorded_by, updated_at
  )
  VALUES (
    p_order_id, 'TRANSFER', 'CUSTOMER_PREPAYMENT', round(v_transfer, 2),
    CASE WHEN v_transfer = 0 THEN 'VOIDED' ELSE 'PENDING' END,
    v_receipt_url, v_receipt_status, v_actor, now()
  )
  ON CONFLICT (order_id, payment_type, source) DO UPDATE
  SET amount = EXCLUDED.amount,
      status = CASE WHEN EXCLUDED.amount = 0 THEN 'VOIDED' ELSE 'PENDING' END,
      receipt_url = EXCLUDED.receipt_url,
      receipt_status = EXCLUDED.receipt_status,
      recorded_by = EXCLUDED.recorded_by,
      confirmed_by = NULL,
      confirmed_at = NULL,
      updated_at = now();

  IF v_transfer = 0 THEN
    UPDATE public.order_payments
    SET status = 'VOIDED', receipt_url = NULL, receipt_status = NULL, updated_at = now()
    WHERE order_id = p_order_id AND payment_type = 'TRANSFER' AND source = 'CUSTOMER_PREPAYMENT';
  END IF;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
  VALUES (
    'order', p_order_id, 'ORDER_PAYMENT_PLAN_UPDATED', v_actor,
    jsonb_build_object(
      'total_amount', v_order.total_amount,
      'transfer_amount', v_order.total_amount - v_order.cod_amount,
      'payment_method', v_order.payment_method,
      'payment_plan', v_order.payment_plan,
      'cod_amount', v_order.cod_amount,
      'receipt_url', v_order.receipt_url,
      'receipt_status', v_order.receipt_status
    ),
    jsonb_build_object(
      'total_amount', v_total,
      'payment_plan', p_payment_plan,
      'transfer_amount', round(v_transfer, 2),
      'cod_due_amount', round(v_cod, 2),
      'receipt_url', v_receipt_url,
      'receipt_status', v_receipt_status,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'payment_plan', p_payment_plan,
    'transfer_amount', round(v_transfer, 2),
    'cod_due_amount', round(v_cod, 2),
    'receipt_status', v_receipt_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_payment_plan(uuid, text, numeric, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_payment_plan(uuid, text, numeric, text, text, numeric) TO authenticated;

-- Keep the existing receipt workflow, but make it work for both full transfer
-- and partial transfer plans.
CREATE OR REPLACE FUNCTION public.confirm_order_receipt(p_order_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.order_payments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_actor_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid actor');
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  SELECT * INTO v_payment
  FROM public.order_payments
  WHERE order_id = p_order_id AND payment_type = 'TRANSFER' AND source = 'CUSTOMER_PREPAYMENT';
  IF v_order.id IS NULL OR v_payment.id IS NULL OR v_payment.amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer payment not found');
  END IF;
  IF v_order.runner_id IS DISTINCT FROM p_actor_id
     AND NOT public.has_runner_assistant_permission(p_actor_id, v_order.runner_id, 'confirm_receipt')
     AND COALESCE(public.get_user_role(p_actor_id)::text, '') <> 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receipt confirmation access required');
  END IF;
  IF v_payment.receipt_url IS NULL OR v_payment.receipt_url !~ '^https://[^/[:space:]]+' THEN
    RETURN jsonb_build_object('success', false, 'error', 'An HTTPS transfer receipt is required');
  END IF;
  IF v_payment.status = 'CONFIRMED' THEN RETURN jsonb_build_object('success', true); END IF;
  IF v_payment.status = 'REJECTED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receipt has already been rejected');
  END IF;

  UPDATE public.order_payments
  SET status = 'CONFIRMED', receipt_status = 'confirmed', confirmed_by = p_actor_id,
      confirmed_at = now(), updated_at = now()
  WHERE id = v_payment.id;
  PERFORM set_config('tomupro.payment_update_authorized', 'true', true);
  UPDATE public.orders
  SET receipt_status = 'confirmed', receipt_confirmed_by = p_actor_id,
      receipt_confirmed_at = now(), receipt_rejected_reason = NULL,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
  VALUES ('order', p_order_id, 'receipt_confirmed', p_actor_id,
    jsonb_build_object('receipt_status', v_order.receipt_status, 'transfer_amount', v_payment.amount),
    jsonb_build_object('receipt_status', 'confirmed', 'transfer_amount', v_payment.amount));
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_order_receipt(
  p_order_id uuid, p_actor_id uuid, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.order_payments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_actor_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid actor');
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  SELECT * INTO v_payment FROM public.order_payments
  WHERE order_id = p_order_id AND payment_type = 'TRANSFER' AND source = 'CUSTOMER_PREPAYMENT';
  IF v_order.id IS NULL OR v_payment.id IS NULL OR v_payment.amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer payment not found');
  END IF;
  IF v_order.runner_id IS DISTINCT FROM p_actor_id
     AND NOT public.has_runner_assistant_permission(p_actor_id, v_order.runner_id, 'confirm_receipt')
     AND COALESCE(public.get_user_role(p_actor_id)::text, '') <> 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receipt confirmation access required');
  END IF;
  IF v_payment.status = 'CONFIRMED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receipt has already been accepted');
  END IF;

  UPDATE public.order_payments
  SET status = 'REJECTED', receipt_status = 'rejected', updated_at = now()
  WHERE id = v_payment.id;
  PERFORM set_config('tomupro.payment_update_authorized', 'true', true);
  UPDATE public.orders
  SET receipt_status = 'rejected', receipt_rejected_reason = p_reason, updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
  VALUES ('order', p_order_id, 'receipt_rejected', p_actor_id,
    jsonb_build_object('receipt_status', v_order.receipt_status, 'transfer_amount', v_payment.amount),
    jsonb_build_object('receipt_status', 'rejected', 'receipt_rejected_reason', p_reason));
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Preserve the installed Runner delivery function, including Miri handling.
-- The orders_z_payment_state trigger enforces the additional ledger gate.

REVOKE ALL ON FUNCTION public.mark_order_delivered_fast(uuid, uuid), public.confirm_order_receipt(uuid, uuid), public.reject_order_receipt(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_order_delivered_fast(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_order_receipt(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_order_receipt(uuid, uuid, text) TO authenticated;

-- Delivered reports keep total_amount as sales value and expose the payment
-- breakdown needed by Runner/Finance without inferring Driver collection from
-- the ordinary order payment method.
DROP FUNCTION IF EXISTS public.get_runner_assistant_delivered_orders(uuid, uuid, uuid[], integer, integer);
DROP FUNCTION IF EXISTS public.get_delivered_orders_fast(uuid, uuid, uuid[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_delivered_orders_fast(
  p_runner_id uuid DEFAULT NULL,
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
  payment_plan text,
  payment_history_unverified boolean,
  cod_amount numeric,
  transfer_paid_amount numeric,
  cod_due_amount numeric,
  receipt_url text,
  receipt_status text,
  driver_payment_method text,
  driver_cash_amount numeric,
  driver_transfer_amount numeric,
  status text,
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
  items_json jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id, o.order_code, o.order_date, o.customer_name, o.phone, o.area, o.address,
    o.total_amount, o.total_qty, o.payment_method::text, o.payment_plan, o.payment_history_unverified,
    o.cod_amount, private.order_transfer_paid_amount(o.id), private.order_cod_due_amount(o.id),
    o.receipt_url, o.receipt_status, o.driver_payment_method,
    o.driver_cash_amount, o.driver_transfer_amount, o.status::text,
    o.runner_status::text, o.reconciliation_status::text, o.delivered_at,
    o.salesperson_id, sp.display_name, o.runner_id, rn.display_name,
    o.driver_id, dr.display_name,
    COALESCE((
      SELECT string_agg(COALESCE(p.sku_code, oi.sku_label, 'Item') || ' x' || oi.qty::text, ', ')
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id
    ), 'No items'),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', oi.id, 'product_id', oi.product_id, 'sku_code', p.sku_code,
        'sku_name', p.sku_name, 'sku_label', oi.sku_label, 'qty', oi.qty,
        'price', oi.price, 'line_total', oi.line_total
      ))
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id
    ), '[]'::jsonb)
  FROM public.orders o
  LEFT JOIN public.profiles sp ON sp.id = o.salesperson_id
  LEFT JOIN public.profiles rn ON rn.id = o.runner_id
  LEFT JOIN public.profiles dr ON dr.id = o.driver_id
  WHERE COALESCE(to_jsonb(o)->>'current_operational_state', o.runner_status::text) = 'DELIVERED'
    AND COALESCE(to_jsonb(o)->>'order_type', 'STANDARD') <> 'MIRI_INBOUND_PICKUP'
    AND o.status <> 'CANCELLED'
    AND auth.uid() IS NOT NULL
    AND (
      public.get_user_role(auth.uid())::text IN ('admin', 'finance_viewer')
      OR o.salesperson_id = auth.uid() OR o.runner_id = auth.uid() OR o.driver_id = auth.uid()
      OR public.has_runner_assistant_permission(auth.uid(), o.runner_id, 'deliver')
      OR (public.get_user_role(auth.uid())::text = 'manager' AND o.salesperson_id = ANY(public.get_visible_owner_ids()))
      OR EXISTS (SELECT 1 FROM public.user_data_shares s WHERE s.viewer_user_id = auth.uid()
        AND s.subject_user_id = o.salesperson_id AND s.active AND s.scope_orders)
    )
    AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
    AND (p_salesperson_id IS NULL OR o.salesperson_id = p_salesperson_id)
    AND (p_salesperson_ids IS NULL OR o.salesperson_id = ANY(p_salesperson_ids))
  ORDER BY o.delivered_at DESC NULLS LAST, o.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_runner_assistant_delivered_orders(
  p_runner_id uuid,
  p_salesperson_id uuid DEFAULT NULL,
  p_salesperson_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, order_code text, order_date date, customer_name text, phone text,
  area text, address text, total_amount numeric, total_qty integer,
  payment_method text, payment_plan text, payment_history_unverified boolean, cod_amount numeric,
  transfer_paid_amount numeric, cod_due_amount numeric, receipt_url text,
  receipt_status text, driver_payment_method text, driver_cash_amount numeric,
  driver_transfer_amount numeric, status text, runner_status text,
  reconciliation_status text, delivered_at timestamptz, salesperson_id uuid,
  salesperson_name text, runner_id uuid, runner_name text, driver_id uuid,
  driver_name text, items_summary text, items_json jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT (auth.uid() = p_runner_id OR public.has_runner_assistant_permission(auth.uid(), p_runner_id, 'deliver')) THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM public.get_delivered_orders_fast(
    p_runner_id, p_salesperson_id, p_salesperson_ids, p_limit, p_offset
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_delivered_orders_fast(uuid, uuid, uuid[], integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_delivered_orders_fast(uuid, uuid, uuid[], integer, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_runner_assistant_delivered_orders(uuid, uuid, uuid[], integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_runner_assistant_delivered_orders(uuid, uuid, uuid[], integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION private.get_driver_analytics_cohort(
  p_driver_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS TABLE (
  order_id uuid,
  driver_id uuid,
  runner_id uuid,
  effective_assignment_date date,
  assignment_timestamp timestamptz,
  assignment_source text,
  assignment_batch_id uuid,
  reassigned boolean,
  order_amount numeric,
  payment_method text,
  driver_payment_method text,
  assignment_state text,
  accepted_delivery boolean,
  accepted_failed boolean,
  pending_acceptance boolean,
  cash_collected_amount numeric,
  transfer_amount numeric,
  cash_pending_amount numeric,
  cash_settlement_status text,
  driver_status text,
  runner_status text,
  runner_accept_status text,
  driver_submitted_at timestamptz,
  runner_accepted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH assigned_orders AS (
    SELECT
      o.*,
      batch.created_at AS assignment_batch_created_at,
      assignment_audit.created_at AS assignment_audit_at,
      COALESCE(
        private.driver_analytics_assignment_date(
          o.driver_assigned_at,
          batch.created_at,
          assignment_audit.created_at
        ),
        public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date)
      ) AS effective_assignment_date,
      COALESCE(o.driver_assigned_at, batch.created_at, assignment_audit.created_at, o.created_at) AS assignment_timestamp,
      CASE
        WHEN o.driver_assigned_at IS NOT NULL THEN 'driver_assigned_at'
        WHEN batch.created_at IS NOT NULL THEN 'driver_assignment_batch'
        WHEN assignment_audit.created_at IS NOT NULL THEN 'assignment_audit'
        ELSE 'order_operational_date_fallback'
      END AS assignment_source,
      o.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
        AND COALESCE(o.runner_accept_status::text, 'PENDING') <> 'ACCEPTED'
        AND COALESCE(o.runner_review_status::text, 'NOT_REVIEWED') <> 'REVIEWED'
        AND COALESCE(o.runner_status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
        AND COALESCE(o.operational_status::text, '') NOT IN ('DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
        AND COALESCE(o.salesperson_action_required, false) IS NOT TRUE
        AND COALESCE(o.runner_review_status::text, '') <> 'ACTION_REQUIRED'
        AND COALESCE(o.runner_final_outcome::text, '') <> 'NEED_SALESPERSON_FOLLOWUP'
        AS is_pending_acceptance,
      o.driver_status::text = 'DRIVER_DELIVERED'
        AND COALESCE(o.runner_accept_status::text, '') = 'ACCEPTED'
        AND COALESCE(o.runner_status::text, '') = 'DELIVERED'
        AS is_accepted_delivery,
      o.driver_status::text = 'DRIVER_FAILED'
        AND COALESCE(o.runner_accept_status::text, '') = 'ACCEPTED'
        AND COALESCE(o.runner_status::text, '') = 'FAILED_DELIVERY'
        AS is_accepted_failed,
      o.runner_final_outcome::text = 'RESCHEDULE'
        AND COALESCE(o.runner_review_status::text, '') = 'REVIEWED'
        AS is_rescheduled
    FROM public.orders o
    LEFT JOIN public.driver_assignment_batches batch
      ON batch.id = o.driver_assignment_batch_id
    LEFT JOIN LATERAL (
      SELECT audit.created_at
      FROM public.audit_logs audit
      WHERE audit.entity_type = 'order'
        AND audit.entity_id = o.id
        AND audit.action IN (
          'DRIVER_ASSIGNED',
          'DRIVER_REASSIGNED',
          'ORDER_ASSIGNED_TO_DRIVER'
        )
      ORDER BY audit.created_at DESC, audit.id DESC
      LIMIT 1
    ) assignment_audit ON true
    WHERE o.driver_id = p_driver_id
      AND COALESCE(o.status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND COALESCE(o.runner_status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND COALESCE(o.delivery_area_code, '') NOT IN ('SELF_PICKUP', 'CANCELLED')
      AND upper(COALESCE(o.order_source, 'SALESPERSON')) NOT IN ('TEST', 'DEMO')
      AND (
        p_date_from IS NULL
        OR COALESCE(
          private.driver_analytics_assignment_date(
            o.driver_assigned_at,
            batch.created_at,
            assignment_audit.created_at
          ),
          public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date)
        ) >= p_date_from
      )
      AND (
        p_date_to IS NULL
        OR COALESCE(
          private.driver_analytics_assignment_date(
            o.driver_assigned_at,
            batch.created_at,
            assignment_audit.created_at
          ),
          public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date)
        ) <= p_date_to
      )
  ), financials AS (
    SELECT
      assigned_orders.*,
      LEAST(assigned_orders.cod_amount, payment.cash_amount) AS reported_cash_amount,
      LEAST(GREATEST(assigned_orders.cod_amount - payment.cash_amount, 0), payment.transfer_amount) AS reported_transfer_amount
    FROM assigned_orders
    CROSS JOIN LATERAL private.driver_analytics_reported_payment_components(
      private.order_cod_due_amount(assigned_orders.id),
      CASE WHEN assigned_orders.payment_plan = 'PARTIAL_TRANSFER_COD' THEN NULL ELSE assigned_orders.payment_method::text END,
      assigned_orders.driver_payment_method,
      assigned_orders.driver_cash_amount,
      assigned_orders.driver_transfer_amount
    ) payment
  ), liabilities AS (
    SELECT
      financials.*,
      COALESCE(liability.open_amount, 0)::numeric AS liability_open_amount,
      COALESCE(liability.has_pending_handover, false) AS liability_has_pending_handover,
      COALESCE(liability.has_settled, false) AS liability_has_settled,
      accepted_audit.created_at AS runner_accepted_audit_at
    FROM financials
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(item.cash_amount) FILTER (
          WHERE item.status IN ('OPEN', 'PENDING_HANDOVER')
        ), 0)::numeric AS open_amount,
        COALESCE(bool_or(item.status = 'PENDING_HANDOVER'), false) AS has_pending_handover,
        COALESCE(bool_or(item.status = 'SETTLED'), false) AS has_settled
      FROM public.cash_liabilities item
      WHERE item.order_id = financials.id
        AND item.driver_id = p_driver_id
    ) liability ON true
    LEFT JOIN LATERAL (
      SELECT audit.created_at
      FROM public.audit_logs audit
      WHERE audit.entity_type = 'order'
        AND audit.entity_id = financials.id
        AND audit.action = 'DRIVER_DELIVERY_ACCEPTED'
      ORDER BY audit.created_at DESC, audit.id DESC
      LIMIT 1
    ) accepted_audit ON true
  )
  SELECT
    liabilities.id,
    liabilities.driver_id,
    liabilities.runner_id,
    liabilities.effective_assignment_date,
    liabilities.assignment_timestamp,
    liabilities.assignment_source,
    liabilities.driver_assignment_batch_id,
    false,
    liabilities.total_amount::numeric,
    liabilities.payment_method::text,
    liabilities.driver_payment_method,
    CASE
      WHEN liabilities.is_pending_acceptance THEN 'PENDING_ACCEPTANCE'
      WHEN liabilities.is_accepted_delivery THEN 'DELIVERED'
      WHEN liabilities.is_accepted_failed THEN 'FAILED'
      WHEN liabilities.is_rescheduled THEN 'RESCHEDULED'
      WHEN liabilities.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY') THEN 'ACTIVE'
      ELSE 'INACTIVE'
    END,
    liabilities.is_accepted_delivery,
    liabilities.is_accepted_failed,
    liabilities.is_pending_acceptance,
    CASE WHEN liabilities.is_accepted_delivery THEN liabilities.reported_cash_amount ELSE 0::numeric END,
    CASE WHEN liabilities.is_accepted_delivery THEN liabilities.reported_transfer_amount ELSE 0::numeric END,
    CASE
      WHEN liabilities.reported_cash_amount <= 0 THEN 0::numeric
      WHEN NOT liabilities.is_accepted_delivery THEN liabilities.reported_cash_amount
      ELSE liabilities.liability_open_amount
    END,
    CASE
      WHEN liabilities.reported_cash_amount <= 0 THEN 'NOT_APPLICABLE'
      WHEN NOT liabilities.is_accepted_delivery THEN 'PENDING_ACCEPTANCE'
      WHEN liabilities.liability_open_amount > 0 AND liabilities.liability_has_pending_handover THEN 'PENDING_HANDOVER'
      WHEN liabilities.liability_open_amount > 0 THEN 'OPEN'
      WHEN liabilities.liability_has_settled THEN 'SETTLED'
      ELSE 'UNKNOWN'
    END,
    liabilities.driver_status::text,
    liabilities.runner_status::text,
    liabilities.runner_accept_status::text,
    COALESCE(liabilities.driver_delivered_at, liabilities.driver_failed_at),
    liabilities.runner_accepted_audit_at
  FROM liabilities
  ORDER BY liabilities.effective_assignment_date, liabilities.id;
$$;
REVOKE ALL ON FUNCTION private.get_driver_analytics_cohort(uuid, date, date) FROM PUBLIC;

-- Keep the installed, audited Driver workflow and change only its collection basis.
DO $$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_definition FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'submit_driver_delivery_result' AND p.pronargs = 10;
  IF v_definition IS NOT NULL THEN
    IF position('WHEN ''CASH'' THEN COALESCE(v_order.total_amount, 0)' IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Unexpected Driver submission function; review collection integration before release';
    END IF;
    v_definition := replace(v_definition, 'COALESCE(v_order.total_amount, 0)',
      'COALESCE(NULLIF(current_setting(''tomupro.collection_total'', true), '''')::numeric, private.order_cod_due_amount(v_order.id))');
    v_definition := replace(v_definition, '''total_amount'', v_order.total_amount,',
      '''total_amount'', v_order.total_amount,
    ''transfer_paid_amount'', private.order_transfer_paid_amount(v_order.id),
    ''cod_due_amount'', private.order_cod_due_amount(v_order.id),
    ''outstanding_amount'', GREATEST(0, private.order_cod_due_amount(v_order.id) - v_collected_cash - v_collected_transfer),');
    EXECUTE v_definition;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_driver_payment_result(
  p_order_id uuid, p_payment_method text, p_cash_amount numeric,
  p_transfer_amount numeric, p_submission_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_result jsonb;
  v_proofs jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role(auth.uid())::text <> 'driver' THEN
    RAISE EXCEPTION 'Only a Driver can submit delivery collection';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.driver_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'This order is not assigned to you';
  END IF;
  IF p_cash_amount IS NULL OR p_transfer_amount IS NULL
    OR p_cash_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_transfer_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_cash_amount < 0 OR p_transfer_amount < 0
    OR round(p_cash_amount, 2) <> p_cash_amount OR round(p_transfer_amount, 2) <> p_transfer_amount
    OR p_cash_amount + p_transfer_amount > private.order_cod_due_amount(p_order_id) THEN
    RAISE EXCEPTION 'The COD balance changed or the collection amount is invalid. Refresh before collecting.';
  END IF;
  IF p_payment_method NOT IN ('CASH', 'TRANSFER', 'CASH_TRANSFER')
    OR (p_payment_method = 'CASH' AND p_transfer_amount <> 0)
    OR (p_payment_method = 'TRANSFER' AND p_cash_amount <> 0) THEN
    RAISE EXCEPTION 'Collection amounts do not match the payment method';
  END IF;
  IF v_order.payment_history_unverified OR
    (v_order.payment_plan <> 'COD' AND v_order.receipt_status IS DISTINCT FROM 'confirmed') THEN
    RAISE EXCEPTION 'Transfer payment must be confirmed before delivery';
  END IF;
  SELECT COALESCE(jsonb_agg(a.url), '[]'::jsonb) INTO v_proofs
    FROM public.attachments a WHERE a.order_id = p_order_id AND a.type::text = 'delivery_photo';
  PERFORM set_config('tomupro.collection_total', (p_cash_amount + p_transfer_amount)::text, true);
  v_result := public.submit_driver_delivery_result(p_order_id, 'DRIVER_DELIVERED_SUBMITTED',
    p_payment_method, p_cash_amount, NULL, NULL, NULL, p_submission_id, v_proofs, 'NEW');
  PERFORM set_config('tomupro.collection_total', '', true);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_driver_payment_result(uuid, text, numeric, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_driver_payment_result(uuid, text, numeric, numeric, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
CREATE OR REPLACE FUNCTION public.get_driver_assignment_source(
  p_runner_id uuid DEFAULT NULL,
  p_driver_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_active_only boolean DEFAULT false,
  p_include_items boolean DEFAULT true
)
RETURNS TABLE (
  order_id uuid,
  order_code text,
  runner_id uuid,
  driver_id uuid,
  driver_name text,
  operational_date date,
  assignment_state text,
  is_active_assignment boolean,
  collect_amount numeric,
  order_data jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      o.*,
      COALESCE(
        private.driver_analytics_assignment_date(
          o.driver_assigned_at,
          batch.created_at,
          assignment_audit.created_at
        ),
        public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date)
      ) AS effective_assignment_date,
      COALESCE(o.driver_assigned_at, batch.created_at, assignment_audit.created_at, o.created_at) AS effective_assignment_timestamp,
      CASE
        WHEN o.driver_assigned_at IS NOT NULL THEN 'driver_assigned_at'
        WHEN batch.created_at IS NOT NULL THEN 'driver_assignment_batch'
        WHEN assignment_audit.created_at IS NOT NULL THEN 'assignment_audit'
        ELSE 'order_operational_date_fallback'
      END AS effective_assignment_source,
      public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)
        AND o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
        AND COALESCE(o.operational_status::text, '') NOT IN (
          'DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND COALESCE(o.salesperson_action_required, false) IS NOT TRUE
        AND COALESCE(o.runner_review_status::text, '') <> 'ACTION_REQUIRED'
        AND COALESCE(o.runner_final_outcome::text, '') <> 'NEED_SALESPERSON_FOLLOWUP'
        AS is_active,
      o.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
        AND COALESCE(o.runner_accept_status::text, 'PENDING') <> 'ACCEPTED'
        AND COALESCE(o.runner_review_status::text, 'NOT_REVIEWED') <> 'REVIEWED'
        AND COALESCE(o.runner_status::text, '') NOT IN (
          'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND COALESCE(o.operational_status::text, '') NOT IN (
          'DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND COALESCE(o.salesperson_action_required, false) IS NOT TRUE
        AND COALESCE(o.runner_review_status::text, '') <> 'ACTION_REQUIRED'
        AND COALESCE(o.runner_final_outcome::text, '') <> 'NEED_SALESPERSON_FOLLOWUP'
        AS is_pending_review
    FROM public.orders o
    LEFT JOIN public.driver_assignment_batches batch
      ON batch.id = o.driver_assignment_batch_id
    LEFT JOIN LATERAL (
      SELECT audit.created_at
      FROM public.audit_logs audit
      WHERE audit.entity_type = 'order'
        AND audit.entity_id = o.id
        AND audit.action IN (
          'DRIVER_ASSIGNED',
          'DRIVER_REASSIGNED',
          'ORDER_ASSIGNED_TO_DRIVER'
        )
      ORDER BY audit.created_at DESC, audit.id DESC
      LIMIT 1
    ) assignment_audit ON true
    WHERE o.driver_id IS NOT NULL
      AND COALESCE(o.status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND COALESCE(o.runner_status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND COALESCE(o.delivery_area_code, '') NOT IN ('SELF_PICKUP', 'CANCELLED')
      AND UPPER(COALESCE(o.order_source, 'SALESPERSON')) NOT IN ('TEST', 'DEMO')
      AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
      AND (p_driver_id IS NULL OR o.driver_id = p_driver_id)
      AND (
        p_date_from IS NULL
        OR COALESCE(
          private.driver_analytics_assignment_date(
            o.driver_assigned_at,
            batch.created_at,
            assignment_audit.created_at
          ),
          public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date)
        ) >= p_date_from
      )
      AND (
        p_date_to IS NULL
        OR COALESCE(
          private.driver_analytics_assignment_date(
            o.driver_assigned_at,
            batch.created_at,
            assignment_audit.created_at
          ),
          public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date)
        ) <= p_date_to
      )
      AND (
        COALESCE(o.status::text, '') NOT IN (
          'DELIVERED', 'FAILED', 'FAILED_DELIVERY', 'COMPLETED', 'APPROVED',
          'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        OR (
          o.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
          AND COALESCE(o.runner_accept_status::text, 'PENDING') <> 'ACCEPTED'
          AND COALESCE(o.runner_review_status::text, 'NOT_REVIEWED') <> 'REVIEWED'
          AND COALESCE(o.runner_status::text, '') NOT IN (
            'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
          )
        )
      )
  )
  SELECT
    scoped.id,
    scoped.order_code,
    scoped.runner_id,
    scoped.driver_id,
    COALESCE(driver_profile.display_name, driver_profile.email, 'Unknown Driver')::text,
    public.order_operational_date(scoped.next_delivery_date, scoped.expected_pickup_date, scoped.order_date),
    CASE
      WHEN scoped.is_pending_review THEN 'PENDING_ACCEPTANCE'
      WHEN scoped.driver_status::text = 'DRIVER_DELIVERED'
        AND scoped.runner_accept_status::text = 'ACCEPTED'
        AND scoped.runner_status::text = 'DELIVERED'
        THEN 'DELIVERED'
      WHEN scoped.driver_status::text = 'DRIVER_FAILED'
        AND scoped.runner_accept_status::text = 'ACCEPTED'
        AND scoped.runner_status::text = 'FAILED_DELIVERY'
        THEN 'FAILED'
      WHEN scoped.is_active THEN 'ACTIVE'
      ELSE 'INACTIVE'
    END,
    scoped.is_active,
    private.order_cod_due_amount(scoped.id),
    to_jsonb(scoped)
      || jsonb_build_object(
        'effective_assignment_date', scoped.effective_assignment_date,
        'assignment_timestamp', scoped.effective_assignment_timestamp,
        'assignment_source', scoped.effective_assignment_source,
        'current_assignment_id', scoped.driver_assignment_batch_id,
        'cod_due_amount', private.order_cod_due_amount(scoped.id),
        'canonical_lifecycle_state', CASE
          WHEN scoped.is_pending_review THEN 'PENDING_ACCEPTANCE'
          WHEN scoped.driver_status::text = 'DRIVER_DELIVERED'
            AND scoped.runner_accept_status::text = 'ACCEPTED'
            AND scoped.runner_status::text = 'DELIVERED'
            THEN 'DELIVERED'
          WHEN scoped.driver_status::text = 'DRIVER_FAILED'
            AND scoped.runner_accept_status::text = 'ACCEPTED'
            AND scoped.runner_status::text = 'FAILED_DELIVERY'
            THEN 'FAILED'
          WHEN scoped.is_active THEN 'ACTIVE'
          ELSE 'INACTIVE'
        END,
        'driver', jsonb_build_object(
          'id', driver_profile.id,
          'display_name', driver_profile.display_name,
          'email', driver_profile.email
        ),
        'order_items',
        CASE
          WHEN p_include_items THEN COALESCE((
            SELECT jsonb_agg(
              to_jsonb(oi)
              || jsonb_build_object(
                'product',
                CASE
                  WHEN product.id IS NULL THEN NULL
                  ELSE jsonb_build_object(
                    'id', product.id,
                    'sku_code', product.sku_code,
                    'sku_name', product.sku_name
                  )
                END
              )
              ORDER BY oi.created_at, oi.id
            )
            FROM public.order_items oi
            LEFT JOIN public.products product ON product.id = oi.product_id
            WHERE oi.order_id = scoped.id
          ), '[]'::jsonb)
          ELSE '[]'::jsonb
        END
      )
  FROM scoped
  LEFT JOIN public.profiles driver_profile ON driver_profile.id = scoped.driver_id
  WHERE (
    p_active_only IS NOT TRUE
    OR scoped.is_active
    OR scoped.is_pending_review
  )
  AND (
    public.get_user_role(auth.uid())::text = 'admin'
    OR (
      public.get_user_role(auth.uid())::text = 'runner'
      AND scoped.runner_id = auth.uid()
    )
    OR (
      public.get_user_role(auth.uid())::text = 'driver'
      AND scoped.driver_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.runner_assistants ra
      WHERE ra.assistant_id = auth.uid()
        AND ra.runner_id = scoped.runner_id
        AND ra.is_active = true
        AND (
          ra.can_manage_driver_inbox = true
          OR ra.can_manage_driver_stock = true
          OR ra.can_view_driver_workload = true
        )
    )
  )
  ORDER BY scoped.effective_assignment_date DESC,
    scoped.effective_assignment_timestamp DESC,
    scoped.id;
$$;
REVOKE ALL ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean) TO authenticated;

-- Finance reconciliation uses the same delivered cohort as the existing
-- overview, but separates sales value from confirmed transfer and COD cash.
CREATE OR REPLACE FUNCTION public.get_finance_payment_breakdown(
  p_runner_id uuid DEFAULT NULL,
  p_area text DEFAULT NULL,
  p_from_date date DEFAULT ((now() AT TIME ZONE 'Asia/Brunei')::date),
  p_to_date date DEFAULT ((now() AT TIME ZONE 'Asia/Brunei')::date)
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_runner_id uuid := p_runner_id;
  v_visible_owner_ids uuid[];
  v_summary jsonb;
  v_days jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_role := public.get_user_role(v_actor)::text;
  IF v_role = 'runner' THEN
    v_runner_id := v_actor;
  ELSIF v_role IS NULL OR v_role NOT IN ('admin', 'manager', 'finance_viewer') THEN
    RAISE EXCEPTION 'Finance overview is not available for this role';
  END IF;
  IF p_from_date IS NULL OR p_to_date IS NULL OR p_from_date > p_to_date THEN
    RAISE EXCEPTION 'Invalid report date range';
  END IF;
  IF v_role = 'manager' AND v_runner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.manager_runner_bindings b
    WHERE b.manager_id = v_actor AND b.runner_id = v_runner_id
  ) THEN
    RAISE EXCEPTION 'Runner is outside your reporting scope';
  END IF;
  IF v_role = 'manager' THEN
    v_visible_owner_ids := public.get_visible_owner_ids();
  END IF;

  WITH delivered AS (
    SELECT
      o.id,
      o.payment_history_unverified,
      COALESCE(o.total_amount, 0)::numeric AS sales_value,
      private.order_transfer_paid_amount(o.id)::numeric AS transfer_paid,
      private.order_cod_due_amount(o.id)::numeric AS cod_due,
      LEAST(o.cod_amount, GREATEST(COALESCE(o.driver_cash_amount, 0), 0))::numeric AS cod_cash,
      LEAST(GREATEST(o.cod_amount - COALESCE(o.driver_cash_amount, 0), 0), GREATEST(COALESCE(o.driver_transfer_amount, 0), 0))::numeric AS cod_transfer
    FROM public.orders o
    WHERE o.runner_status::text = 'DELIVERED'
      AND o.status::text NOT IN ('CANCELLED', 'CANCELED')
      AND o.delivered_at IS NOT NULL
      AND (o.delivered_at AT TIME ZONE 'Asia/Brunei')::date BETWEEN p_from_date AND p_to_date
      AND (v_runner_id IS NULL OR o.runner_id = v_runner_id)
      AND (p_area IS NULL OR o.area = p_area)
      AND (v_visible_owner_ids IS NULL OR o.salesperson_id = ANY(v_visible_owner_ids))
  )
  SELECT jsonb_build_object(
    'salesValue', COALESCE(SUM(sales_value), 0),
    'transferPaid', COALESCE(SUM(transfer_paid), 0),
    'codDue', COALESCE(SUM(cod_due), 0),
    'codCollected', COALESCE(SUM(cod_cash + cod_transfer), 0),
    'totalCollected', COALESCE(SUM(transfer_paid + cod_cash + cod_transfer), 0),
    'outstanding', COALESCE(SUM(GREATEST(sales_value - transfer_paid - cod_cash - cod_transfer, 0)) FILTER (WHERE NOT payment_history_unverified), 0),
    'unverifiedClosedCount', COUNT(*) FILTER (WHERE payment_history_unverified),
    'codCount', COUNT(*) FILTER (WHERE cod_due > 0),
    'transferCount', COUNT(*) FILTER (WHERE transfer_paid > 0)
  ) INTO v_summary
  FROM delivered;

  WITH calendar AS (
    SELECT generate_series(p_from_date, p_to_date, interval '1 day')::date AS report_date
  ), delivered AS (
    SELECT
      (o.delivered_at AT TIME ZONE 'Asia/Brunei')::date AS report_date,
      o.payment_history_unverified,
      COALESCE(o.total_amount, 0)::numeric AS sales_value,
      private.order_transfer_paid_amount(o.id)::numeric AS transfer_paid,
      private.order_cod_due_amount(o.id)::numeric AS cod_due,
      LEAST(o.cod_amount, GREATEST(COALESCE(o.driver_cash_amount, 0), 0))::numeric AS cod_cash,
      LEAST(GREATEST(o.cod_amount - COALESCE(o.driver_cash_amount, 0), 0), GREATEST(COALESCE(o.driver_transfer_amount, 0), 0))::numeric AS cod_transfer
    FROM public.orders o
    WHERE o.runner_status::text = 'DELIVERED'
      AND o.status::text NOT IN ('CANCELLED', 'CANCELED')
      AND o.delivered_at IS NOT NULL
      AND (o.delivered_at AT TIME ZONE 'Asia/Brunei')::date BETWEEN p_from_date AND p_to_date
      AND (v_runner_id IS NULL OR o.runner_id = v_runner_id)
      AND (p_area IS NULL OR o.area = p_area)
      AND (v_visible_owner_ids IS NULL OR o.salesperson_id = ANY(v_visible_owner_ids))
  ), rows AS (
    SELECT
      c.report_date,
      COALESCE(SUM(d.sales_value), 0) AS sales_value,
      COALESCE(SUM(d.transfer_paid), 0) AS transfer_paid,
      COALESCE(SUM(d.cod_due), 0) AS cod_due,
      COALESCE(SUM(d.cod_cash + d.cod_transfer), 0) AS cod_collected,
      COALESCE(SUM(d.transfer_paid + d.cod_cash + d.cod_transfer), 0) AS total_collected,
      COALESCE(SUM(GREATEST(d.sales_value - d.transfer_paid - d.cod_cash - d.cod_transfer, 0)) FILTER (WHERE NOT d.payment_history_unverified), 0) AS outstanding,
      COUNT(*) FILTER (WHERE d.payment_history_unverified) AS unverified_closed_count
    FROM calendar c
    LEFT JOIN delivered d ON d.report_date = c.report_date
    GROUP BY c.report_date
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', report_date,
    'salesValue', sales_value,
    'transferPaid', transfer_paid,
    'codDue', cod_due,
    'codCollected', cod_collected,
    'totalCollected', total_collected,
    'outstanding', outstanding,
    'unverifiedClosedCount', unverified_closed_count
  ) ORDER BY report_date), '[]'::jsonb) INTO v_days
  FROM rows;

  RETURN jsonb_build_object('summary', v_summary, 'days', v_days);
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_payment_breakdown(uuid, text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_payment_breakdown(uuid, text, date, date) TO authenticated;


CREATE OR REPLACE FUNCTION public.validate_order_payment_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN RAISE EXCEPTION 'Payments cannot be moved between orders'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id FOR UPDATE;
  IF NEW.amount::text IN ('NaN', 'Infinity', '-Infinity') OR NEW.amount > v_order.total_amount THEN
    RAISE EXCEPTION 'Payment exceeds order total';
  END IF;
  IF NEW.source = 'CUSTOMER_PREPAYMENT' AND NEW.status <> 'VOIDED'
     AND (NEW.payment_type <> 'TRANSFER' OR NEW.amount <> v_order.total_amount - v_order.cod_amount) THEN
    RAISE EXCEPTION 'Transfer must match this order payment plan';
  END IF;
  IF NEW.status = 'CONFIRMED' AND NEW.payment_type = 'TRANSFER'
     AND (NEW.receipt_url IS NULL OR NEW.receipt_url !~ '^https://[^/[:space:]]+') THEN
    RAISE EXCEPTION 'Confirmed transfer requires an HTTPS receipt';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER order_payments_validate BEFORE INSERT OR UPDATE ON public.order_payments
FOR EACH ROW EXECUTE FUNCTION public.validate_order_payment_row();

-- Keep the existing status, permissions, cohort, and notification logic intact;
-- replace only collection expressions in the already-installed functions.
DO $$
DECLARE item record; definition text; updated_definition text;
BEGIN
  FOR item IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND (
      p.prosrc LIKE '%order_collection_amount(%'
      OR p.proname = 'queue_telegram_order_event'
      OR p.prosrc LIKE '%''collect_amount'', cohort.order_amount%'
    )
  LOOP
    definition := pg_get_functiondef(item.oid);
    updated_definition := replace(definition, 'public.order_collection_amount(o.payment_method::text, o.total_amount)', 'private.order_cod_due_amount(o.id)');
    updated_definition := replace(updated_definition, 'public.order_collection_amount(payment_method::text, total_amount)', 'private.order_cod_due_amount(id)');
    updated_definition := replace(updated_definition, '''collect_amount'', cohort.order_amount', '''collect_amount'', private.order_cod_due_amount(cohort.order_id)');
    updated_definition := replace(updated_definition, '''total_amount'', NEW.total_amount,', '''total_amount'', NEW.total_amount, ''cod_due_amount'', private.order_cod_due_amount(NEW.id), ''transfer_paid_amount'', private.order_transfer_paid_amount(NEW.id), ''transfer_amount'', NEW.total_amount - NEW.cod_amount, ''outstanding_amount'', GREATEST(private.order_cod_due_amount(NEW.id) - COALESCE(NEW.driver_cash_amount, 0) - COALESCE(NEW.driver_transfer_amount, 0), 0),');
    IF updated_definition <> definition THEN EXECUTE updated_definition; END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.order_transfer_paid_amount(uuid), private.order_cod_due_amount(uuid) FROM PUBLIC;

-- Preserve the existing insert RLS. Only the server computes the plan balance;
-- customer receipt evidence is initialized in the same insert transaction.
CREATE OR REPLACE FUNCTION public.create_order_with_payment(p_order jsonb, p_transfer_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_total numeric := (p_order->>'total_amount')::numeric;
  v_transfer numeric := p_transfer_amount;
  v_receipt text := nullif(p_order->>'receipt_url', '');
  v_order public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_total IS NULL OR v_transfer IS NULL OR v_total < 0 OR v_transfer < 0 OR v_transfer > v_total
     OR v_total::text IN ('NaN','Infinity','-Infinity') OR v_transfer::text IN ('NaN','Infinity','-Infinity')
     OR v_total <> round(v_total,2) OR v_transfer <> round(v_transfer,2) THEN
    RAISE EXCEPTION 'Invalid BND payment amount';
  END IF;
  IF v_transfer > 0 AND (v_receipt IS NULL OR v_receipt !~ '^https://[^/[:space:]]+') THEN
    RAISE EXCEPTION 'An HTTPS transfer receipt is required';
  END IF;
  PERFORM set_config('tomupro.payment_update_authorized', 'true', true);
  INSERT INTO public.orders(id, order_code, customer_name, phone, address, area, channel, notes,
    salesperson_id, order_owner_id, fulfillment_warehouse_id, created_by_user_id,
    status, order_date, expected_pickup_date, total_qty, total_amount, payment_method, payment_plan, cod_amount, receipt_url, receipt_status)
  VALUES (COALESCE((p_order->>'id')::uuid, gen_random_uuid()), p_order->>'order_code', p_order->>'customer_name', p_order->>'phone',
    p_order->>'address', p_order->>'area', p_order->>'channel', p_order->>'notes',
    COALESCE((p_order->>'salesperson_id')::uuid, auth.uid()), COALESCE((p_order->>'order_owner_id')::uuid, (p_order->>'salesperson_id')::uuid, auth.uid()),
    (p_order->>'fulfillment_warehouse_id')::uuid, auth.uid(), COALESCE((p_order->>'status')::public.order_status, 'BOOKING'),
    COALESCE((p_order->>'order_date')::date, (now() AT TIME ZONE 'Asia/Brunei')::date),
    (p_order->>'expected_pickup_date')::date, (p_order->>'total_qty')::integer, v_total,
    CASE WHEN v_transfer = v_total AND v_transfer > 0 THEN 'TRANSFER'::public.payment_method ELSE 'COD'::public.payment_method END,
    CASE WHEN v_transfer = 0 THEN 'COD' WHEN v_transfer = v_total THEN 'TRANSFER' ELSE 'PARTIAL_TRANSFER_COD' END,
    v_total - v_transfer, CASE WHEN v_transfer > 0 THEN v_receipt END, CASE WHEN v_transfer > 0 THEN 'pending' END)
  RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END;
$$;
REVOKE ALL ON FUNCTION public.create_order_with_payment(jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_with_payment(jsonb, numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
