-- Keep claim batch approval and all child order reconciliation updates atomic.
-- This prevents a CLAIMED batch from leaving its orders in ADMIN_ACK_PENDING.

CREATE OR REPLACE FUNCTION public.approve_claim_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_batch_status public.claim_batch_status;
  v_runner_id uuid;
  v_item_count bigint;
  v_updated_order_count bigint;
BEGIN
  IF v_actor_id IS NULL
     OR public.get_user_role(v_actor_id) <> 'admin'::public.app_role THEN
    RAISE EXCEPTION 'Only administrators can approve claim batches'
      USING ERRCODE = '42501';
  END IF;

  SELECT status, runner_id
    INTO v_batch_status, v_runner_id
  FROM public.claim_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim batch % was not found', p_batch_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_batch_status <> 'ADMIN_ACK_PENDING'::public.claim_batch_status THEN
    RAISE EXCEPTION 'Claim batch % is already %', p_batch_id, v_batch_status
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)
    INTO v_item_count
  FROM public.claim_batch_items
  WHERE batch_id = p_batch_id;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Claim batch % has no orders', p_batch_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.orders AS o
  SET reconciliation_status = 'CLAIMED'
  FROM public.claim_batch_items AS cbi
  WHERE cbi.batch_id = p_batch_id
    AND cbi.order_id = o.id;

  GET DIAGNOSTICS v_updated_order_count = ROW_COUNT;

  IF v_updated_order_count <> v_item_count THEN
    RAISE EXCEPTION
      'Claim batch % expected % order updates but updated %',
      p_batch_id, v_item_count, v_updated_order_count
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.claim_batches
  SET status = 'CLAIMED'::public.claim_batch_status,
      admin_ack_at = clock_timestamp(),
      admin_ack_by = v_actor_id
  WHERE id = p_batch_id;

  INSERT INTO public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json
  ) VALUES (
    v_actor_id,
    'CLAIM_BATCH_APPROVED',
    'claim_batch',
    p_batch_id,
    jsonb_build_object('status', 'ADMIN_ACK_PENDING'),
    jsonb_build_object(
      'status', 'CLAIMED',
      'order_count', v_updated_order_count
    )
  );

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'runner_id', v_runner_id,
    'order_count', v_updated_order_count,
    'status', 'CLAIMED'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_claim_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_claim_batch(uuid) TO authenticated;

-- Defense in depth: no direct update path may mark a batch claimed
-- while any child order is still pending reconciliation.
CREATE OR REPLACE FUNCTION public.assert_claim_batch_children_claimed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_item_count bigint;
  v_claimed_count bigint;
BEGIN
  IF NEW.status = 'CLAIMED'::public.claim_batch_status
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT count(*)
      INTO v_item_count
    FROM public.claim_batch_items
    WHERE batch_id = NEW.id;

    SELECT count(*)
      INTO v_claimed_count
    FROM public.claim_batch_items AS cbi
    JOIN public.orders AS o ON o.id = cbi.order_id
    WHERE cbi.batch_id = NEW.id
      AND o.reconciliation_status IN ('CLAIMED', 'SETTLED');

    IF v_item_count = 0 OR v_claimed_count <> v_item_count THEN
      RAISE EXCEPTION
        'Claim batch % cannot become CLAIMED: % of % child orders are reconciled',
        NEW.id, v_claimed_count, v_item_count
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS claim_batches_require_claimed_orders
  ON public.claim_batches;

CREATE CONSTRAINT TRIGGER claim_batches_require_claimed_orders
AFTER UPDATE OF status ON public.claim_batches
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION public.assert_claim_batch_children_claimed();

REVOKE ALL ON FUNCTION public.assert_claim_batch_children_claimed() FROM PUBLIC;
