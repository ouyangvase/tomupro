export type OrderPaymentPlan = 'COD' | 'PARTIAL_TRANSFER_COD' | 'TRANSFER';

export interface PaymentBreakdown {
  totalAmount: number;
  transferPaidAmount: number;
  codDueAmount: number;
}

function money(value: number | string | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export function calculatePaymentBreakdown(
  totalAmount: number | string | null | undefined,
  confirmedTransferAmount: number | string | null | undefined,
): PaymentBreakdown {
  const total = Math.max(0, money(totalAmount));
  const transfer = Math.max(0, Math.min(total, money(confirmedTransferAmount)));

  return {
    totalAmount: total,
    transferPaidAmount: transfer,
    codDueAmount: Math.max(0, Math.round((total - transfer) * 100) / 100),
  };
}

export function paymentPlanValues(
  plan: OrderPaymentPlan,
  totalAmount: number | string | null | undefined,
  transferAmount: number | string | null | undefined,
) {
  const total = Math.max(0, money(totalAmount));
  const requestedTransfer = money(transferAmount);

  if (plan === 'COD') return { paymentMethod: 'COD' as const, transferAmount: 0, codAmount: total };
  if (plan === 'TRANSFER') return { paymentMethod: 'TRANSFER' as const, transferAmount: total, codAmount: 0 };

  return {
    paymentMethod: 'COD' as const,
    transferAmount: Math.max(0, Math.min(total, requestedTransfer)),
    codAmount: Math.max(0, Math.round((total - Math.max(0, Math.min(total, requestedTransfer))) * 100) / 100),
  };
}

export type OrderPaymentFields = {
  total_amount?: number | string | null;
  cod_amount?: number | string | null;
  cod_due_amount?: number | string | null;
  payment_method?: string | null;
  payment_plan?: string | null;
  receipt_status?: string | null;
  payment_history_unverified?: boolean;
  driver_cash_amount?: number | string | null;
  driver_transfer_amount?: number | string | null;
};

export function hasCustomerTransfer(order: OrderPaymentFields) {
  return order.payment_plan === 'PARTIAL_TRANSFER_COD' || order.payment_plan === 'TRANSFER' || order.payment_method === 'TRANSFER';
}

/** A fully prepaid order must never be collected as cash at delivery. */
export function isPureTransferOrder(order: OrderPaymentFields) {
  return order.payment_plan === 'TRANSFER'
    || (order.payment_method === 'TRANSFER' && order.payment_plan !== 'PARTIAL_TRANSFER_COD');
}

export function orderCollectionAmount(order: OrderPaymentFields) {
  if (order.cod_due_amount != null) return Math.max(0, money(order.cod_due_amount));
  if (order.payment_plan && hasCustomerTransfer(order) && order.receipt_status !== 'confirmed') {
    return Math.max(0, money(order.total_amount));
  }
  if (order.cod_amount !== null && order.cod_amount !== undefined) {
    return Math.max(0, money(order.cod_amount));
  }
  return order.payment_method === 'COD' ? Math.max(0, money(order.total_amount)) : 0;
}

export function orderCodDue(order: OrderPaymentFields) {
  if (order.payment_history_unverified) return 0;
  return Math.max(0, money(orderCollectionAmount(order) - Math.max(0, money(order.driver_cash_amount)) - Math.max(0, money(order.driver_transfer_amount))));
}

export function orderPaymentBreakdown(order: OrderPaymentFields) {
  const totalAmount = Math.max(0, money(order.total_amount));
  const transferAmount = hasCustomerTransfer(order) ? Math.max(0, money(totalAmount - money(order.cod_amount))) : 0;
  const transferPaid = order.receipt_status === 'confirmed' ? transferAmount : 0;
  const codCollected = Math.min(Math.max(0, money(order.cod_amount ?? orderCollectionAmount(order))), Math.max(0, money(order.driver_cash_amount)) + Math.max(0, money(order.driver_transfer_amount)));
  const totalCollected = money(transferPaid + codCollected);
  const outstanding = Math.max(0, money(totalAmount - totalCollected));
  return { totalAmount, transferAmount, transferPaid, codDue: orderCodDue(order), codCollected, totalCollected,
    outstanding: order.payment_history_unverified ? null : outstanding,
    paymentStatus: order.payment_history_unverified ? 'REVIEW' : outstanding === 0 ? 'PAID' : totalCollected > 0 ? 'PARTIAL' : 'UNPAID' };
}

export function validateTransferAmount(total: number, transfer: number) {
  if (!Number.isFinite(total) || !Number.isFinite(transfer) || total < 0 || transfer < 0 || transfer > total
    || Math.abs(total * 100 - Math.round(total * 100)) > 0.000001
    || Math.abs(transfer * 100 - Math.round(transfer * 100)) > 0.000001) {
    throw new Error('Enter a BND amount between zero and the order total, with at most two decimal places.');
  }
}
