ALTER TABLE public.runner_assistants
  ADD COLUMN IF NOT EXISTS can_manage_cash_settlement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_driver_operations boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_stock_audit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_inbound_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_driver_workload boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.has_runner_assistant_permission(
  p_assistant_id uuid,
  p_runner_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.runner_assistants ra
    WHERE ra.assistant_id = p_assistant_id
      AND ra.runner_id = p_runner_id
      AND ra.is_active = true
      AND CASE p_permission
        WHEN 'cash_settlement' THEN ra.can_manage_cash_settlement
        WHEN 'driver_operations' THEN ra.can_manage_driver_operations
        WHEN 'stock_audit' THEN ra.can_view_stock_audit
        WHEN 'inbound_stock' THEN ra.can_manage_inbound_stock
        WHEN 'driver_workload' THEN ra.can_view_driver_workload
        WHEN 'driver_inbox' THEN ra.can_manage_driver_inbox
        WHEN 'driver_stock' THEN ra.can_manage_driver_stock
        WHEN 'deliver' THEN ra.can_deliver
        WHEN 'confirm_receipt' THEN ra.can_confirm_receipt
        ELSE false
      END
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_runner_assistant_permission(uuid, uuid, text) TO authenticated;

DROP POLICY IF EXISTS "Runner assistants can view bound runner drivers" ON public.runner_drivers;
CREATE POLICY "Runner assistants can view bound runner drivers"
  ON public.runner_drivers FOR SELECT
  USING (
    public.has_runner_assistant_permission(auth.uid(), runner_id, 'driver_inbox')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'driver_stock')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'driver_operations')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'driver_workload')
  );

DROP POLICY IF EXISTS "Runner assistants can view cash liabilities" ON public.cash_liabilities;
CREATE POLICY "Runner assistants can view cash liabilities"
  ON public.cash_liabilities FOR SELECT
  USING (public.has_runner_assistant_permission(auth.uid(), runner_id, 'cash_settlement'));

DROP POLICY IF EXISTS "Runner assistants can update cash liabilities" ON public.cash_liabilities;
CREATE POLICY "Runner assistants can update cash liabilities"
  ON public.cash_liabilities FOR UPDATE
  USING (public.has_runner_assistant_permission(auth.uid(), runner_id, 'cash_settlement'))
  WITH CHECK (public.has_runner_assistant_permission(auth.uid(), runner_id, 'cash_settlement'));

DROP POLICY IF EXISTS "Runner assistants can manage cash settlement batches" ON public.cash_settlement_batches;
CREATE POLICY "Runner assistants can manage cash settlement batches"
  ON public.cash_settlement_batches FOR ALL
  USING (public.has_runner_assistant_permission(auth.uid(), runner_id, 'cash_settlement'))
  WITH CHECK (public.has_runner_assistant_permission(auth.uid(), runner_id, 'cash_settlement'));

DROP POLICY IF EXISTS "Runner assistants can manage inbound shipments" ON public.inbound_shipments;
CREATE POLICY "Runner assistants can manage inbound shipments"
  ON public.inbound_shipments FOR ALL
  USING (public.has_runner_assistant_permission(auth.uid(), runner_id, 'inbound_stock'))
  WITH CHECK (public.has_runner_assistant_permission(auth.uid(), runner_id, 'inbound_stock'));

DROP POLICY IF EXISTS "Runner assistants can manage inbound items" ON public.inbound_items;
CREATE POLICY "Runner assistants can manage inbound items"
  ON public.inbound_items FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.inbound_shipments shipment
      WHERE shipment.id = inbound_items.inbound_id
        AND public.has_runner_assistant_permission(auth.uid(), shipment.runner_id, 'inbound_stock')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.inbound_shipments shipment
      WHERE shipment.id = inbound_items.inbound_id
        AND public.has_runner_assistant_permission(auth.uid(), shipment.runner_id, 'inbound_stock')
    )
  );

DROP POLICY IF EXISTS "Runner assistants can view runner audit logs" ON public.audit_logs;
CREATE POLICY "Runner assistants can view runner audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    actor_id = auth.uid()
    OR (
      entity_type = 'order'
      AND EXISTS (
        SELECT 1
        FROM public.orders o
        JOIN public.runner_assistants ra ON ra.runner_id = o.runner_id
        WHERE o.id = audit_logs.entity_id
          AND ra.assistant_id = auth.uid()
          AND ra.is_active = true
      )
    )
  );

CREATE OR REPLACE FUNCTION public.review_driver_delivery(
  p_order_id uuid,
  p_actor_id uuid,
  p_accept boolean,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_action text;
BEGIN
  IF p_actor_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid actor');
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.runner_id IS DISTINCT FROM p_actor_id
    AND NOT public.has_runner_assistant_permission(p_actor_id, v_order.runner_id, 'driver_operations')
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'Driver Operations access required');
  END IF;

  IF p_accept THEN
    IF v_order.driver_status = 'DRIVER_FAILED' THEN
      UPDATE public.orders
      SET runner_accept_status = 'ACCEPTED',
          runner_status = 'FAILED_DELIVERY',
          updated_at = now()
      WHERE id = p_order_id;
      v_action := 'DRIVER_FAILURE_ACCEPTED';
    ELSE
      UPDATE public.orders
      SET runner_accept_status = 'ACCEPTED',
          runner_status = 'DELIVERED',
          delivered_at = now(),
          updated_at = now()
      WHERE id = p_order_id;
      v_action := 'DRIVER_DELIVERY_ACCEPTED';
    END IF;
  ELSE
    UPDATE public.orders
    SET runner_accept_status = 'REJECTED',
        driver_status = 'OUT_FOR_DELIVERY',
        driver_failed_remark = p_reason,
        updated_at = now()
    WHERE id = p_order_id;
    v_action := 'DRIVER_REPORT_REJECTED';
  END IF;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
  VALUES (
    'order',
    p_order_id,
    v_action,
    p_actor_id,
    jsonb_build_object(
      'runner_status', v_order.runner_status,
      'driver_status', v_order.driver_status,
      'runner_accept_status', v_order.runner_accept_status
    ),
    jsonb_build_object(
      'runner_id', v_order.runner_id,
      'driver_id', v_order.driver_id,
      'accepted', p_accept,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'runner_id', v_order.runner_id,
    'driver_id', v_order.driver_id,
    'action', v_action
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_driver_delivery(uuid, uuid, boolean, text) TO authenticated;

COMMENT ON TABLE public.runner_assistants IS
  'Capability-based delegation to a Runner. The assistant keeps their original user role and actions are audited under assistant_id.';

NOTIFY pgrst, 'reload schema';
