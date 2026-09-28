import type { ValidatedOrderLine } from './csvValidation';
import { templateTransferAmount } from './orderTemplateFormat';

export function groupImportPayments(rows: ValidatedOrderLine[]) {
  const groups = new Map<string, { row: ValidatedOrderLine; total: number; transfer: number }>();
  const keys: (keyof ValidatedOrderLine)[] = ['customer_name', 'phone', 'address', 'area', 'channel', 'payment_method', 'transfer_amount', 'transfer_receipt_url', 'order_date', 'expected_pickup_date', 'notes'];
  for (const row of rows) {
    const ref = row.order_ref.trim().toUpperCase();
    const existing = groups.get(ref);
    if (existing && keys.some(key => row[key] !== existing.row[key])) throw new Error(`Order ${ref}: customer, payment, dates and notes must match on every SKU row.`);
    if (existing) existing.total += Math.round(row.price * 100);
    else groups.set(ref, { row, total: Math.round(row.price * 100), transfer: 0 });
  }
  for (const [ref, group] of groups) {
    group.total /= 100;
    // Older files used COD plus transfer_amount for partial transfers.
    const plan = group.row.payment_method === 'COD' && Number(group.row.transfer_amount) > 0
      ? 'PARTIAL_TRANSFER_COD' : group.row.payment_method;
    try { group.transfer = templateTransferAmount(plan, group.row.transfer_amount, group.total); }
    catch (error) { throw new Error(`Order ${ref}: ${(error as Error).message}`); }
  }
  return groups;
}
