import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260812070157_enforce_one_current_order_lifecycle.sql'),
  'utf8',
);
const futureRescheduleMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260815130000_keep_future_reschedules_out_of_ready_queue.sql'),
  'utf8',
);
const lifecycleSecurityMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260815160000_restore_booking_ready_lifecycle_security.sql'),
  'utf8',
);
const actionResolutionMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260815210000_resolve_action_required_lifecycle_atomically.sql'),
  'utf8',
);
const orderWriteSecurityMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260815220000_restore_driver_assignment_trigger_security.sql'),
  'utf8',
);
const orderWriteBoundaryMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260815223000_remove_private_schema_dependency_from_order_write_trigger.sql'),
  'utf8',
);
const cancelledRestoreMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260817103000_allow_cancelled_order_restore.sql'),
  'utf8',
);
const atomicReadyResolutionMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260818143000_atomic_action_required_ready_resolution.sql'),
  'utf8',
);
const scheduledReopenMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260818150000_reopen_rescheduled_orders_without_auto_action.sql'),
  'utf8',
);
const earlyDeliveryTomorrowMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260818174916_prevent_early_delivery_tomorrow_reopen.sql'),
  'utf8',
);
const futureRescheduledReadyMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260818175727_prevent_future_rescheduled_ready_state.sql'),
  'utf8',
);
const deliveryTomorrowAcceptanceMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260819090000_delivery_tomorrow_accept_preserves_order_state.sql'),
  'utf8',
);
const deliveryTomorrowResultTypeMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260821122705_delivery_tomorrow_accept_result_type_guard.sql'),
  'utf8',
);
const driverReviewActionRequiredMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260820092702_route_non_delivery_tomorrow_reviews_to_action_required.sql'),
  'utf8',
);
const driverFailureDetailsMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260820095108_preserve_driver_failure_details_for_action_queue.sql'),
  'utf8',
);
const lifecycleSchedulingMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260818120000_fix_order_journey_and_reschedule_lifecycle.sql'),
  'utf8',
);
const autoRescheduleRpcMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260819133030_restore_set_order_auto_reschedule_rpc.sql'),
  'utf8',
);
const autoRescheduleEnumMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260819134441_cast_auto_reschedule_runner_status_enum.sql'),
  'utf8',
);
const useOrdersSource = readFileSync(resolve(process.cwd(), 'src/hooks/useOrders.ts'), 'utf8');
const actionResolutionSource = readFileSync(resolve(process.cwd(), 'src/components/sales/ActionResolutionDialog.tsx'), 'utf8');
const cancelOrdersSource = readFileSync(resolve(process.cwd(), 'src/hooks/useCancelOrder.ts'), 'utf8');
const autoRescheduleSource = readFileSync(resolve(process.cwd(), 'src/hooks/useAutoReschedule.ts'), 'utf8');
const cancelledSalesSource = readFileSync(resolve(process.cwd(), 'src/pages/sales/CancelledSales.tsx'), 'utf8');
const actionInboxSource = readFileSync(resolve(process.cwd(), 'src/pages/sales/SalespersonActionInbox.tsx'), 'utf8');
const driverInboxSource = readFileSync(resolve(process.cwd(), 'src/pages/driver/DriverInbox.tsx'), 'utf8');
const bulkActionResolutionSource = readFileSync(resolve(process.cwd(), 'src/components/sales/BulkActionResolutionDialog.tsx'), 'utf8');
const driverAssignmentAuthorityMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260827090000_separate_lifecycle_and_driver_assignment_authority.sql'),
  'utf8',
);

describe('canonical order lifecycle database contract', () => {
  it('stores one non-null state and recalculates it inside the row trigger', () => {
    expect(migration).toContain('current_operational_state text');
    expect(migration).toContain('ALTER COLUMN current_operational_state SET NOT NULL');
    expect(migration).toContain('orders_current_operational_state_check');
    expect(migration).toContain('NEW.current_operational_state := private.order_current_operational_state');
  });

  it('guards concurrent transitions with a row lock and expected state', () => {
    expect(migration).toContain('FOR UPDATE;');
    expect(migration).toContain('Stale lifecycle state');
    expect(migration).toContain("USING ERRCODE = '40001'");
  });

  it('exposes health/reconciliation and routes search/delivered reads to canonical state', () => {
    expect(migration).toContain('get_order_lifecycle_health');
    expect(migration).toContain('reconcile_order_lifecycle');
    expect(migration).toContain("o.current_operational_state = 'DELIVERED'");
    expect(migration).toContain('o.current_operational_state,');
  });

  it('routes generic lifecycle writes through the guarded transition service', () => {
    expect(useOrdersSource).toContain('transitionOrderLifecycle');
    expect(cancelOrdersSource).toContain("toState: 'CANCELLED'");
    expect(autoRescheduleSource).toContain("set_order_auto_reschedule");
  });

  it('restores only the Booking auto-reschedule RPC and preserves the scheduled Runner flow', () => {
    expect(autoRescheduleRpcMigration).toContain('CREATE OR REPLACE FUNCTION public.set_order_auto_reschedule(');
    expect(autoRescheduleRpcMigration).toContain('expected_pickup_date = p_next_delivery_date');
    expect(autoRescheduleRpcMigration).toContain('runner_id = p_runner_id');
    expect(autoRescheduleRpcMigration).toContain("NOTIFY pgrst, 'reload schema'");
    expect(autoRescheduleRpcMigration).not.toContain('cron.schedule');
    expect(autoRescheduleRpcMigration).not.toContain('CREATE OR REPLACE FUNCTION public.reopen_rescheduled_orders()');
  });

  it('casts the selected Runner status to the database enum', () => {
    expect(autoRescheduleEnumMigration).toContain("'UNASSIGNED'::runner_status");
    expect(autoRescheduleEnumMigration).toContain("'ASSIGNED'::runner_status");
    expect(autoRescheduleEnumMigration).toContain('set_order_auto_reschedule runner_status expression');
  });

  it('uses an explicit, scoped reopen path for cancelled order restoration', () => {
    expect(cancelledRestoreMigration).toContain('p_allow_reopen boolean DEFAULT false');
    expect(cancelledRestoreMigration).toContain("v_from_state = 'CANCELLED'");
    expect(cancelledRestoreMigration).toContain("v_to_state IN ('BOOKING', 'READY')");
    expect(cancelledRestoreMigration).toContain('reopened_at = CASE WHEN v_is_explicit_cancelled_reopen THEN now()');
    expect(cancelledSalesSource).toContain('allowReopen: true');
  });

  it('keeps future reschedules out of the Ready dispatch boundary', () => {
    expect(futureRescheduleMigration).toContain("NEW.status := 'BOOKING'::order_status");
    expect(futureRescheduleMigration).toContain("NEW.reschedule_flag := true");
    expect(futureRescheduleMigration).toContain('schedule_driver_failed_orders_for_tomorrow');
    expect(futureRescheduleMigration).toContain("operational_status = ''RESCHEDULED''");
    expect(futureRescheduleMigration).toContain('private.is_runner_dispatch_date_due');
    expect(futureRescheduleMigration).toContain("nonbooking_ready_date_cleared");
    expect(futureRescheduleMigration).toContain("FUTURE_RESCHEDULE_DATE_RESTORED");
  });

  it('runs the lifecycle trigger with private-schema owner privileges', () => {
    expect(lifecycleSecurityMigration).toContain('ALTER FUNCTION private.enforce_final_order_lifecycle()');
    expect(lifecycleSecurityMigration).toContain('SECURITY DEFINER');
    expect(lifecycleSecurityMigration).toContain('SET search_path TO public, pg_temp');
    expect(lifecycleSecurityMigration).toContain('REVOKE ALL ON FUNCTION private.enforce_final_order_lifecycle()');
  });

  it('releases active Driver assignments atomically during Salesperson resolution', () => {
    expect(actionResolutionMigration).toContain('CREATE OR REPLACE FUNCTION public.transition_order_lifecycle');
    expect(actionResolutionMigration).toContain("v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN NULL");
    expect(actionResolutionMigration).toContain("v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN 'UNASSIGNED'");
    expect(actionResolutionMigration).toContain('driver_next_delivery_date');
    expect(actionResolutionMigration).toContain('GRANT EXECUTE ON FUNCTION public.transition_order_lifecycle');
  });

  it('keeps Salesperson lifecycle conversions out of Driver assignment writes', () => {
    const bulkBookingBranch = bulkActionResolutionSource.split("resolutionType === 'CONVERT_TO_BOOKING'")[1]?.split("resolutionType === 'CANCEL'")[0] || '';
    const actionBookingBranch = actionResolutionSource.split("resolutionType === 'CONVERT_TO_BOOKING'")[1]?.split("resolutionType === 'CONVERT_TO_READY'")[0] || '';

    expect(bulkBookingBranch).not.toMatch(/driver_[a-z_]+\s*:/);
    expect(actionBookingBranch).not.toMatch(/driver_[a-z_]+\s*:/);
    expect(driverAssignmentAuthorityMigration).toContain("v_role IN ('runner', 'runner_assistant')");
    expect(driverAssignmentAuthorityMigration).not.toContain("v_role = 'admin'");
    expect(driverAssignmentAuthorityMigration).toContain('Lifecycle transitions may clear Driver assignment fields');
  });

  it('resolves Action Required to Ready atomically and blocks stale legacy writes', () => {
    expect(atomicReadyResolutionMigration).toContain('CREATE OR REPLACE FUNCTION public.resolve_action_required_to_ready');
    expect(atomicReadyResolutionMigration).toContain('SECURITY DEFINER');
    expect(atomicReadyResolutionMigration).toContain('FOR UPDATE;');
    expect(atomicReadyResolutionMigration).toContain("v_from_state IS DISTINCT FROM 'ACTION_REQUIRED'");
    expect(atomicReadyResolutionMigration).toContain("runner_review_status = 'NOT_REVIEWED'");
    expect(atomicReadyResolutionMigration).toContain('ACTION_REQUIRED_RESOLVED_TO_READY');
    expect(atomicReadyResolutionMigration).toContain('normalize_explicit_ready_conversion');
    expect(atomicReadyResolutionMigration).not.toContain('order_ref,');
    expect(atomicReadyResolutionMigration).not.toContain('action_type,');
    expect(actionResolutionSource).toContain("callSupabaseRpc('resolve_action_required_to_ready'");
    expect(actionResolutionSource).not.toContain("status: 'READY',\n          salesperson_action_required");
  });

  it('never lets scheduled reopen create Action Required', () => {
    expect(scheduledReopenMigration).toContain('CREATE OR REPLACE FUNCTION public.reopen_rescheduled_orders()');
    expect(scheduledReopenMigration).toContain('Scheduled reopen is not a user action');
    expect(scheduledReopenMigration).toContain("status = 'READY'::order_status");
    expect(scheduledReopenMigration).toContain('salesperson_action_required = false');
    expect(scheduledReopenMigration).toContain('Manual runner assignment required.');
    expect(scheduledReopenMigration).toContain('FOR UPDATE OF o');
    expect(scheduledReopenMigration).not.toContain('salesperson_action_required = true');
    expect(scheduledReopenMigration).not.toContain('order_ref,');
    expect(scheduledReopenMigration).not.toContain('action_type,');
    expect(lifecycleSchedulingMigration).not.toContain('SELECT public.reopen_rescheduled_orders();');
  });

  it('does not move a future Delivery Tomorrow order into Ready', () => {
    expect(earlyDeliveryTomorrowMigration).toContain('NEW.next_delivery_date IS NOT NULL');
    expect(earlyDeliveryTomorrowMigration).toContain("NEW.next_delivery_date <= (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date");
    expect(earlyDeliveryTomorrowMigration).toContain("NEW.status := 'BOOKING'::public.order_status");
    expect(earlyDeliveryTomorrowMigration).toContain("NEW.reschedule_flag := true");
    expect(earlyDeliveryTomorrowMigration).toContain('EARLY_READY_RESCHEDULE_REPAIRED');
  });

  it('blocks future reschedule outcomes from bypassing the Booking boundary', () => {
    expect(futureRescheduledReadyMigration).toContain('prevent_future_rescheduled_ready_state');
    expect(futureRescheduledReadyMigration).toContain("NEW.status := 'BOOKING'::public.order_status");
    expect(futureRescheduledReadyMigration).toContain("NEW.reschedule_flag := true");
    expect(futureRescheduledReadyMigration).toContain('FUTURE_RESCHEDULED_READY_REPAIRED');
  });

  it('keeps exact Delivery Tomorrow acceptance state-preserving', () => {
    expect(deliveryTomorrowAcceptanceMigration).toContain("v_normalized_reason = 'delivery tomorrow'");
    expect(deliveryTomorrowAcceptanceMigration).toContain("v_action := 'DRIVER_DELIVERY_TOMORROW_ACCEPTED'");
    expect(deliveryTomorrowAcceptanceMigration).toContain("runner_accept_status = 'ACCEPTED'");
    expect(deliveryTomorrowAcceptanceMigration).toContain("runner_review_status = 'REVIEWED'");
    expect(deliveryTomorrowAcceptanceMigration).toContain("'order_state_unchanged', v_action = 'DRIVER_DELIVERY_TOMORROW_ACCEPTED'");
    expect(deliveryTomorrowAcceptanceMigration).toContain("ELSIF v_order.driver_status = 'DRIVER_FAILED' AND v_is_next_day THEN");
  });

  it('uses the canonical Delivery Tomorrow result type without broadening date-only reschedules', () => {
    expect(deliveryTomorrowResultTypeMigration).toContain("v_attempt.result_type = 'DRIVER_DELIVERY_TOMORROW_SUBMITTED'");
    expect(deliveryTomorrowResultTypeMigration).toContain("v_normalized_reason = 'delivery tomorrow'");
    expect(deliveryTomorrowResultTypeMigration).not.toContain("v_requested_date = v_submission_date + 1");
    expect(deliveryTomorrowResultTypeMigration).toContain('v_attempt.result_type');
  });

  it('routes every non-Delivery-Tomorrow accepted Driver failure to Action Required', () => {
    expect(driverReviewActionRequiredMigration).toContain("salesperson_action_required = true");
    expect(driverReviewActionRequiredMigration).toContain("salesperson_action_type = 'RESCHEDULE_DELIVERY'");
    expect(driverReviewActionRequiredMigration).toContain("salesperson_action_type = 'FOLLOWUP_CUSTOMER'");
    expect(driverReviewActionRequiredMigration).toContain("a.result_type <> 'DRIVER_DELIVERY_TOMORROW_SUBMITTED'");
    expect(driverReviewActionRequiredMigration).toContain('o.driver_id IS NULL');
    expect(driverReviewActionRequiredMigration).toContain('o.driver_assignment_batch_id IS NULL');
    expect(driverReviewActionRequiredMigration).toContain('current_operational_state NOT IN (\'DELIVERED\', \'CANCELLED\')');
  });

  it('preserves and displays the Driver reason and required remark after review', () => {
    expect(driverFailureDetailsMigration).toContain('v_order.driver_failed_reason, v_attempt.failure_reason');
    expect(driverFailureDetailsMigration).toContain('v_order.driver_failed_remark, v_attempt.remark');
    expect(driverFailureDetailsMigration).toContain("da.result_type IN (");
    expect(driverFailureDetailsMigration).toContain("o.current_operational_state = 'ACTION_REQUIRED'");
    expect(actionInboxSource).toContain('order.driver_failed_reason || order.failed_reason');
    expect(actionInboxSource).toContain('order.driver_failed_remark || order.failed_remark || order.runner_comment');
    expect(driverInboxSource).toContain('Additional details (optional)');
  });

  it('keeps direct order writes independent of private-schema client access', () => {
    expect(orderWriteSecurityMigration).toContain('ALTER FUNCTION private.guard_driver_assignment_lifecycle_state()');
    expect(orderWriteSecurityMigration).toContain('SECURITY DEFINER');
    expect(orderWriteSecurityMigration).toContain('SET search_path TO public, pg_temp');
    expect(orderWriteSecurityMigration).toContain('REVOKE ALL ON FUNCTION private.guard_driver_assignment_lifecycle_state()');
  });

  it('does not call private helpers from the READY/BOOKING order-write trigger', () => {
    expect(orderWriteBoundaryMigration).toContain('CREATE OR REPLACE FUNCTION public.normalize_ready_reschedule_consistency()');
    expect(orderWriteBoundaryMigration).toContain('SET search_path = public, pg_temp');
    expect(orderWriteBoundaryMigration).not.toContain('private.is_pending_driver_delivery_review');
    expect(orderWriteBoundaryMigration).toContain("upper(COALESCE(NEW.runner_accept_status::text, 'PENDING'))");
    expect(orderWriteBoundaryMigration).toContain('REVOKE ALL ON FUNCTION public.normalize_ready_reschedule_consistency()');
  });
});
