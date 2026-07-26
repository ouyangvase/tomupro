-- One canonical source for Runner Inbox and Runner Dashboard workload metrics.
CREATE OR REPLACE FUNCTION public.get_dashboard_stats_runner(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  today_start TIMESTAMPTZ :=
    date_trunc('day', now() AT TIME ZONE 'Asia/Kuala_Lumpur')
      AT TIME ZONE 'Asia/Kuala_Lumpur';
  tomorrow_start TIMESTAMPTZ;
BEGIN
  tomorrow_start := today_start + interval '1 day';

  SELECT json_build_object(
    'totalActive', COUNT(*) FILTER (
      WHERE status = 'READY'
        AND runner_status IN ('ASSIGNED', 'TAKEN')
    ),
    'assignedCount', COUNT(*) FILTER (
      WHERE status = 'READY'
        AND runner_status = 'ASSIGNED'
    ),
    'takenCount', COUNT(*) FILTER (
      WHERE status = 'READY'
        AND runner_status = 'TAKEN'
    ),
    'noDriverCount', COUNT(*) FILTER (
      WHERE status = 'READY'
        AND runner_status IN ('ASSIGNED', 'TAKEN')
        AND driver_id IS NULL
    ),
    'deliveredToday', COUNT(*) FILTER (
      WHERE runner_status = 'DELIVERED'
        AND delivered_at >= today_start
        AND delivered_at < tomorrow_start
    ),
    'failedToday', COUNT(*) FILTER (
      WHERE runner_status = 'FAILED_DELIVERY'
        AND updated_at >= today_start
        AND updated_at < tomorrow_start
    ),
    'totalDelivered', COUNT(*) FILTER (
      WHERE runner_status = 'DELIVERED'
    ),
    'totalFailed', COUNT(*) FILTER (
      WHERE runner_status = 'FAILED_DELIVERY'
    ),
    'activeValue', COALESCE(SUM(total_amount) FILTER (
      WHERE status = 'READY'
        AND runner_status IN ('ASSIGNED', 'TAKEN')
    ), 0),
    'deliveredTodayValue', COALESCE(SUM(total_amount) FILTER (
      WHERE runner_status = 'DELIVERED'
        AND delivered_at >= today_start
        AND delivered_at < tomorrow_start
    ), 0),
    'pendingClaimCount', COUNT(*) FILTER (
      WHERE runner_status = 'DELIVERED'
        AND reconciliation_status = 'NOT_CLAIMED'
    ),
    'pendingClaimValue', COALESCE(SUM(total_amount) FILTER (
      WHERE runner_status = 'DELIVERED'
        AND reconciliation_status = 'NOT_CLAIMED'
    ), 0),
    'submittedClaimCount', COUNT(*) FILTER (
      WHERE reconciliation_status = 'ADMIN_ACK_PENDING'
    ),
    'submittedClaimValue', COALESCE(SUM(total_amount) FILTER (
      WHERE reconciliation_status = 'ADMIN_ACK_PENDING'
    ), 0),
    'approvedClaimValue', COALESCE(SUM(total_amount) FILTER (
      WHERE runner_status = 'DELIVERED'
        AND reconciliation_status::text IN ('CLAIMED', 'SETTLED')
    ), 0),
    'failedOrdersCount', COUNT(*) FILTER (
      WHERE runner_status = 'FAILED_DELIVERY'
    ),
    'driverIssuesCount', COUNT(*) FILTER (
      WHERE status = 'READY'
        AND runner_status IN ('ASSIGNED', 'TAKEN')
        AND driver_id IS NOT NULL
        AND updated_at < now() - interval '24 hours'
    ),
    'missingDeliveryChargesCount', (
      SELECT COUNT(DISTINCT pending.area)
      FROM public.orders pending
      WHERE pending.runner_id = p_user_id
        AND pending.runner_status = 'DELIVERED'
        AND pending.reconciliation_status = 'NOT_CLAIMED'
        AND pending.area IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.delivery_charges charge
          WHERE charge.runner_id = p_user_id
            AND lower(charge.area) = lower(pending.area)
            AND charge.status = 'APPROVED'
            AND charge.superseded_at IS NULL
        )
    )
  ) INTO result
  FROM public.orders
  WHERE runner_id = p_user_id
    AND status <> 'CANCELLED';

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats_runner(UUID) TO authenticated;
