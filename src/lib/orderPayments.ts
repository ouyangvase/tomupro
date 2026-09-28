/** BND amounts cross the UI boundary as decimal text; arithmetic uses cents. */
export function paymentMinorUnits(value: string | number): number {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new Error('Enter a non-negative BND amount with at most two decimal places.');
  }
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 999999999999) {
    throw new Error('BND amount is too large.');
  }
  return cents;
}

export type CustomerPayment = {
  id: string;
  order_id: string;
  payment_type: 'BANK_TRANSFER' | 'COD';
  amount: string | number;
  status: 'pending' | 'confirmed' | 'rejected' | 'voided';
  receipt_url: string | null;
  reverses_payment_id?: string | null;
};

export function paymentBreakdown(orderId: string, total: string | number, payments: CustomerPayment[]) {
  const totalMinor = paymentMinorUnits(total);
  let transferMinor = 0;
  let cashMinor = 0;
  const byId = new Map<string, CustomerPayment>();
  const reversed = new Set<string>();
  for (const payment of payments) {
    if (payment.order_id !== orderId) throw new Error('Payment belongs to another order.');
    if (byId.has(payment.id)) throw new Error('Duplicate payment.');
    byId.set(payment.id, payment);
  }
  for (const payment of payments) {
    const amount = paymentMinorUnits(payment.amount);
    if (payment.status !== 'confirmed') continue;
    if (payment.reverses_payment_id) {
      const original = byId.get(payment.reverses_payment_id);
      if (!original || original.status !== 'confirmed' || original.reverses_payment_id ||
          original.payment_type !== payment.payment_type || paymentMinorUnits(original.amount) !== amount ||
          reversed.has(original.id)) {
        throw new Error('Invalid or duplicate payment reversal.');
      }
      reversed.add(original.id);
    }
    const signedAmount = payment.reverses_payment_id ? -amount : amount;
    if (payment.payment_type === 'BANK_TRANSFER') transferMinor += signedAmount;
    else cashMinor += signedAmount;
  }
  if (transferMinor < 0 || cashMinor < 0 || transferMinor > totalMinor) {
    throw new Error('Confirmed payments do not match the order total.');
  }
  const collectedMinor = transferMinor + cashMinor;
  return {
    orderTotal: totalMinor / 100,
    transferPaid: transferMinor / 100,
    codDue: Math.max(totalMinor - transferMinor, 0) / 100,
    codCollected: cashMinor / 100,
    totalCollected: collectedMinor / 100,
    outstanding: Math.max(totalMinor - collectedMinor, 0) / 100,
    overpaid: Math.max(collectedMinor - totalMinor, 0) / 100,
    paymentStatus: collectedMinor >= totalMinor ? 'PAID' as const : 'UNPAID' as const,
  };
}

export const ASSIGNED_PAYMENT_ERROR = 'Driver is already assigned. Unassign the driver before changing payment details that affect the COD amount.';
export const LOCKED_PAYMENT_ERROR = 'Payment editing is locked after pickup or delivery. Use a Finance Payment Correction.';

export type PaymentEditState = {
  driverId: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
};

/** UI guidance only; the database must independently enforce the same rules. */
export function paymentEditError(state: PaymentEditState, oldCod: number, newCod: number): string | null {
  if (state.pickedUpAt || state.deliveredAt) return LOCKED_PAYMENT_ERROR;
  if (state.driverId && paymentMinorUnits(oldCod) !== paymentMinorUnits(newCod)) return ASSIGNED_PAYMENT_ERROR;
  return null;
}

export function unassignPaymentError(state: PaymentEditState, reason: string): string | null {
  if (state.pickedUpAt || state.deliveredAt) return LOCKED_PAYMENT_ERROR;
  if (!reason.trim()) return 'An audit reason is required to unassign the driver.';
  return null;
}
