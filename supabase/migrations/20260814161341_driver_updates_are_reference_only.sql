-- Driver submissions are evidence for Runner review, not direct lifecycle
-- transitions. Keep every Runner/sales control field owned by the old row
-- unless the canonical Driver submission RPC is setting the review marker.
CREATE OR REPLACE FUNCTION public.enforce_driver_column_restriction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_role app_role;
  v_canonical_submission boolean := current_setting('app.driver_submission', true) = 'true';
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role = 'driver' THEN
    -- Order lifecycle, ownership, assignment, finance and inventory fields
    -- cannot be changed from the Driver's direct UPDATE path.
    NEW.status := OLD.status;
    NEW.current_operational_state := OLD.current_operational_state;
    NEW.operational_status := OLD.operational_status;
    NEW.runner_status := OLD.runner_status;
    NEW.delivered_at := OLD.delivered_at;
    NEW.cancelled_at := OLD.cancelled_at;
    NEW.cancelled_by := OLD.cancelled_by;
    NEW.cancel_reason := OLD.cancel_reason;
    NEW.cancel_notes := OLD.cancel_notes;
    NEW.stock_deducted := OLD.stock_deducted;
    NEW.inventory_deducted_at := OLD.inventory_deducted_at;
    NEW.fulfillment_warehouse_id := OLD.fulfillment_warehouse_id;
    NEW.reconciliation_status := OLD.reconciliation_status;
    NEW.salesperson_id := OLD.salesperson_id;
    NEW.runner_id := OLD.runner_id;
    NEW.driver_id := OLD.driver_id;
    NEW.driver_assignment_batch_id := OLD.driver_assignment_batch_id;
    NEW.driver_assigned_at := OLD.driver_assigned_at;
    NEW.driver_assigned_by := OLD.driver_assigned_by;
    NEW.total_amount := OLD.total_amount;
    NEW.total_qty := OLD.total_qty;
    NEW.reschedule_flag := OLD.reschedule_flag;
    NEW.reschedule_cycle_no := OLD.reschedule_cycle_no;
    NEW.next_delivery_date := OLD.next_delivery_date;

    -- Only submit_driver_delivery_result may create a new pending review.
    -- A direct Driver UPDATE cannot accept/reject/review its own report.
    IF NOT v_canonical_submission THEN
      NEW.runner_accept_status := OLD.runner_accept_status;
      NEW.runner_review_status := OLD.runner_review_status;
      NEW.runner_final_outcome := OLD.runner_final_outcome;
      NEW.runner_comment := OLD.runner_comment;
      NEW.runner_reviewed_at := OLD.runner_reviewed_at;
      NEW.runner_reviewed_by := OLD.runner_reviewed_by;
      NEW.salesperson_action_required := OLD.salesperson_action_required;
      NEW.salesperson_action_type := OLD.salesperson_action_type;
      NEW.salesperson_action_due_date := OLD.salesperson_action_due_date;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
