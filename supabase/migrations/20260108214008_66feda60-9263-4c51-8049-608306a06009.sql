-- =====================================================
-- COMPREHENSIVE SECURITY FIX MIGRATION
-- =====================================================

-- 1. FIX: Profiles - Restrict SELECT to related users only
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON public.profiles;

CREATE POLICY "admin_view_all_profiles" ON public.profiles FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "user_view_own_profile" ON public.profiles FOR SELECT
USING (id = auth.uid());

CREATE POLICY "manager_view_group_profiles" ON public.profiles FOR SELECT
USING (public.get_user_role(auth.uid()) = 'manager' AND EXISTS (
  SELECT 1 FROM public.manager_groups mg JOIN public.group_members gm ON gm.group_id = mg.id
  WHERE mg.manager_user_id = auth.uid() AND gm.member_user_id = profiles.id));

CREATE POLICY "runner_view_related_profiles" ON public.profiles FOR SELECT
USING (public.get_user_role(auth.uid()) = 'runner' AND (
  EXISTS (SELECT 1 FROM public.bindings b WHERE b.runner_id = auth.uid() AND b.salesperson_id = profiles.id AND b.active = true)
  OR EXISTS (SELECT 1 FROM public.runner_drivers rd WHERE rd.runner_id = auth.uid() AND rd.driver_id = profiles.id AND rd.is_active = true)));

CREATE POLICY "salesperson_view_bound_runners" ON public.profiles FOR SELECT
USING (public.get_user_role(auth.uid()) = 'salesperson' AND EXISTS (
  SELECT 1 FROM public.bindings b WHERE b.salesperson_id = auth.uid() AND b.runner_id = profiles.id AND b.active = true));

CREATE POLICY "driver_view_parent_runner" ON public.profiles FOR SELECT
USING (public.get_user_role(auth.uid()) = 'driver' AND EXISTS (
  SELECT 1 FROM public.runner_drivers rd WHERE rd.driver_id = auth.uid() AND rd.runner_id = profiles.id AND rd.is_active = true));

-- 2. FIX: Orders - Restrict manager access
DROP POLICY IF EXISTS "Managers can view orders from group salespersons" ON public.orders;
CREATE POLICY "manager_view_orders_needing_intervention" ON public.orders FOR SELECT
USING (public.get_user_role(auth.uid()) = 'manager' AND EXISTS (
  SELECT 1 FROM public.manager_groups mg JOIN public.group_members gm ON gm.group_id = mg.id
  WHERE mg.manager_user_id = auth.uid() AND gm.member_user_id = orders.salesperson_id)
  AND (status = 'CANCELLED' OR salesperson_action_required = true OR dispute_reason IS NOT NULL OR operational_status IN ('failed', 'pending')));

-- 3. FIX: Views with security_invoker
DROP VIEW IF EXISTS public.driver_allocated_stock;
CREATE VIEW public.driver_allocated_stock WITH (security_invoker = true) AS
SELECT o.driver_id, oi.product_id, p.sku_code, p.sku_name,
  SUM(oi.qty) AS allocated_qty,
  SUM(CASE WHEN o.driver_status = 'delivered' THEN oi.qty ELSE 0 END) AS delivered_qty,
  SUM(CASE WHEN o.driver_status IN ('pending', 'in_transit') THEN oi.qty ELSE 0 END) AS pending_qty
FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id LEFT JOIN public.products p ON p.id = oi.product_id
WHERE o.driver_id IS NOT NULL AND o.status NOT IN ('CANCELLED') AND o.driver_status IS NOT NULL
  AND (o.driver_id = auth.uid() OR o.runner_id = auth.uid() OR public.get_user_role(auth.uid()) = 'admin')
GROUP BY o.driver_id, oi.product_id, p.sku_code, p.sku_name;

DROP VIEW IF EXISTS public.stock_balance_view;
CREATE VIEW public.stock_balance_view WITH (security_invoker = true) AS
SELECT sm.warehouse_id, w.name AS warehouse_name, w.owner_user_id, p_owner.display_name AS owner_name,
  sm.product_id, pr.sku_code, pr.sku_name, SUM(sm.qty_change) AS balance_qty, MAX(sm.created_at) AS last_movement_time
FROM public.stock_movements sm JOIN public.warehouses w ON w.id = sm.warehouse_id
LEFT JOIN public.profiles p_owner ON p_owner.id = w.owner_user_id LEFT JOIN public.products pr ON pr.id = sm.product_id
WHERE w.owner_user_id = auth.uid() OR public.get_user_role(auth.uid()) = 'admin' OR public.can_view_stock(w.owner_user_id, auth.uid())
GROUP BY sm.warehouse_id, w.name, w.owner_user_id, p_owner.display_name, sm.product_id, pr.sku_code, pr.sku_name;

DROP VIEW IF EXISTS public.stock_states_view;
CREATE VIEW public.stock_states_view WITH (security_invoker = true) AS
SELECT sm.warehouse_id, w.name AS warehouse_name, w.owner_user_id, p_owner.display_name AS owner_name,
  sm.product_id, pr.sku_code, pr.sku_name,
  SUM(CASE WHEN sm.movement_type IN ('INBOUND_RECEIVE', 'ADJUSTMENT', 'STOCK_CORRECTION', 'INBOUND') THEN sm.qty_change WHEN sm.movement_type = 'DELIVERY_ACCEPTED' THEN sm.qty_change ELSE 0 END) AS real_stock,
  SUM(CASE WHEN sm.movement_type = 'ORDER_RESERVE' THEN -sm.qty_change WHEN sm.movement_type = 'ORDER_UNRESERVE' THEN sm.qty_change WHEN sm.movement_type = 'DRIVER_PICKUP' THEN sm.qty_change ELSE 0 END) AS reserved_stock,
  SUM(CASE WHEN sm.movement_type = 'DRIVER_PICKUP' THEN -sm.qty_change WHEN sm.movement_type IN ('DELIVERY_ACCEPTED', 'DRIVER_RETURN_SUBMIT') THEN sm.qty_change ELSE 0 END) AS in_transit_stock,
  SUM(CASE WHEN sm.movement_type = 'DRIVER_RETURN_SUBMIT' THEN -sm.qty_change WHEN sm.movement_type = 'RUNNER_RETURN_ACK' THEN sm.qty_change ELSE 0 END) AS returned_pending_stock,
  SUM(sm.qty_change) AS total_stock, MAX(sm.created_at) AS last_movement_time
FROM public.stock_movements sm JOIN public.warehouses w ON w.id = sm.warehouse_id
LEFT JOIN public.profiles p_owner ON p_owner.id = w.owner_user_id LEFT JOIN public.products pr ON pr.id = sm.product_id
WHERE w.owner_user_id = auth.uid() OR public.get_user_role(auth.uid()) = 'admin' OR public.can_view_stock(w.owner_user_id, auth.uid())
GROUP BY sm.warehouse_id, w.name, w.owner_user_id, p_owner.display_name, sm.product_id, pr.sku_code, pr.sku_name;

DROP VIEW IF EXISTS public.driver_latest_location;
CREATE VIEW public.driver_latest_location WITH (security_invoker = true) AS
SELECT DISTINCT ON (dl.driver_id) dl.id, dl.driver_id, p.display_name AS driver_name, dl.latitude, dl.longitude, dl.accuracy, dl.speed, dl.heading, dl.recorded_at
FROM public.driver_locations dl JOIN public.profiles p ON p.id = dl.driver_id
WHERE dl.driver_id = auth.uid() OR EXISTS (SELECT 1 FROM public.runner_drivers rd WHERE rd.runner_id = auth.uid() AND rd.driver_id = dl.driver_id AND rd.is_active = true) OR public.get_user_role(auth.uid()) = 'admin'
ORDER BY dl.driver_id, dl.recorded_at DESC;

DROP VIEW IF EXISTS public.driver_monthly_ranking;
CREATE VIEW public.driver_monthly_ranking WITH (security_invoker = true) AS
SELECT o.driver_id, p_driver.display_name AS driver_name, rd.runner_id, p_runner.display_name AS runner_name, to_char(o.delivered_at, 'YYYY-MM') AS month,
  COUNT(*) FILTER (WHERE o.operational_status = 'delivered') AS delivered_count, COUNT(*) FILTER (WHERE o.operational_status = 'failed') AS failed_count,
  SUM(o.total_amount) FILTER (WHERE o.operational_status = 'delivered') AS total_amount,
  RANK() OVER (PARTITION BY rd.runner_id, to_char(o.delivered_at, 'YYYY-MM') ORDER BY COUNT(*) FILTER (WHERE o.operational_status = 'delivered') DESC) AS rank_in_team
FROM public.orders o JOIN public.runner_drivers rd ON rd.driver_id = o.driver_id
LEFT JOIN public.profiles p_driver ON p_driver.id = o.driver_id LEFT JOIN public.profiles p_runner ON p_runner.id = rd.runner_id
WHERE o.delivered_at IS NOT NULL AND (o.driver_id = auth.uid() OR rd.runner_id = auth.uid() OR public.get_user_role(auth.uid()) = 'admin')
GROUP BY o.driver_id, p_driver.display_name, rd.runner_id, p_runner.display_name, to_char(o.delivered_at, 'YYYY-MM');

-- 4. FIX: Overly permissive INSERT policies
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "users_insert_own_audit_logs" ON public.audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND (actor_id IS NULL OR actor_id = auth.uid()));

DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
CREATE POLICY "authorized_create_notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND (user_id = auth.uid() OR public.get_user_role(auth.uid()) IN ('admin', 'runner')));

DROP POLICY IF EXISTS "System can insert claim batches" ON public.claim_batches;
CREATE POLICY "runners_create_own_claim_batches" ON public.claim_batches FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND runner_id = auth.uid() AND public.get_user_role(auth.uid()) IN ('runner', 'admin'));

DROP POLICY IF EXISTS "System can insert claim batch items" ON public.claim_batch_items;
CREATE POLICY "batch_owner_insert_items" ON public.claim_batch_items FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.claim_batches cb WHERE cb.id = claim_batch_items.batch_id AND cb.runner_id = auth.uid()));

DROP POLICY IF EXISTS "System can insert snapshots" ON public.daily_task_snapshots;
CREATE POLICY "users_insert_own_snapshots" ON public.daily_task_snapshots FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND owner_user_id = auth.uid());

DROP POLICY IF EXISTS "System can insert reschedule history" ON public.reschedule_history;
CREATE POLICY "authorized_insert_reschedule_history" ON public.reschedule_history FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND (rescheduled_by IS NULL OR rescheduled_by = auth.uid()) AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = reschedule_history.order_id AND (o.salesperson_id = auth.uid() OR o.runner_id = auth.uid() OR o.driver_id = auth.uid() OR public.get_user_role(auth.uid()) = 'admin')));

-- 5. Grant permissions
GRANT SELECT ON public.driver_allocated_stock TO authenticated;
GRANT SELECT ON public.stock_balance_view TO authenticated;
GRANT SELECT ON public.stock_states_view TO authenticated;
GRANT SELECT ON public.driver_latest_location TO authenticated;
GRANT SELECT ON public.driver_monthly_ranking TO authenticated;