export interface FilteredRunnerEarnings {
  total_amount: number;
  total_orders: number;
  pending_amount: number;
  pending_orders: number;
  submitted_amount: number;
  submitted_orders: number;
  approved_amount: number;
  approved_orders: number;
}

interface DeliveredOrderForEarnings {
  area?: string | null;
  reconciliation_status?: string | null;
}

export function summarizeFilteredRunnerEarnings(
  orders: DeliveredOrderForEarnings[],
  approvedChargeMap: Record<string, number>,
): FilteredRunnerEarnings {
  const summary: FilteredRunnerEarnings = {
    total_amount: 0,
    total_orders: orders.length,
    pending_amount: 0,
    pending_orders: 0,
    submitted_amount: 0,
    submitted_orders: 0,
    approved_amount: 0,
    approved_orders: 0,
  };

  for (const order of orders) {
    const area = order.area?.trim().toLowerCase() || '';
    const fee = area ? Number(approvedChargeMap[area] ?? 0) : 0;
    summary.total_amount += fee;

    if (order.reconciliation_status === 'NOT_CLAIMED') {
      summary.pending_amount += fee;
      summary.pending_orders += 1;
    } else if (
      order.reconciliation_status === 'ADMIN_ACK_PENDING'
      || order.reconciliation_status === 'SP_ACK_PENDING'
    ) {
      summary.submitted_amount += fee;
      summary.submitted_orders += 1;
    } else if (
      order.reconciliation_status === 'CLAIMED'
      || order.reconciliation_status === 'SETTLED'
    ) {
      summary.approved_amount += fee;
      summary.approved_orders += 1;
    }
  }

  return summary;
}
