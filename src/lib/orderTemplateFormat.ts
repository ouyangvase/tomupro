import type { OrderPaymentPlan } from './orderPayment';

export function parseTemplatePayment(value: string): OrderPaymentPlan {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '');
  if (!normalized || normalized === 'COD') return 'COD';
  if (normalized === 'TRANSFER') return 'TRANSFER';
  if (['TRANSFER+COD', 'COD+TRANSFER', 'PARTIAL_TRANSFER_COD'].includes(normalized)) return 'PARTIAL_TRANSFER_COD';
  throw new Error('Payment must be COD, TRANSFER + COD, or TRANSFER.');
}

export function templateTransferAmount(plan: OrderPaymentPlan, raw: string, total: number): number {
  if (raw && !/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error('Transfer amount must be a non-negative BND amount with at most two decimals.');
  const amount = raw === '' && plan === 'TRANSFER' ? total : Number(raw || 0);
  if (!Number.isFinite(amount) || amount < 0 || Math.round(amount * 100) > Math.round(total * 100)) throw new Error('Transfer amount cannot exceed the order total.');
  if (plan === 'COD' && amount > 0) throw new Error('Choose TRANSFER + COD when entering a partial transfer.');
  if (plan === 'PARTIAL_TRANSFER_COD' && (amount <= 0 || amount >= total)) throw new Error('Transfer + COD requires a transfer greater than zero and less than the total.');
  if (plan === 'TRANSFER' && amount !== total) throw new Error('Full Transfer must equal the order total.');
  return amount;
}

export const ORDER_PASTE_EXAMPLE = `Customer Name: SAMPLE CUSTOMER
Phone: +6738888888
Address: NO 1, SIMPANG 1, JALAN EXAMPLE
Payment: TRANSFER + COD
Transfer Amount: 30.00

Items:
2 X SKU-A $42.00
1 X SKU-B $30.00

Order Notes:
Call before delivery.
Use the side entrance / blue gate.`;

export const MULTI_SKU_TEMPLATE = 'order_ref,order_date,customer_name,phone,address,area,channel,payment_method,transfer_amount,expected_pickup_date,order_notes,sku_name_or_code,qty,line_total\n' +
  'SAMPLE-001,,SAMPLE CUSTOMER,+6738888888,"NO 1, SIMPANG 1, JALAN EXAMPLE",,,TRANSFER + COD,30.00,,"Call before delivery. Use the side entrance / blue gate.",SKU-A,2,42.00\n' +
  'SAMPLE-001,,SAMPLE CUSTOMER,+6738888888,"NO 1, SIMPANG 1, JALAN EXAMPLE",,,TRANSFER + COD,30.00,,"Call before delivery. Use the side entrance / blue gate.",SKU-B,1,30.00';
