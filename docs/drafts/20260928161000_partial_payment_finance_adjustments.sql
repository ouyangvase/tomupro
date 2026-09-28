-- Draft: approved finance corrections are separate from original payments and driver instructions.
BEGIN;
CREATE TABLE public.order_payment_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  payment_type text NOT NULL CHECK (payment_type IN ('BANK_TRANSFER','COD')),
  amount numeric NOT NULL CHECK (amount <> 0 AND abs(amount) < 10000000000 AND amount = round(amount,2)),
  reverses_payment_id uuid REFERENCES public.order_payments(id),
  reason text NOT NULL CHECK (nullif(btrim(reason),'') IS NOT NULL),
  receipt_url text,
  requested_by uuid NOT NULL REFERENCES public.profiles(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid NOT NULL REFERENCES public.profiles(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid NOT NULL,
  CHECK (requested_by <> approved_by),
  UNIQUE(order_id,request_id)
);
CREATE INDEX order_payment_adjustments_order_idx ON public.order_payment_adjustments(order_id);
CREATE UNIQUE INDEX order_payment_adjustments_one_reversal ON public.order_payment_adjustments(reverses_payment_id)
  WHERE reverses_payment_id IS NOT NULL;
ALTER TABLE public.order_payment_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_payment_adjustments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.order_payment_adjustments TO authenticated;
CREATE POLICY "Adjustment visibility follows order visibility" ON public.order_payment_adjustments
  FOR SELECT TO authenticated USING (order_id IN (SELECT id FROM public.orders));
CREATE TRIGGER immutable_payment_adjustments BEFORE UPDATE OR DELETE ON public.order_payment_adjustments
  FOR EACH ROW EXECUTE FUNCTION private.reject_payment_history_mutation();

CREATE TABLE public.order_payment_correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  payment_type text NOT NULL CHECK (payment_type IN ('BANK_TRANSFER','COD')),
  amount numeric NOT NULL CHECK (amount <> 0 AND abs(amount) < 10000000000 AND amount = round(amount,2)),
  reverses_payment_id uuid REFERENCES public.order_payments(id),
  reason text NOT NULL CHECK (nullif(btrim(reason),'') IS NOT NULL),
  receipt_url text,
  requested_by uuid NOT NULL REFERENCES public.profiles(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid NOT NULL,
  UNIQUE(order_id,request_id)
);
ALTER TABLE public.order_payment_correction_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_payment_correction_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.order_payment_correction_requests TO authenticated;
CREATE POLICY "Correction request visibility follows order visibility" ON public.order_payment_correction_requests
  FOR SELECT TO authenticated USING (order_id IN (SELECT id FROM public.orders));
CREATE TRIGGER immutable_payment_correction_requests BEFORE UPDATE OR DELETE ON public.order_payment_correction_requests
  FOR EACH ROW EXECUTE FUNCTION private.reject_payment_history_mutation();

CREATE FUNCTION private.request_order_payment_correction(
  p_order_id uuid,p_payment_type text,p_amount numeric,p_reverses_payment_id uuid,
  p_reason text,p_receipt_url text,p_request_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid(); v_order public.orders%ROWTYPE;
  v_company uuid; v_id uuid; v_existing public.order_payment_correction_requests%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO STRICT v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF v_order.payment_picked_up_at IS NULL AND v_order.driver_started_at IS NULL
    AND v_order.payment_delivered_at IS NULL AND v_order.delivered_at IS NULL THEN
    RAISE EXCEPTION 'Use the normal payment workflow before pickup';
  END IF;
  v_company := public.get_user_company_id(v_order.runner_id);
  IF v_company IS NULL OR public.get_user_company_id(v_actor) IS DISTINCT FROM v_company
    OR (public.get_user_company_role(v_actor)::text IN ('owner','admin') OR v_order.runner_id=v_actor) IS NOT TRUE THEN
    RAISE EXCEPTION 'Finance correction access required';
  END IF;
  IF nullif(btrim(p_reason),'') IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Correction reason and request ID are required'; END IF;
  SELECT * INTO v_existing FROM public.order_payment_correction_requests WHERE order_id=p_order_id AND request_id=p_request_id;
  IF FOUND THEN
    IF (v_existing.payment_type,v_existing.amount,v_existing.reverses_payment_id,v_existing.reason,v_existing.receipt_url,v_existing.requested_by)
      IS DISTINCT FROM (p_payment_type,p_amount,p_reverses_payment_id,p_reason,p_receipt_url,v_actor) THEN
      RAISE EXCEPTION 'Correction request ID was already used for different details';
    END IF;
    RETURN v_existing.id;
  END IF;
  INSERT INTO public.order_payment_correction_requests(order_id,company_id,payment_type,amount,reverses_payment_id,reason,receipt_url,requested_by,request_id)
    VALUES(p_order_id,v_company,p_payment_type,p_amount,p_reverses_payment_id,p_reason,p_receipt_url,v_actor,p_request_id) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION private.approve_order_payment_correction(p_request_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid(); v_request public.order_payment_correction_requests%ROWTYPE;
  v_original public.order_payments%ROWTYPE; v_order public.orders%ROWTYPE; v_id uuid; v_balance numeric;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO STRICT v_request FROM public.order_payment_correction_requests WHERE id=p_request_id;
  SELECT * INTO STRICT v_order FROM public.orders WHERE id=v_request.order_id FOR UPDATE;
  IF public.get_user_company_id(v_actor) IS DISTINCT FROM v_request.company_id
    OR (public.get_user_company_role(v_actor)::text IN ('owner','admin')) IS NOT TRUE
    OR public.get_user_company_id(v_order.runner_id) IS DISTINCT FROM v_request.company_id THEN
    RAISE EXCEPTION 'Finance approval access required';
  END IF;
  IF v_actor=v_request.requested_by THEN RAISE EXCEPTION 'Cannot approve your own payment correction'; END IF;
  SELECT id INTO v_id FROM public.order_payment_adjustments WHERE order_id=v_request.order_id AND request_id=v_request.request_id;
  IF FOUND THEN RETURN v_id; END IF;
  IF v_request.reverses_payment_id IS NOT NULL THEN
    SELECT * INTO v_original FROM public.order_payments WHERE id=v_request.reverses_payment_id;
    IF v_original.id IS NULL OR v_original.order_id<>v_request.order_id OR v_original.status<>'confirmed'
      OR v_original.reverses_payment_id IS NOT NULL OR v_original.payment_type<>v_request.payment_type
      OR v_request.amount <> -v_original.amount OR EXISTS (
        SELECT 1 FROM public.order_payments WHERE reverses_payment_id=v_original.id AND status='confirmed'
      ) THEN RAISE EXCEPTION 'Invalid payment reversal'; END IF;
  END IF;
  SELECT coalesce(sum(amount),0) INTO v_balance FROM (
    SELECT CASE WHEN reverses_payment_id IS NULL THEN amount ELSE -amount END AS amount
      FROM public.order_payments WHERE order_id=v_request.order_id AND payment_type=v_request.payment_type AND status='confirmed'
    UNION ALL SELECT amount FROM public.order_payment_adjustments WHERE order_id=v_request.order_id AND payment_type=v_request.payment_type
  ) amounts;
  IF v_balance + v_request.amount < 0 THEN RAISE EXCEPTION 'Correction would create a negative payment balance'; END IF;
  INSERT INTO public.order_payment_adjustments(order_id,company_id,payment_type,amount,reverses_payment_id,reason,receipt_url,requested_by,requested_at,approved_by,request_id)
    VALUES(v_request.order_id,v_request.company_id,v_request.payment_type,v_request.amount,v_request.reverses_payment_id,
      v_request.reason,v_request.receipt_url,v_request.requested_by,v_request.requested_at,v_actor,v_request.request_id)
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.request_order_payment_correction(
  p_order_id uuid,p_payment_type text,p_amount numeric,p_reverses_payment_id uuid,p_reason text,p_receipt_url text,p_request_id uuid
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT private.request_order_payment_correction(p_order_id,p_payment_type,p_amount,p_reverses_payment_id,p_reason,p_receipt_url,p_request_id);
$$;
CREATE FUNCTION public.approve_order_payment_correction(p_request_id uuid) RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.approve_order_payment_correction(p_request_id); $$;
REVOKE ALL ON FUNCTION private.request_order_payment_correction(uuid,text,numeric,uuid,text,text,uuid),
  public.request_order_payment_correction(uuid,text,numeric,uuid,text,text,uuid),private.approve_order_payment_correction(uuid),
  public.approve_order_payment_correction(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.request_order_payment_correction(uuid,text,numeric,uuid,text,text,uuid),
  public.request_order_payment_correction(uuid,text,numeric,uuid,text,text,uuid),private.approve_order_payment_correction(uuid),
  public.approve_order_payment_correction(uuid) TO authenticated;

CREATE VIEW public.order_payment_balances WITH (security_invoker = true) AS
WITH entries AS (
  SELECT order_id,payment_type,CASE WHEN reverses_payment_id IS NULL THEN amount ELSE -amount END AS amount
  FROM public.order_payments WHERE status='confirmed'
  UNION ALL SELECT order_id,payment_type,amount FROM public.order_payment_adjustments
), totals AS (
  SELECT order_id,
    coalesce(sum(amount) FILTER (WHERE payment_type='BANK_TRANSFER'),0) AS transfer_paid,
    coalesce(sum(amount) FILTER (WHERE payment_type='COD'),0) AS cod_collected
  FROM entries GROUP BY order_id
)
SELECT o.id AS order_id,o.total_amount AS sales_value,o.cod_due,o.assignment_cod_due,
  coalesce(t.transfer_paid,0) AS transfer_paid,coalesce(t.cod_collected,0) AS cod_collected,
  coalesce(t.transfer_paid,0)+coalesce(t.cod_collected,0) AS total_collected,
  greatest(o.total_amount-coalesce(t.transfer_paid,0)-coalesce(t.cod_collected,0),0) AS outstanding,
  greatest(coalesce(t.transfer_paid,0)+coalesce(t.cod_collected,0)-o.total_amount,0) AS overpaid
FROM public.orders o LEFT JOIN totals t ON t.order_id=o.id WHERE o.payment_ledger_enabled;
REVOKE ALL ON public.order_payment_balances FROM PUBLIC,anon;
GRANT SELECT ON public.order_payment_balances TO authenticated;
COMMIT;
