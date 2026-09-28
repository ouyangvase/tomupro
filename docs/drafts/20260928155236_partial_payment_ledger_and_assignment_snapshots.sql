-- Release together with the payment write/review RPCs and client changes.
-- Never apply this foundation by itself to production.
BEGIN;

CREATE TABLE public.order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  payment_type text NOT NULL CHECK (payment_type IN ('BANK_TRANSFER', 'COD')),
  amount numeric NOT NULL CHECK (amount >= 0 AND amount < 10000000000 AND amount = round(amount, 2)),
  status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected', 'voided')),
  receipt_url text,
  reference text,
  remark text,
  reason text,
  reverses_payment_id uuid REFERENCES public.order_payments(id),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid REFERENCES public.profiles(id),
  confirmed_at timestamptz,
  request_id uuid NOT NULL,
  UNIQUE (order_id, request_id),
  CHECK (status <> 'confirmed' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)),
  CHECK (reverses_payment_id IS NULL OR nullif(btrim(reason), '') IS NOT NULL)
);
CREATE INDEX order_payments_order_idx ON public.order_payments(order_id);
CREATE UNIQUE INDEX order_payments_one_confirmed_reversal
  ON public.order_payments(reverses_payment_id)
  WHERE reverses_payment_id IS NOT NULL AND status = 'confirmed';

CREATE TABLE public.order_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  payment_id uuid NOT NULL REFERENCES public.order_payments(id),
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  before_json jsonb,
  after_json jsonb NOT NULL
);
CREATE INDEX order_payment_events_order_idx ON public.order_payment_events(order_id, occurred_at);

CREATE TABLE public.order_assignment_snapshots (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id),
  order_total_at_assignment numeric NOT NULL,
  confirmed_paid_at_assignment numeric NOT NULL,
  cod_due_at_assignment numeric NOT NULL,
  assigned_driver_id uuid NOT NULL REFERENCES public.profiles(id),
  assigned_at timestamptz NOT NULL,
  assigned_by uuid NOT NULL REFERENCES public.profiles(id),
  CHECK (order_total_at_assignment >= 0 AND confirmed_paid_at_assignment >= 0),
  CHECK (cod_due_at_assignment = greatest(order_total_at_assignment - confirmed_paid_at_assignment, 0))
);
CREATE INDEX order_assignment_snapshots_order_idx ON public.order_assignment_snapshots(order_id, assigned_at);

ALTER TABLE public.orders
  ADD COLUMN payment_ledger_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN payment_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN confirmed_non_cod_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN cod_due numeric,
  ADD COLUMN payment_picked_up_at timestamptz,
  ADD COLUMN payment_delivered_at timestamptz,
  ADD COLUMN payment_assignment_id uuid,
  ADD COLUMN assignment_cod_due numeric,
  ADD COLUMN payment_unassign_reason text;

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_assignment_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_payments, public.order_payment_events, public.order_assignment_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_payments, public.order_payment_events, public.order_assignment_snapshots TO authenticated;
CREATE POLICY "Payment visibility follows order visibility" ON public.order_payments
  FOR SELECT TO authenticated USING (order_id IN (SELECT id FROM public.orders));
CREATE POLICY "Payment event visibility follows order visibility" ON public.order_payment_events
  FOR SELECT TO authenticated USING (order_id IN (SELECT id FROM public.orders));
CREATE POLICY "Assignment snapshot visibility follows order visibility" ON public.order_assignment_snapshots
  FOR SELECT TO authenticated USING (order_id IN (SELECT id FROM public.orders));

CREATE FUNCTION private.reject_payment_history_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Payment and assignment audit history is immutable';
END;
$$;
CREATE TRIGGER immutable_payment_events BEFORE UPDATE OR DELETE ON public.order_payment_events
  FOR EACH ROW EXECUTE FUNCTION private.reject_payment_history_mutation();
CREATE TRIGGER immutable_assignment_snapshots BEFORE UPDATE OR DELETE ON public.order_assignment_snapshots
  FOR EACH ROW EXECUTE FUNCTION private.reject_payment_history_mutation();

CREATE FUNCTION private.guard_order_payment_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_original public.order_payments%ROWTYPE;
  v_paid numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Reverse a payment instead of deleting it'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id, NEW.order_id, NEW.created_by, NEW.created_at, NEW.request_id)
    IS DISTINCT FROM (OLD.id, OLD.order_id, OLD.created_by, OLD.created_at, OLD.request_id) THEN
    RAISE EXCEPTION 'Payment identity is immutable';
  END IF;
  SELECT * INTO STRICT v_order FROM public.orders WHERE id = NEW.order_id FOR UPDATE;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NEW.payment_type = 'BANK_TRANSFER' AND NEW.amount > v_order.total_amount THEN
    RAISE EXCEPTION 'Transfer amount must not exceed order total';
  END IF;
  IF v_order.payment_picked_up_at IS NOT NULL OR v_order.payment_delivered_at IS NOT NULL
    OR v_order.driver_started_at IS NOT NULL OR v_order.delivered_at IS NOT NULL THEN
    RAISE EXCEPTION 'Payment editing is locked after pickup or delivery. Use a Finance Payment Correction.';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' AND
    (NEW.payment_type, NEW.amount, NEW.status, NEW.reverses_payment_id, NEW.confirmed_by, NEW.confirmed_at)
    IS DISTINCT FROM (OLD.payment_type, OLD.amount, OLD.status, OLD.reverses_payment_id, OLD.confirmed_by, OLD.confirmed_at) THEN
    RAISE EXCEPTION 'Reverse a confirmed payment instead of overwriting it';
  END IF;
  IF NEW.reverses_payment_id IS NOT NULL THEN
    SELECT * INTO v_original FROM public.order_payments WHERE id = NEW.reverses_payment_id;
    IF v_original.id IS NULL OR v_original.order_id <> NEW.order_id OR v_original.status <> 'confirmed'
      OR v_original.reverses_payment_id IS NOT NULL OR v_original.amount <> NEW.amount
      OR v_original.payment_type <> NEW.payment_type THEN
      RAISE EXCEPTION 'Invalid payment reversal';
    END IF;
  END IF;
  SELECT coalesce(sum(CASE WHEN reverses_payment_id IS NULL THEN amount ELSE -amount END), 0)
    INTO v_paid FROM public.order_payments
    WHERE order_id = NEW.order_id AND payment_type = 'BANK_TRANSFER' AND status = 'confirmed' AND id <> NEW.id;
  IF NEW.payment_type = 'BANK_TRANSFER' AND NEW.status = 'confirmed' THEN
    v_paid := v_paid + CASE WHEN NEW.reverses_payment_id IS NULL THEN NEW.amount ELSE -NEW.amount END;
  END IF;
  IF v_paid < 0 OR v_paid > v_order.total_amount THEN RAISE EXCEPTION 'Transfer amount must not exceed order total'; END IF;
  IF v_order.driver_id IS NOT NULL AND greatest(v_order.total_amount - v_paid, 0) IS DISTINCT FROM v_order.cod_due THEN
    RAISE EXCEPTION 'Driver is already assigned. Unassign the driver before changing payment details that affect the COD amount.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_order_payment_write BEFORE INSERT OR UPDATE OR DELETE ON public.order_payments
  FOR EACH ROW EXECUTE FUNCTION private.guard_order_payment_write();

CREATE FUNCTION private.record_order_payment_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.order_payment_events(order_id, payment_id, actor_id, before_json, after_json)
    VALUES (NEW.order_id, NEW.id, auth.uid(), CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW));
  UPDATE public.orders SET confirmed_non_cod_paid = (
    SELECT coalesce(sum(CASE WHEN reverses_payment_id IS NULL THEN amount ELSE -amount END), 0)
    FROM public.order_payments WHERE order_id = NEW.order_id AND status = 'confirmed' AND payment_type = 'BANK_TRANSFER'
  ) WHERE id = NEW.order_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER record_order_payment_write AFTER INSERT OR UPDATE ON public.order_payments
  FOR EACH ROW EXECUTE FUNCTION private.record_order_payment_write();

CREATE FUNCTION private.guard_order_payment_state() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_paid numeric;
  v_payment_changed boolean;
  v_assignment_changed boolean;
BEGIN
  -- Capture the old marker even when the existing reschedule/reassignment code clears it.
  IF TG_OP = 'UPDATE' THEN
    NEW.payment_picked_up_at := coalesce(OLD.payment_picked_up_at, OLD.driver_started_at, NEW.driver_started_at);
    NEW.payment_delivered_at := coalesce(OLD.payment_delivered_at, OLD.delivered_at, NEW.delivered_at);
    IF OLD.payment_ledger_enabled AND NOT NEW.payment_ledger_enabled THEN RAISE EXCEPTION 'Payment ledger cannot be disabled'; END IF;
  ELSE
    NEW.payment_picked_up_at := NEW.driver_started_at;
    NEW.payment_delivered_at := NEW.delivered_at;
  END IF;
  IF NOT NEW.payment_ledger_enabled THEN RETURN NEW; END IF;
  NEW.payment_revision := CASE WHEN TG_OP = 'UPDATE' THEN OLD.payment_revision + 1 ELSE 0 END;
  SELECT coalesce(sum(CASE WHEN reverses_payment_id IS NULL THEN amount ELSE -amount END), 0)
    INTO v_paid FROM public.order_payments
    WHERE order_id = NEW.id AND status = 'confirmed' AND payment_type = 'BANK_TRANSFER';
  IF v_paid > NEW.total_amount OR NEW.total_amount < 0 OR NEW.total_amount <> round(NEW.total_amount, 2) THEN
    RAISE EXCEPTION 'Invalid order total or confirmed transfer amount';
  END IF;
  NEW.confirmed_non_cod_paid := v_paid;
  NEW.cod_due := greatest(NEW.total_amount - v_paid, 0);
  IF TG_OP = 'UPDATE' THEN
    v_payment_changed := (NEW.total_amount, NEW.payment_method, NEW.receipt_url, NEW.receipt_status,
      NEW.payment_receipt_ack_no, NEW.payment_receipt_amount)
      IS DISTINCT FROM (OLD.total_amount, OLD.payment_method, OLD.receipt_url, OLD.receipt_status,
      OLD.payment_receipt_ack_no, OLD.payment_receipt_amount);
    IF (OLD.payment_picked_up_at IS NOT NULL OR OLD.driver_started_at IS NOT NULL
      OR OLD.payment_delivered_at IS NOT NULL OR OLD.delivered_at IS NOT NULL) AND v_payment_changed THEN
      RAISE EXCEPTION 'Payment editing is locked after pickup or delivery. Use a Finance Payment Correction.';
    END IF;
    -- Check OLD assignment too: one UPDATE must not unassign and change COD together.
    IF OLD.driver_id IS NOT NULL AND NEW.cod_due IS DISTINCT FROM OLD.cod_due THEN
      RAISE EXCEPTION 'Driver is already assigned. Unassign the driver before changing payment details that affect the COD amount.';
    END IF;
    IF OLD.driver_id IS NOT NULL AND NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN
      IF nullif(btrim(NEW.payment_unassign_reason), '') IS NULL THEN RAISE EXCEPTION 'An audit reason is required to unassign the driver.'; END IF;
      INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, before_json, after_json)
        VALUES ('order', NEW.id, 'PAYMENT_DRIVER_UNASSIGNED', auth.uid(),
          jsonb_build_object('driver_id', OLD.driver_id, 'snapshot_id', OLD.payment_assignment_id),
          jsonb_build_object('reason', NEW.payment_unassign_reason, 'occurred_at', now()));
    END IF;
    v_assignment_changed := NEW.driver_id IS NOT NULL AND
      (NEW.driver_id, NEW.driver_assignment_batch_id) IS DISTINCT FROM (OLD.driver_id, OLD.driver_assignment_batch_id);
    NEW.payment_assignment_id := OLD.payment_assignment_id;
    NEW.assignment_cod_due := OLD.assignment_cod_due;
  ELSE
    v_assignment_changed := NEW.driver_id IS NOT NULL;
    NEW.payment_assignment_id := NULL;
    NEW.assignment_cod_due := NULL;
  END IF;
  IF v_assignment_changed THEN
    IF EXISTS (SELECT 1 FROM public.order_payments WHERE order_id = NEW.id
      AND payment_type = 'BANK_TRANSFER' AND status = 'pending') THEN
      RAISE EXCEPTION 'Confirm the transfer receipt before assigning a driver';
    END IF;
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Assignment actor is required'; END IF;
    NEW.payment_assignment_id := gen_random_uuid();
    NEW.assignment_cod_due := NEW.cod_due;
    NEW.driver_assigned_at := now();
    NEW.driver_assigned_by := auth.uid();
  ELSIF NEW.driver_id IS NULL THEN
    NEW.payment_assignment_id := NULL;
    NEW.assignment_cod_due := NULL;
  END IF;
  NEW.payment_unassign_reason := NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zzzz_guard_order_payment_state BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.guard_order_payment_state();

CREATE FUNCTION private.record_order_payment_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.payment_assignment_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.payment_assignment_id IS DISTINCT FROM OLD.payment_assignment_id) THEN
    INSERT INTO public.order_assignment_snapshots(id, order_id, order_total_at_assignment,
      confirmed_paid_at_assignment, cod_due_at_assignment, assigned_driver_id, assigned_at, assigned_by)
    VALUES (NEW.payment_assignment_id, NEW.id, NEW.total_amount, NEW.confirmed_non_cod_paid,
      NEW.assignment_cod_due, NEW.driver_id, NEW.driver_assigned_at, NEW.driver_assigned_by);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER record_order_payment_assignment AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.record_order_payment_assignment();

REVOKE ALL ON FUNCTION private.reject_payment_history_mutation(), private.guard_order_payment_write(),
  private.record_order_payment_write(), private.guard_order_payment_state(), private.record_order_payment_assignment()
  FROM PUBLIC, anon, authenticated;

COMMIT;
