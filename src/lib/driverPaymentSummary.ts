import { getDriverReportedPaymentComponents, type DriverReviewOrder } from '@/lib/driverReviewDateGroups';
import { formatBND } from '@/lib/currency';

export type DriverPaymentCategory = 'CASH' | 'TRANSFER' | 'CASH_TRANSFER' | 'UNKNOWN';
export type DriverPaymentFilter = 'ALL' | DriverPaymentCategory;
export type DriverPaymentSort = 'RECENT' | 'AMOUNT_DESC' | 'AMOUNT_ASC' | 'PAYMENT';

export type DriverPaymentOrder = DriverReviewOrder & {
  order_code?: string | null;
  created_at?: string | null;
  order_date?: string | null;
  driver_failed_at?: string | null;
};

export type DriverPaymentSummary = {
  category: DriverPaymentCategory;
  label: string;
  cashAmount: number;
  transferAmount: number;
  totalAmount: number;
  isDriverReported: boolean;
};

function normalizePaymentMethod(value?: string | null) {
  return String(value || '')
    .toUpperCase()
    .trim()
    .replace(/\s*\+\s*/g, '_')
    .replace(/\s+/g, '_');
}

function categoryLabel(category: DriverPaymentCategory) {
  return category === 'CASH_TRANSFER'
    ? 'CASH + TRANSFER'
    : category === 'UNKNOWN'
      ? 'PAYMENT NOT SET'
      : category;
}

export function getDriverPaymentSummary(order: DriverPaymentOrder): DriverPaymentSummary {
  const { cashAmount, transferAmount } = getDriverReportedPaymentComponents(order);
  const paymentMethod = normalizePaymentMethod(order.driver_payment_method || order.payment_method);
  const isDriverReported = Boolean(
    order.driver_payment_method
      || order.driver_cash_amount != null
      || order.driver_transfer_amount != null,
  );
  const category = cashAmount > 0 && transferAmount > 0
    ? 'CASH_TRANSFER'
    : cashAmount > 0
      ? 'CASH'
      : transferAmount > 0
        ? 'TRANSFER'
        : paymentMethod === 'CASH_TRANSFER'
          ? 'CASH_TRANSFER'
          : paymentMethod === 'TRANSFER' || paymentMethod === 'BANK_TRANSFER'
            ? 'TRANSFER'
            : paymentMethod === 'COD' || paymentMethod === 'CASH'
              ? 'CASH'
              : 'UNKNOWN';
  const totalAmount = cashAmount + transferAmount > 0
    ? cashAmount + transferAmount
    : Number(order.total_amount || 0);

  return {
    category,
    label: categoryLabel(category),
    cashAmount,
    transferAmount,
    totalAmount,
    isDriverReported,
  };
}

/**
 * Classifies only payment explicitly reported by the Driver.
 * The original order payment method is intentionally treated as unrecorded.
 */
export function getDriverRecordedPaymentCategory(order: DriverPaymentOrder): DriverPaymentCategory {
  const paymentMethod = normalizePaymentMethod(order.driver_payment_method);
  const cashAmount = Math.max(0, Number(order.driver_cash_amount || 0));
  const transferAmount = Math.max(0, Number(order.driver_transfer_amount || 0));
  const hasDriverRecord = Boolean(
    order.driver_payment_method
      || order.driver_cash_amount != null
      || order.driver_transfer_amount != null,
  );

  if (!hasDriverRecord) return 'UNKNOWN';
  if (cashAmount > 0 && transferAmount > 0) return 'CASH_TRANSFER';
  if (cashAmount > 0 || paymentMethod === 'CASH') return 'CASH';
  if (transferAmount > 0 || paymentMethod === 'TRANSFER' || paymentMethod === 'BANK_TRANSFER') return 'TRANSFER';
  if (paymentMethod === 'CASH_TRANSFER') return 'CASH_TRANSFER';
  return 'UNKNOWN';
}

/**
 * Formats only the payment values explicitly recorded by the Driver.
 * The regular order payment method is intentionally ignored here.
 */
export function formatDriverPaymentDisplay(order: DriverPaymentOrder) {
  const driverPaymentMethod = normalizePaymentMethod(order.driver_payment_method);
  const orderAmount = Math.max(0, Number(order.total_amount || 0));
  const hasCashAmount = order.driver_cash_amount != null;
  const hasTransferAmount = order.driver_transfer_amount != null;

  if (!driverPaymentMethod && !hasCashAmount && !hasTransferAmount) {
    return 'Not recorded';
  }

  const cashAmount = hasCashAmount
    ? Math.max(0, Number(order.driver_cash_amount))
    : driverPaymentMethod === 'CASH'
      ? orderAmount
      : driverPaymentMethod === 'CASH_TRANSFER' && hasTransferAmount
        ? Math.max(0, orderAmount - Number(order.driver_transfer_amount))
        : 0;
  const transferAmount = hasTransferAmount
    ? Math.max(0, Number(order.driver_transfer_amount))
    : driverPaymentMethod === 'TRANSFER' || driverPaymentMethod === 'BANK_TRANSFER'
      ? orderAmount
      : driverPaymentMethod === 'CASH_TRANSFER' && hasCashAmount
        ? Math.max(0, orderAmount - Number(order.driver_cash_amount))
        : 0;

  const parts = [
    cashAmount > 0 ? `Cash · ${formatBND(cashAmount)}` : null,
    transferAmount > 0 ? `Transfer · ${formatBND(transferAmount)}` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join(' + ') || 'Not recorded';
}

export function getDriverPaymentFilterLabel(filter: DriverPaymentFilter) {
  return filter === 'ALL' ? 'All payments' : categoryLabel(filter);
}

export function filterDriverPaymentOrders<T extends DriverPaymentOrder>(
  orders: T[],
  filter: DriverPaymentFilter,
) {
  if (filter === 'ALL') return orders;
  return orders.filter((order) => getDriverPaymentSummary(order).category === filter);
}

function getOrderTimestamp(order: DriverPaymentOrder) {
  return order.driver_delivered_at
    || order.driver_failed_at
    || order.updated_at
    || order.created_at
    || order.order_date
    || '';
}

function paymentRank(category: DriverPaymentCategory) {
  return category === 'CASH' ? 0 : category === 'TRANSFER' ? 1 : category === 'CASH_TRANSFER' ? 2 : 3;
}

export function sortDriverPaymentOrders<T extends DriverPaymentOrder>(
  orders: T[],
  sort: DriverPaymentSort,
) {
  return [...orders].sort((a, b) => {
    const aPayment = getDriverPaymentSummary(a);
    const bPayment = getDriverPaymentSummary(b);

    if (sort === 'AMOUNT_DESC' || sort === 'AMOUNT_ASC') {
      const amountDifference = aPayment.totalAmount - bPayment.totalAmount;
      if (amountDifference !== 0) return sort === 'AMOUNT_DESC' ? -amountDifference : amountDifference;
    }

    if (sort === 'PAYMENT') {
      const paymentDifference = paymentRank(aPayment.category) - paymentRank(bPayment.category);
      if (paymentDifference !== 0) return paymentDifference;
      const amountDifference = bPayment.totalAmount - aPayment.totalAmount;
      if (amountDifference !== 0) return amountDifference;
    }

    return new Date(getOrderTimestamp(b)).getTime() - new Date(getOrderTimestamp(a)).getTime();
  });
}
