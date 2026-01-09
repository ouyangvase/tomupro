-- BACKFILL: Clean up Action Required data
-- Step 1: Clear salesperson_action_required for orders that are already resolved
-- (CANCELLED, DELIVERED without pending flags, or moved to other statuses without pending action)
UPDATE public.orders
SET salesperson_action_required = false
WHERE salesperson_action_required = true
  AND (
    -- Already cancelled
    status = 'CANCELLED'
    -- Delivered and no pending runner notes
    OR (runner_status = 'DELIVERED' AND runner_failed_reason_id IS NULL AND runner_comment IS NULL AND next_delivery_date IS NULL)
    -- Already in READY status with assigned runner (action was taken)
    OR (status = 'READY' AND runner_id IS NOT NULL AND runner_status IN ('ASSIGNED', 'TAKEN'))
  );

-- Step 2: Ensure orders that SHOULD require action have the flag set
-- These are orders with FAILED_DELIVERY, next_delivery_date, or runner notes that haven't been resolved
UPDATE public.orders
SET salesperson_action_required = true
WHERE salesperson_action_required IS NOT TRUE
  AND status NOT IN ('CANCELLED')
  AND (
    -- Failed delivery needs resolution
    runner_status = 'FAILED_DELIVERY'
    -- Has a pending reschedule date but hasn't been actioned
    OR (next_delivery_date IS NOT NULL AND status NOT IN ('READY') AND runner_status IN ('UNASSIGNED', 'FAILED_DELIVERY'))
  );