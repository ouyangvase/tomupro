-- Separate Driver cash collection from the Runner/assistant cash handover.
-- A liability is settled only after the Runner confirms receipt and the
-- assigned assistant acknowledges the same daily total.

ALTER TABLE public.cash_settlement_batches
  ADD COLUMN IF NOT EXISTS assistant_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS settlement_date date,
  ADD COLUMN IF NOT EXISTS runner_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS runner_confirmed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS assistant_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS assistant_acknowledged_by uuid REFERENCES public.profiles(id);

ALTER TABLE public.cash_settlement_batches
  ALTER COLUMN settled_at DROP NOT NULL,
  ALTER COLUMN settled_by DROP NOT NULL;

UPDATE public.cash_settlement_batches
SET settlement_date = COALESCE(settlement_date, (settled_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date),
    runner_confirmed_at = COALESCE(runner_confirmed_at, settled_at),
    runner_confirmed_by = COALESCE(runner_confirmed_by, settled_by)
WHERE settlement_date IS NULL
   OR runner_confirmed_at IS NULL
   OR runner_confirmed_by IS NULL;

ALTER TABLE public.cash_settlement_batches
  DROP CONSTRAINT IF EXISTS cash_settlement_batches_status_check;

ALTER TABLE public.cash_settlement_batches
  ADD CONSTRAINT cash_settlement_batches_status_check
  CHECK (status IN ('PENDING_ACK', 'SETTLED'));

ALTER TABLE public.cash_settlement_batches
  ADD CONSTRAINT cash_settlement_batches_handover_state_check
  CHECK (
    (
      status = 'PENDING_ACK'
      AND assistant_id IS NOT NULL
      AND settlement_date IS NOT NULL
      AND runner_confirmed_at IS NOT NULL
      AND runner_confirmed_by IS NOT NULL
      AND assistant_acknowledged_at IS NULL
      AND assistant_acknowledged_by IS NULL
      AND settled_at IS NULL
      AND settled_by IS NULL
    )
    OR (
      status = 'SETTLED'
      AND settled_at IS NOT NULL
      AND settled_by IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE public.cash_settlement_batches
  VALIDATE CONSTRAINT cash_settlement_batches_handover_state_check;

ALTER TABLE public.cash_liabilities
  DROP CONSTRAINT IF EXISTS cash_liabilities_status_check,
  DROP CONSTRAINT IF EXISTS settled_requires_batch;

ALTER TABLE public.cash_liabilities
  ADD CONSTRAINT cash_liabilities_status_check
  CHECK (status IN ('OPEN', 'PENDING_HANDOVER', 'SETTLED')),
  ADD CONSTRAINT settled_requires_batch
  CHECK (
    (status = 'OPEN' AND settlement_batch_id IS NULL AND settled_at IS NULL)
    OR (status = 'PENDING_HANDOVER' AND settlement_batch_id IS NOT NULL AND settled_at IS NULL)
    OR (status = 'SETTLED' AND settlement_batch_id IS NOT NULL AND settled_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_cash_settlement_batches_assistant_status
  ON public.cash_settlement_batches(assistant_id, status, settlement_date DESC);

CREATE INDEX IF NOT EXISTS idx_cash_settlement_batches_runner_date
  ON public.cash_settlement_batches(runner_id, settlement_date DESC);

DROP POLICY IF EXISTS "Runner assistants can update cash liabilities" ON public.cash_liabilities;
DROP POLICY IF EXISTS "Runner assistants can manage cash settlement batches" ON public.cash_settlement_batches;
DROP POLICY IF EXISTS "Runners create settlement batches" ON public.cash_settlement_batches;

DROP POLICY IF EXISTS "Runner assistants can view cash settlement batches" ON public.cash_settlement_batches;
CREATE POLICY "Runner assistants can view cash settlement batches"
  ON public.cash_settlement_batches FOR SELECT
  USING (
    assistant_id = auth.uid()
    AND public.has_runner_assistant_permission(auth.uid(), runner_id, 'cash_settlement')
  );

CREATE OR REPLACE FUNCTION public.create_cash_handover(
  p_assistant_id uuid,
  p_settlement_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_runner_id uuid := auth.uid();
  v_batch_id uuid;
  v_liability_ids uuid[];
  v_total_amount numeric;
  v_order_count integer;
  v_assistant_name text;
BEGIN
  IF v_runner_id IS NULL OR public.get_user_role(v_runner_id) <> 'runner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Runner access required');
  END IF;

  SELECT profile.display_name
  INTO v_assistant_name
  FROM public.runner_assistants binding
  JOIN public.profiles profile ON profile.id = binding.assistant_id
  WHERE binding.runner_id = v_runner_id
    AND binding.assistant_id = p_assistant_id
    AND binding.is_active = true
    AND binding.can_manage_cash_settlement = true;

  IF v_assistant_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Select an active Cash Settlement assistant');
  END IF;

  SELECT array_agg(liability.id), COALESCE(sum(liability.cash_amount), 0), count(*)::integer
  INTO v_liability_ids, v_total_amount, v_order_count
  FROM (
    SELECT item.id, item.cash_amount
    FROM public.cash_liabilities item
    WHERE item.runner_id = v_runner_id
      AND item.status = 'OPEN'
      AND (item.delivered_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date = p_settlement_date
    FOR UPDATE
  ) liability;

  IF v_order_count = 0 OR v_liability_ids IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No open cash for this date');
  END IF;

  INSERT INTO public.cash_settlement_batches (
    runner_id,
    assistant_id,
    settlement_date,
    total_amount,
    order_count,
    status,
    runner_confirmed_at,
    runner_confirmed_by,
    settled_at,
    settled_by,
    note
  )
  VALUES (
    v_runner_id,
    p_assistant_id,
    p_settlement_date,
    v_total_amount,
    v_order_count,
    'PENDING_ACK',
    now(),
    v_runner_id,
    NULL,
    NULL,
    'Daily cash handover'
  )
  RETURNING id INTO v_batch_id;

  UPDATE public.cash_liabilities
  SET status = 'PENDING_HANDOVER',
      settlement_batch_id = v_batch_id
  WHERE id = ANY(v_liability_ids)
    AND status = 'OPEN';

  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    type,
    priority,
    reference_type,
    reference_id,
    entity_type,
    status_from,
    status_to
  )
  VALUES (
    p_assistant_id,
    'Cash handover acknowledgement',
    format(
      'Runner confirmed receiving BND %s for %s order(s) on %s. Please acknowledge.',
      to_char(v_total_amount, 'FM999999990.00'),
      v_order_count,
      to_char(p_settlement_date, 'DD Mon YYYY')
    ),
    'CASH_HANDOVER_PENDING',
    'HIGH',
    'cash_handover',
    v_batch_id,
    'CASH_SETTLEMENT',
    'OPEN',
    'PENDING_ACK'
  );

  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    action,
    actor_id,
    before_json,
    after_json
  )
  VALUES (
    'cash_settlement_batch',
    v_batch_id,
    'CASH_HANDOVER_RUNNER_CONFIRMED',
    v_runner_id,
    jsonb_build_object('liability_status', 'OPEN'),
    jsonb_build_object(
      'assistant_id', p_assistant_id,
      'settlement_date', p_settlement_date,
      'total_amount', v_total_amount,
      'order_count', v_order_count,
      'status', 'PENDING_ACK'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'assistant_name', v_assistant_name,
    'total_amount', v_total_amount,
    'order_count', v_order_count,
    'status', 'PENDING_ACK'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_cash_handover(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_batch public.cash_settlement_batches%ROWTYPE;
BEGIN
  SELECT *
  INTO v_batch
  FROM public.cash_settlement_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF v_batch.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash handover not found');
  END IF;

  IF v_batch.status = 'SETTLED' THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;

  IF v_batch.assistant_id IS DISTINCT FROM v_actor_id
    OR NOT public.has_runner_assistant_permission(v_actor_id, v_batch.runner_id, 'cash_settlement')
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cash Settlement access required');
  END IF;

  UPDATE public.cash_liabilities
  SET status = 'SETTLED',
      settled_at = now()
  WHERE settlement_batch_id = p_batch_id
    AND status = 'PENDING_HANDOVER';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No pending cash items found');
  END IF;

  UPDATE public.cash_settlement_batches
  SET status = 'SETTLED',
      assistant_acknowledged_at = now(),
      assistant_acknowledged_by = v_actor_id,
      settled_at = now(),
      settled_by = v_actor_id
  WHERE id = p_batch_id;

  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    type,
    priority,
    reference_type,
    reference_id,
    entity_type,
    status_from,
    status_to
  )
  VALUES (
    v_batch.runner_id,
    'Cash payment completed',
    format(
      'Cash handover of BND %s for %s order(s) has been acknowledged.',
      to_char(v_batch.total_amount, 'FM999999990.00'),
      v_batch.order_count
    ),
    'CASH_HANDOVER_COMPLETED',
    'MEDIUM',
    'cash_handover',
    p_batch_id,
    'CASH_SETTLEMENT',
    'PENDING_ACK',
    'SETTLED'
  );

  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    action,
    actor_id,
    before_json,
    after_json
  )
  VALUES (
    'cash_settlement_batch',
    p_batch_id,
    'CASH_HANDOVER_ASSISTANT_ACKNOWLEDGED',
    v_actor_id,
    jsonb_build_object('status', 'PENDING_ACK'),
    jsonb_build_object(
      'status', 'SETTLED',
      'assistant_id', v_actor_id,
      'total_amount', v_batch.total_amount,
      'order_count', v_batch.order_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'total_amount', v_batch.total_amount,
    'order_count', v_batch.order_count,
    'status', 'SETTLED'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_cash_handover(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_cash_handover(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
