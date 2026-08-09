export type DriverAnalyticsCalendarStatus = 'complete' | 'partial' | 'zero' | 'empty';

export type DriverAnalyticsCalendarCell = {
  deliveredOrders: number;
  assignedOrders: number;
  percentage: number;
  label: string;
  status: DriverAnalyticsCalendarStatus;
};

export type DriverAnalyticsDayOrder = {
  assignment_state?: string | null;
  runner_accept_status?: string | null;
  runner_review_status?: string | null;
  runner_final_outcome?: string | null;
};

export type DriverAnalyticsDayBreakdown = {
  assignedOrders: number;
  deliveredOrders: number;
  remainingOrders: number;
  pendingAcceptanceOrders: number;
  acceptedFailedOrders: number;
  rescheduledOrders: number;
  activePendingOrders: number;
  rejectedReopenedOrders: number;
};

function countValue(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

export function getDriverAnalyticsCalendarCell(
  deliveredValue: number | string | null | undefined,
  assignedValue: number | string | null | undefined,
): DriverAnalyticsCalendarCell {
  const deliveredOrders = countValue(deliveredValue);
  const assignedOrders = countValue(assignedValue);

  return {
    deliveredOrders,
    assignedOrders,
    percentage: assignedOrders > 0 ? (deliveredOrders / assignedOrders) * 100 : 0,
    label: `${deliveredOrders} / ${assignedOrders}`,
    status: assignedOrders === 0
      ? 'empty'
      : deliveredOrders === 0
        ? 'zero'
        : deliveredOrders === assignedOrders
          ? 'complete'
          : 'partial',
  };
}

export function summarizeDriverAnalyticsDay(
  orders: DriverAnalyticsDayOrder[],
  assignedValue: number | string | null | undefined,
): DriverAnalyticsDayBreakdown {
  const assignedOrders = countValue(assignedValue);
  let deliveredOrders = 0;
  let pendingAcceptanceOrders = 0;
  let acceptedFailedOrders = 0;
  let rescheduledOrders = 0;
  let activePendingOrders = 0;
  let rejectedReopenedOrders = 0;

  orders.forEach((order) => {
    const state = String(order.assignment_state || '').toUpperCase();
    const finalOutcome = String(order.runner_final_outcome || '').toUpperCase();
    const runnerAcceptStatus = String(order.runner_accept_status || '').toUpperCase();
    const runnerReviewStatus = String(order.runner_review_status || '').toUpperCase();

    if (state === 'DELIVERED') {
      deliveredOrders += 1;
    } else if (state === 'PENDING_ACCEPTANCE') {
      pendingAcceptanceOrders += 1;
    } else if (state === 'FAILED') {
      acceptedFailedOrders += 1;
    } else if (state === 'RESCHEDULED' || finalOutcome === 'RESCHEDULE') {
      rescheduledOrders += 1;
    } else if (state === 'ACTIVE') {
      activePendingOrders += 1;
    } else if (
      state === 'INACTIVE'
      || runnerAcceptStatus === 'REJECTED'
      || runnerReviewStatus === 'REJECTED'
      || runnerReviewStatus === 'ACTION_REQUIRED'
    ) {
      rejectedReopenedOrders += 1;
    } else {
      rejectedReopenedOrders += 1;
    }
  });

  return {
    assignedOrders,
    deliveredOrders,
    remainingOrders: Math.max(assignedOrders - deliveredOrders, 0),
    pendingAcceptanceOrders,
    acceptedFailedOrders,
    rescheduledOrders,
    activePendingOrders,
    rejectedReopenedOrders,
  };
}
