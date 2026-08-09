-- A Driver status is historical evidence of what the Driver submitted.
-- runner_status is the canonical final outcome for Driver inbox visibility.
-- This prevents a stale DRIVER_FAILED/DRIVER_DELIVERED value from reviving an
-- order after the Runner has finalized it.

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
  SELECT
    o.id,
    o.order_code,
    o.runner_id,
    o.driver_id,
    COALESCE(driver_profile.display_name, driver_profile.email, 'Unknown Driver')::text,
    public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date),
    CASE
      -- Final Runner state always wins over retained Driver event fields.
      WHEN o.runner_status::text = 'DELIVERED' THEN 'DELIVERED'
      WHEN o.runner_status::text = 'FAILED_DELIVERY' THEN 'FAILED'
      WHEN o.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
        AND COALESCE(o.runner_accept_status::text, 'PENDING') <> 'ACCEPTED'
        AND COALESCE(o.runner_review_status::text, 'NOT_REVIEWED') <> 'REVIEWED'
        AND COALESCE(o.runner_status::text, '') NOT IN (
          'DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        THEN 'PENDING_ACCEPTANCE'
      WHEN public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)
        AND o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
        AND COALESCE(o.operational_status::text, '') NOT IN (
          'DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND NOT (
          o.runner_review_status::text = 'REVIEWED'
          AND o.runner_final_outcome::text = 'NEED_SALESPERSON_FOLLOWUP'
        ) THEN 'ACTIVE'
      ELSE 'INACTIVE'
    END,
    public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)
      AND o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
      AND COALESCE(o.operational_status::text, '') NOT IN (
        'DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
      )
      AND NOT (
        o.runner_review_status::text = 'REVIEWED'
        AND o.runner_final_outcome::text = 'NEED_SALESPERSON_FOLLOWUP'
      ),
    public.order_collection_amount(o.payment_method::text, o.total_amount),
    to_jsonb(o)
      || jsonb_build_object(
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
            WHERE oi.order_id = o.id
          ), '[]'::jsonb)
          ELSE '[]'::jsonb
        END
      )
  FROM public.orders o
  LEFT JOIN public.profiles driver_profile ON driver_profile.id = o.driver_id
  WHERE o.driver_id IS NOT NULL
    AND COALESCE(o.status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
    AND COALESCE(o.runner_status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
    AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
    AND (p_driver_id IS NULL OR o.driver_id = p_driver_id)
    AND (
      p_date_from IS NULL
      OR public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) >= p_date_from
    )
    AND (
      p_date_to IS NULL
      OR public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) <= p_date_to
    )
    AND (
      p_active_only IS NOT TRUE
      OR (
        public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)
        AND o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
        AND COALESCE(o.operational_status::text, '') NOT IN (
          'DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND NOT (
          o.runner_review_status::text = 'REVIEWED'
          AND o.runner_final_outcome::text = 'NEED_SALESPERSON_FOLLOWUP'
        )
      )
    )
    AND (
      public.get_user_role(auth.uid())::text = 'admin'
      OR (
        public.get_user_role(auth.uid())::text = 'runner'
        AND o.runner_id = auth.uid()
      )
      OR (
        public.get_user_role(auth.uid())::text = 'driver'
        AND o.driver_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.runner_assistants ra
        WHERE ra.assistant_id = auth.uid()
          AND ra.runner_id = o.runner_id
          AND ra.is_active = true
          AND (
            ra.can_manage_driver_inbox = true
            OR ra.can_manage_driver_stock = true
            OR ra.can_view_driver_workload = true
          )
      )
    )
  ORDER BY public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) DESC,
    o.created_at DESC,
    o.id;
$$;

REVOKE ALL ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean)
  TO authenticated;

-- Block stale Driver clients from changing Driver delivery fields after a
-- final Runner outcome. Admin corrections remain possible and history is kept.
CREATE OR REPLACE FUNCTION public.prevent_driver_updates_after_runner_final()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(public.get_user_role(auth.uid())::text, '') <> 'admin'
    AND OLD.runner_status::text IN (
      'DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
    )
    AND (
      NEW.runner_status IS DISTINCT FROM OLD.runner_status
      OR NEW.driver_status IS DISTINCT FROM OLD.driver_status
      OR NEW.driver_delivered_at IS DISTINCT FROM OLD.driver_delivered_at
      OR NEW.driver_failed_at IS DISTINCT FROM OLD.driver_failed_at
      OR NEW.driver_failed_reason IS DISTINCT FROM OLD.driver_failed_reason
      OR NEW.driver_failed_remark IS DISTINCT FROM OLD.driver_failed_remark
      OR NEW.driver_next_delivery_date IS DISTINCT FROM OLD.driver_next_delivery_date
      OR NEW.driver_payment_method IS DISTINCT FROM OLD.driver_payment_method
      OR NEW.driver_cash_amount IS DISTINCT FROM OLD.driver_cash_amount
      OR NEW.driver_transfer_amount IS DISTINCT FROM OLD.driver_transfer_amount
    )
  THEN
    RAISE EXCEPTION 'This order has a final Runner outcome and is no longer active for Driver updates';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_driver_updates_after_runner_final ON public.orders;
CREATE TRIGGER prevent_driver_updates_after_runner_final
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_driver_updates_after_runner_final();

COMMENT ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean) IS
  'Canonical Driver source. Final Runner outcomes take precedence over retained Driver event fields.';
COMMENT ON FUNCTION public.prevent_driver_updates_after_runner_final() IS
  'Prevents non-admin Driver fields from reopening orders after a final Runner outcome.';

NOTIFY pgrst, 'reload schema';
