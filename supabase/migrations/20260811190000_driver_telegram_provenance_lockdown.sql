BEGIN;

-- A delivery attempt is the immutable, authenticated Driver action that is
-- allowed to produce a Driver Status Telegram event.  Order state is only a
-- read model and is never sufficient provenance for Telegram.
CREATE TABLE IF NOT EXISTS public.delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  active_assignment_id uuid NOT NULL REFERENCES public.driver_assignment_batches(id),
  driver_id uuid NOT NULL REFERENCES public.profiles(id),
  result_type text NOT NULL CHECK (result_type IN (
    'DRIVER_DELIVERED_SUBMITTED',
    'DRIVER_FAILED_SUBMITTED',
    'DRIVER_DELIVERY_TOMORROW_SUBMITTED',
    'DRIVER_RESCHEDULE_SUBMITTED'
  )),
  failure_reason text,
  remark text,
  reschedule_date date,
  driver_payment_method text,
  cash_amount numeric(12,2),
  transfer_amount numeric(12,2),
  proof_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  runner_decision text NOT NULL DEFAULT 'PENDING',
  runner_decision_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_delivery_attempts_order_submitted
  ON public.delivery_attempts (order_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_attempts_assignment
  ON public.delivery_attempts (active_assignment_id, submitted_at DESC);

ALTER TABLE public.delivery_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can read own delivery attempts" ON public.delivery_attempts;
CREATE POLICY "Drivers can read own delivery attempts"
  ON public.delivery_attempts FOR SELECT
  USING (
    driver_id = auth.uid()
    OR public.get_user_role(auth.uid())::text IN ('admin', 'runner', 'manager')
  );

CREATE OR REPLACE FUNCTION public.prevent_delivery_attempt_fact_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Delivery attempts are immutable';
  END IF;

  IF OLD.order_id IS DISTINCT FROM NEW.order_id
    OR OLD.active_assignment_id IS DISTINCT FROM NEW.active_assignment_id
    OR OLD.driver_id IS DISTINCT FROM NEW.driver_id
    OR OLD.result_type IS DISTINCT FROM NEW.result_type
    OR OLD.failure_reason IS DISTINCT FROM NEW.failure_reason
    OR OLD.remark IS DISTINCT FROM NEW.remark
    OR OLD.reschedule_date IS DISTINCT FROM NEW.reschedule_date
    OR OLD.driver_payment_method IS DISTINCT FROM NEW.driver_payment_method
    OR OLD.cash_amount IS DISTINCT FROM NEW.cash_amount
    OR OLD.transfer_amount IS DISTINCT FROM NEW.transfer_amount
    OR OLD.proof_images IS DISTINCT FROM NEW.proof_images
    OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
    OR OLD.submitted_at IS DISTINCT FROM NEW.submitted_at
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'Delivery attempt facts are immutable';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prevent_delivery_attempt_fact_mutation ON public.delivery_attempts;
CREATE TRIGGER prevent_delivery_attempt_fact_mutation
  BEFORE UPDATE OR DELETE ON public.delivery_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_delivery_attempt_fact_mutation();

ALTER TABLE public.telegram_event_queue
  ADD COLUMN IF NOT EXISTS delivery_attempt_id uuid REFERENCES public.delivery_attempts(id),
  ADD COLUMN IF NOT EXISTS active_assignment_id uuid REFERENCES public.driver_assignment_batches(id),
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS event_source text,
  ADD COLUMN IF NOT EXISTS source_function text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

ALTER TABLE public.telegram_driver_event_audit
  ADD COLUMN IF NOT EXISTS delivery_attempt_id uuid REFERENCES public.delivery_attempts(id),
  ADD COLUMN IF NOT EXISTS active_assignment_id uuid REFERENCES public.driver_assignment_batches(id),
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS event_source text,
  ADD COLUMN IF NOT EXISTS source_function text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_telegram_event_queue_driver_attempt
  ON public.telegram_event_queue (delivery_attempt_id, event_type);

CREATE INDEX IF NOT EXISTS idx_telegram_driver_audit_attempt
  ON public.telegram_driver_event_audit (delivery_attempt_id, event_created_at DESC);

-- Existing generic order updates may still create receipt/Runner events, but
-- they must never create a Driver Status event.
CREATE OR REPLACE FUNCTION public.queue_telegram_order_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_event_type text;
  v_metadata jsonb;
BEGIN
  IF OLD.receipt_status IS DISTINCT FROM NEW.receipt_status THEN
    v_event_type := NULL;

    IF NEW.receipt_status = 'pending' AND OLD.receipt_status IS NULL THEN
      v_event_type := 'receipt_uploaded';
    ELSIF NEW.receipt_status = 'pending' AND OLD.receipt_status = 'rejected' THEN
      v_event_type := 'receipt_reuploaded';
    ELSIF NEW.receipt_status = 'rejected' THEN
      v_event_type := 'receipt_rejected';
    ELSIF NEW.receipt_status = 'confirmed' THEN
      v_event_type := 'receipt_confirmed';
    END IF;

    IF v_event_type IS NOT NULL THEN
      v_metadata := jsonb_build_object(
        'order_code', NEW.order_code,
        'customer_name', NEW.customer_name,
        'total_amount', NEW.total_amount,
        'payment_method', NEW.payment_method,
        'receipt_status', NEW.receipt_status
      );

      INSERT INTO public.telegram_event_queue (event_type, order_id, runner_id, metadata)
      VALUES (v_event_type, NEW.id, NEW.runner_id, v_metadata);
    END IF;
  END IF;

  IF OLD.runner_status IS DISTINCT FROM NEW.runner_status THEN
    v_event_type := NULL;

    IF NEW.runner_status = 'ASSIGNED' THEN
      v_event_type := 'order_assigned';
    ELSIF NEW.runner_status = 'TAKEN' THEN
      v_event_type := 'order_taken';
    ELSIF NEW.runner_status = 'DELIVERED' THEN
      v_event_type := 'order_delivered';
    ELSIF NEW.runner_status = 'FAILED_DELIVERY' THEN
      v_event_type := 'delivery_failed';
    END IF;

    IF v_event_type IS NOT NULL THEN
      v_metadata := jsonb_build_object(
        'order_code', NEW.order_code,
        'customer_name', NEW.customer_name,
        'total_amount', NEW.total_amount,
        'payment_method', NEW.payment_method,
        'runner_status', NEW.runner_status,
        'prev_runner_status', OLD.runner_status
      );

      INSERT INTO public.telegram_event_queue (event_type, order_id, runner_id, metadata)
      VALUES (v_event_type, NEW.id, NEW.runner_id, v_metadata);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Remove the old post-update metadata rewrite. Runner processing must not
-- mutate or recreate the original Driver event.
DROP TRIGGER IF EXISTS trg_zz_annotate_driver_reschedule_telegram_event ON public.orders;
DROP FUNCTION IF EXISTS public.annotate_driver_reschedule_telegram_event();

CREATE OR REPLACE FUNCTION public.prevent_unproven_driver_outcome_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_role text := public.get_user_role(auth.uid())::text;
BEGIN
  IF OLD.driver_status IS NOT DISTINCT FROM NEW.driver_status
    AND OLD.driver_delivered_at IS NOT DISTINCT FROM NEW.driver_delivered_at
    AND OLD.driver_failed_at IS NOT DISTINCT FROM NEW.driver_failed_at
    AND OLD.driver_failed_reason IS NOT DISTINCT FROM NEW.driver_failed_reason
    AND OLD.driver_failed_remark IS NOT DISTINCT FROM NEW.driver_failed_remark
    AND OLD.driver_next_delivery_date IS NOT DISTINCT FROM NEW.driver_next_delivery_date
    AND OLD.driver_payment_method IS NOT DISTINCT FROM NEW.driver_payment_method
    AND OLD.driver_cash_amount IS NOT DISTINCT FROM NEW.driver_cash_amount
    AND OLD.driver_transfer_amount IS NOT DISTINCT FROM NEW.driver_transfer_amount
  THEN
    RETURN NEW;
  END IF;

  -- The canonical Driver RPC sets this transaction-local marker immediately
  -- before changing the outcome fields.
  IF current_setting('app.driver_submission', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Runner/admin review, pickup workflow, and service-side repair may update
  -- state, but they are explicitly not Driver Status Telegram sources.
  IF auth.uid() IS NULL
    OR v_role IN ('admin', 'runner', 'manager')
    OR public.has_runner_assistant_permission(auth.uid(), OLD.runner_id, 'driver_operations')
  THEN
    RETURN NEW;
  END IF;

  IF v_role = 'driver' THEN
    RAISE EXCEPTION 'Driver delivery outcomes must be submitted through submit_driver_delivery_result';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prevent_unproven_driver_outcome_update ON public.orders;
CREATE TRIGGER prevent_unproven_driver_outcome_update
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_unproven_driver_outcome_update();

CREATE OR REPLACE FUNCTION public.ensure_telegram_driver_event_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.event_type IN ('driver_delivered', 'driver_failed') THEN
    INSERT INTO public.telegram_driver_event_audit (
      event_id,
      order_id,
      order_ref,
      event_type,
      runner_id,
      delivery_attempt_id,
      active_assignment_id,
      driver_id,
      event_source,
      source_function,
      submitted_at,
      actor_id,
      event_created_at,
      metadata
    )
    VALUES (
      NEW.id,
      NEW.order_id,
      COALESCE(NEW.metadata->>'order_code', NEW.metadata->>'order_ref'),
      NEW.event_type,
      NEW.runner_id,
      NEW.delivery_attempt_id,
      NEW.active_assignment_id,
      NEW.driver_id,
      NEW.event_source,
      NEW.source_function,
      NEW.submitted_at,
      NEW.driver_id,
      NEW.created_at,
      COALESCE(NEW.metadata, '{}'::jsonb)
    )
    ON CONFLICT (event_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ensure_telegram_driver_event_audit ON public.telegram_event_queue;
CREATE TRIGGER trg_ensure_telegram_driver_event_audit
  AFTER INSERT ON public.telegram_event_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_telegram_driver_event_audit();

-- Some Driver queue rows predate telegram_driver_event_audit.  Create their
-- audit row on first sender state transition so the sender can expire them
-- safely instead of retrying forever or sending without provenance.
CREATE OR REPLACE FUNCTION public.set_telegram_driver_event_state(
  p_event_id uuid,
  p_status text,
  p_reason text,
  p_eligible_recipient_count integer,
  p_subscribed_recipient_count integer,
  p_destination_count integer,
  p_send_attempt_count integer,
  p_success_count integer,
  p_failed_count integer,
  p_attempt_count integer,
  p_last_error text DEFAULT NULL,
  p_next_retry_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := now();
  v_final boolean;
  v_event public.telegram_event_queue%ROWTYPE;
BEGIN
  IF p_status NOT IN ('pending', 'retrying', 'success', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'Invalid Telegram driver event status: %', p_status;
  END IF;

  SELECT * INTO v_event
  FROM public.telegram_event_queue
  WHERE id = p_event_id
    AND event_type IN ('driver_delivered', 'driver_failed')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Telegram driver event % was not found', p_event_id;
  END IF;

  INSERT INTO public.telegram_driver_event_audit (
    event_id,
    order_id,
    order_ref,
    event_type,
    runner_id,
    delivery_attempt_id,
    active_assignment_id,
    driver_id,
    event_source,
    source_function,
    submitted_at,
    actor_id,
    event_created_at,
    metadata
  )
  VALUES (
    v_event.id,
    v_event.order_id,
    COALESCE(v_event.metadata->>'order_code', v_event.metadata->>'order_ref'),
    v_event.event_type,
    v_event.runner_id,
    v_event.delivery_attempt_id,
    v_event.active_assignment_id,
    v_event.driver_id,
    v_event.event_source,
    v_event.source_function,
    v_event.submitted_at,
    v_event.driver_id,
    v_event.created_at,
    COALESCE(v_event.metadata, '{}'::jsonb)
  )
  ON CONFLICT (event_id) DO NOTHING;

  v_final := p_status IN ('success', 'failed', 'skipped');

  UPDATE public.telegram_event_queue
  SET notification_status = p_status,
      notification_reason = p_reason,
      notification_attempt_count = GREATEST(COALESCE(p_attempt_count, 0), 0),
      eligible_recipient_count = GREATEST(COALESCE(p_eligible_recipient_count, 0), 0),
      subscribed_recipient_count = GREATEST(COALESCE(p_subscribed_recipient_count, 0), 0),
      destination_count = GREATEST(COALESCE(p_destination_count, 0), 0),
      send_attempt_count = GREATEST(COALESCE(p_send_attempt_count, 0), 0),
      success_count = GREATEST(COALESCE(p_success_count, 0), 0),
      failed_count = GREATEST(COALESCE(p_failed_count, 0), 0),
      last_attempt_at = CASE WHEN p_status = 'pending' THEN NULL ELSE v_now END,
      next_retry_at = p_next_retry_at,
      processed = v_final,
      processed_at = CASE WHEN v_final THEN v_now ELSE NULL END
  WHERE id = p_event_id;

  UPDATE public.telegram_driver_event_audit
  SET status = p_status,
      reason = p_reason,
      eligible_recipient_count = GREATEST(COALESCE(p_eligible_recipient_count, 0), 0),
      subscribed_recipient_count = GREATEST(COALESCE(p_subscribed_recipient_count, 0), 0),
      destination_count = GREATEST(COALESCE(p_destination_count, 0), 0),
      send_attempt_count = GREATEST(COALESCE(p_send_attempt_count, 0), 0),
      success_count = GREATEST(COALESCE(p_success_count, 0), 0),
      failed_count = GREATEST(COALESCE(p_failed_count, 0), 0),
      attempt_count = GREATEST(COALESCE(p_attempt_count, 0), 0),
      last_error = p_last_error,
      last_attempt_at = CASE WHEN p_status = 'pending' THEN NULL ELSE v_now END,
      next_retry_at = p_next_retry_at,
      finalized_at = CASE WHEN v_final THEN v_now ELSE NULL END,
      updated_at = v_now
  WHERE event_id = p_event_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_telegram_driver_event_state(
  uuid, text, text, integer, integer, integer, integer, integer, integer, integer, text, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_telegram_driver_event_state(
  uuid, text, text, integer, integer, integer, integer, integer, integer, integer, text, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.submit_driver_delivery_result(
  p_order_id uuid,
  p_result_type text,
  p_payment_method text DEFAULT NULL,
  p_cash_amount numeric DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_remark text DEFAULT NULL,
  p_next_delivery_date date DEFAULT NULL,
  p_submission_id uuid DEFAULT gen_random_uuid(),
  p_proof_images jsonb DEFAULT '[]'::jsonb,
  p_submission_mode text DEFAULT 'NEW'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_role text;
  v_order public.orders%ROWTYPE;
  v_assignment public.driver_assignment_batches%ROWTYPE;
  v_existing_attempt public.delivery_attempts%ROWTYPE;
  v_attempt_id uuid := gen_random_uuid();
  v_event_id uuid;
  v_result_type text := upper(trim(COALESCE(p_result_type, '')));
  v_reason text;
  v_normalized_reason text;
  v_next_delivery_date date;
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_submitted_at timestamptz := clock_timestamp();
  v_collected_cash numeric(12,2) := 0;
  v_collected_transfer numeric(12,2) := 0;
  v_event_type text;
  v_metadata jsonb;
  v_submission_mode text := upper(trim(COALESCE(p_submission_mode, 'NEW')));
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_role := public.get_user_role(v_actor_id)::text;
  IF v_role <> 'driver'
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = v_actor_id AND role::text = 'driver' AND is_active = true
    )
  THEN
    RAISE EXCEPTION 'Only an active Driver can submit a delivery result';
  END IF;

  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'A submission id is required';
  END IF;

  SELECT * INTO v_existing_attempt
  FROM public.delivery_attempts
  WHERE driver_id = v_actor_id
    AND idempotency_key = p_submission_id::text
  LIMIT 1;

  IF v_existing_attempt.id IS NOT NULL THEN
    SELECT id INTO v_event_id
    FROM public.telegram_event_queue
    WHERE delivery_attempt_id = v_existing_attempt.id
    ORDER BY created_at ASC
    LIMIT 1;

    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'attempt_id', v_existing_attempt.id,
      'event_id', v_event_id,
      'result_type', v_existing_attempt.result_type
    );
  END IF;

  IF v_result_type NOT IN (
    'DRIVER_DELIVERED_SUBMITTED',
    'DRIVER_FAILED_SUBMITTED',
    'DRIVER_DELIVERY_TOMORROW_SUBMITTED',
    'DRIVER_RESCHEDULE_SUBMITTED'
  ) THEN
    RAISE EXCEPTION 'Invalid Driver delivery result type';
  END IF;

  IF v_submission_mode NOT IN ('NEW', 'CORRECTION') THEN
    RAISE EXCEPTION 'Invalid Driver submission mode';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.driver_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'This order is not assigned to you';
  END IF;

  IF v_order.driver_assignment_batch_id IS NULL THEN
    RAISE EXCEPTION 'This order has no active Driver assignment';
  END IF;

  SELECT * INTO v_assignment
  FROM public.driver_assignment_batches
  WHERE id = v_order.driver_assignment_batch_id
    AND new_driver_id = v_actor_id
  FOR UPDATE;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'The Driver assignment is no longer active';
  END IF;

  IF COALESCE(v_order.status::text, '') IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
    OR COALESCE(v_order.runner_status::text, '') IN ('DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
    OR COALESCE(v_order.operational_status::text, '') IN ('DELIVERED_FINAL', 'FAILED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
    OR v_order.delivered_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'This order is no longer actionable';
  END IF;

  IF COALESCE(v_order.salesperson_action_required, false)
    OR COALESCE(v_order.runner_review_status::text, '') = 'ACTION_REQUIRED'
    OR COALESCE(v_order.runner_final_outcome::text, '') = 'NEED_SALESPERSON_FOLLOWUP'
  THEN
    RAISE EXCEPTION 'This order requires downstream review before another Driver action';
  END IF;

  IF COALESCE(v_order.runner_accept_status::text, 'PENDING') = 'ACCEPTED'
    OR COALESCE(v_order.runner_review_status::text, 'NOT_REVIEWED') = 'REVIEWED'
  THEN
    RAISE EXCEPTION 'This Driver outcome has already been reviewed';
  END IF;

  IF v_submission_mode = 'CORRECTION'
    AND v_order.driver_status IS DISTINCT FROM 'DRIVER_FAILED'
  THEN
    RAISE EXCEPTION 'Only a pending failed Driver result can be corrected';
  END IF;

  IF v_submission_mode = 'CORRECTION'
    AND v_result_type = 'DRIVER_DELIVERED_SUBMITTED'
  THEN
    RAISE EXCEPTION 'A failed-result correction must remain a failed result';
  END IF;

  IF v_submission_mode = 'NEW'
    AND v_order.driver_status = 'DRIVER_DELIVERED'
  THEN
    RAISE EXCEPTION 'A delivered Driver result is already pending';
  END IF;

  IF v_submission_mode = 'NEW'
    AND v_order.driver_status = 'DRIVER_FAILED'
    AND v_result_type <> 'DRIVER_DELIVERED_SUBMITTED'
  THEN
    RAISE EXCEPTION 'A failed Driver result is already pending; use correction';
  END IF;

  IF v_result_type = 'DRIVER_DELIVERED_SUBMITTED' THEN
    IF upper(trim(COALESCE(p_payment_method, ''))) NOT IN ('CASH', 'TRANSFER', 'CASH_TRANSFER') THEN
      RAISE EXCEPTION 'A valid payment method is required for delivery';
    END IF;

    v_collected_cash := CASE upper(trim(p_payment_method))
      WHEN 'CASH' THEN COALESCE(v_order.total_amount, 0)
      WHEN 'TRANSFER' THEN 0
      ELSE GREATEST(0, LEAST(COALESCE(v_order.total_amount, 0), COALESCE(p_cash_amount, 0)))
    END;
    v_collected_transfer := GREATEST(0, COALESCE(v_order.total_amount, 0) - v_collected_cash);
    v_event_type := 'driver_delivered';
  ELSE
    v_normalized_reason := lower(regexp_replace(trim(COALESCE(p_reason, '')), '\s+', ' ', 'g'));

    SELECT r.label INTO v_reason
    FROM public.reasons r
    WHERE r.reason_type = 'FAILED_DELIVERY'
      AND r.is_active = true
      AND lower(regexp_replace(trim(r.label), '\s+', ' ', 'g')) = v_normalized_reason
    ORDER BY r.sort_order, r.label
    LIMIT 1;

    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'Select a valid failed-delivery option';
    END IF;

    IF v_normalized_reason = 'delivery tomorrow' THEN
      v_next_delivery_date := v_today + 1;
      v_result_type := 'DRIVER_DELIVERY_TOMORROW_SUBMITTED';
    ELSIF v_normalized_reason = 'customer requested reschedule' THEN
      IF p_next_delivery_date IS NULL OR p_next_delivery_date <= v_today THEN
        RAISE EXCEPTION 'The new delivery date must be tomorrow or later';
      END IF;
      v_next_delivery_date := p_next_delivery_date;
      v_result_type := 'DRIVER_RESCHEDULE_SUBMITTED';
    ELSE
      v_next_delivery_date := NULL;
      v_result_type := 'DRIVER_FAILED_SUBMITTED';
    END IF;

    v_event_type := 'driver_failed';
  END IF;

  PERFORM set_config('app.driver_submission', 'true', true);

  INSERT INTO public.delivery_attempts (
    id,
    order_id,
    active_assignment_id,
    driver_id,
    result_type,
    failure_reason,
    remark,
    reschedule_date,
    driver_payment_method,
    cash_amount,
    transfer_amount,
    proof_images,
    idempotency_key,
    submitted_at
  )
  VALUES (
    v_attempt_id,
    v_order.id,
    v_assignment.id,
    v_actor_id,
    v_result_type,
    v_reason,
    NULLIF(trim(COALESCE(p_remark, '')), ''),
    v_next_delivery_date,
    CASE WHEN v_result_type = 'DRIVER_DELIVERED_SUBMITTED' THEN upper(trim(p_payment_method)) ELSE NULL END,
    CASE WHEN v_result_type = 'DRIVER_DELIVERED_SUBMITTED' THEN v_collected_cash ELSE NULL END,
    CASE WHEN v_result_type = 'DRIVER_DELIVERED_SUBMITTED' THEN v_collected_transfer ELSE NULL END,
    COALESCE(p_proof_images, '[]'::jsonb),
    p_submission_id::text,
    v_submitted_at
  );

  IF v_result_type = 'DRIVER_DELIVERED_SUBMITTED' THEN
    UPDATE public.orders
    SET driver_status = 'DRIVER_DELIVERED',
        driver_delivered_at = v_submitted_at,
        driver_failed_at = NULL,
        driver_payment_method = upper(trim(p_payment_method)),
        driver_cash_amount = v_collected_cash,
        driver_transfer_amount = v_collected_transfer,
        runner_accept_status = 'PENDING',
        runner_review_status = 'NOT_REVIEWED',
        runner_final_outcome = NULL,
        runner_comment = NULL,
        runner_reviewed_at = NULL,
        runner_reviewed_by = NULL,
        salesperson_action_required = false,
        salesperson_action_type = NULL,
        salesperson_action_due_date = NULL,
        driver_failed_reason = NULL,
        driver_failed_remark = NULL,
        driver_next_delivery_date = NULL,
        updated_at = v_submitted_at
    WHERE id = v_order.id;
  ELSE
    UPDATE public.orders
    SET driver_status = 'DRIVER_FAILED',
        driver_delivered_at = NULL,
        driver_failed_at = v_submitted_at,
        driver_failed_reason = v_reason,
        driver_failed_remark = NULLIF(trim(COALESCE(p_remark, '')), ''),
        driver_next_delivery_date = v_next_delivery_date,
        runner_accept_status = 'PENDING',
        runner_review_status = 'NOT_REVIEWED',
        runner_final_outcome = NULL,
        runner_comment = NULL,
        runner_reviewed_at = NULL,
        runner_reviewed_by = NULL,
        salesperson_action_required = false,
        salesperson_action_type = NULL,
        salesperson_action_due_date = NULL,
        updated_at = v_submitted_at
    WHERE id = v_order.id;
  END IF;

  v_metadata := jsonb_build_object(
    'order_code', v_order.order_code,
    'customer_name', v_order.customer_name,
    'total_amount', v_order.total_amount,
    'payment_method', v_order.payment_method,
    'driver_payment_method', CASE WHEN v_result_type = 'DRIVER_DELIVERED_SUBMITTED' THEN upper(trim(p_payment_method)) ELSE NULL END,
    'driver_status', CASE WHEN v_result_type = 'DRIVER_DELIVERED_SUBMITTED' THEN 'DRIVER_DELIVERED' ELSE 'DRIVER_FAILED' END,
    'driver_action_type', v_result_type,
    'prev_driver_status', v_order.driver_status,
    'driver_id', v_actor_id,
    'active_assignment_id', v_assignment.id,
    'delivery_attempt_id', v_attempt_id,
    'proof_images', COALESCE(p_proof_images, '[]'::jsonb),
    'event_source', 'DRIVER_APP',
    'source_function', 'public.submit_driver_delivery_result',
    'submitted_at', v_submitted_at,
    'driver_delivered_at', CASE WHEN v_result_type = 'DRIVER_DELIVERED_SUBMITTED' THEN v_submitted_at ELSE NULL END,
    'driver_failed_reason', v_reason,
    'driver_failed_remark', NULLIF(trim(COALESCE(p_remark, '')), ''),
    'driver_next_delivery_date', v_next_delivery_date,
    'delivery_timing', CASE WHEN v_next_delivery_date = v_today + 1 THEN 'tomorrow' ELSE 'future' END,
    'updated_at', v_submitted_at
  );

  INSERT INTO public.telegram_event_queue (
    event_type,
    order_id,
    runner_id,
    metadata,
    dedupe_key,
    delivery_attempt_id,
    active_assignment_id,
    driver_id,
    event_source,
    source_function,
    submitted_at
  )
  VALUES (
    v_event_type,
    v_order.id,
    v_order.runner_id,
    v_metadata,
    v_event_type || ':' || v_attempt_id::text,
    v_attempt_id,
    v_assignment.id,
    v_actor_id,
    'DRIVER_APP',
    'public.submit_driver_delivery_result',
    v_submitted_at
  )
  RETURNING id INTO v_event_id;

  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    action,
    actor_id,
    before_json,
    after_json
  )
  VALUES (
    'order',
    v_order.id,
    'DRIVER_DELIVERY_ATTEMPT_SUBMITTED',
    v_actor_id,
    jsonb_build_object(
      'driver_status', v_order.driver_status,
      'driver_id', v_order.driver_id,
      'active_assignment_id', v_order.driver_assignment_batch_id,
      'runner_status', v_order.runner_status,
      'operational_status', v_order.operational_status
    ),
    jsonb_build_object(
      'driver_status', CASE WHEN v_result_type = 'DRIVER_DELIVERED_SUBMITTED' THEN 'DRIVER_DELIVERED' ELSE 'DRIVER_FAILED' END,
      'driver_action_type', v_result_type,
      'delivery_attempt_id', v_attempt_id,
      'telegram_event_id', v_event_id,
      'event_source', 'DRIVER_APP',
      'source_function', 'public.submit_driver_delivery_result',
      'submitted_at', v_submitted_at
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'attempt_id', v_attempt_id,
    'event_id', v_event_id,
    'order_id', v_order.id,
    'driver_id', v_actor_id,
    'active_assignment_id', v_assignment.id,
    'result_type', v_result_type,
    'submitted_at', v_submitted_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_driver_delivery_result(
  uuid, text, text, numeric, text, text, date, uuid, jsonb, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_driver_delivery_result(
  uuid, text, text, numeric, text, text, date, uuid, jsonb, text
) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
