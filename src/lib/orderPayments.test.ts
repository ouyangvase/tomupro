import { describe, expect, it } from 'vitest';
import {
  ASSIGNED_PAYMENT_ERROR, LOCKED_PAYMENT_ERROR, paymentBreakdown, paymentEditError,
  paymentMinorUnits, unassignPaymentError, type CustomerPayment,
} from './orderPayments';

const transfer = (amount: number, overrides: Partial<CustomerPayment> = {}): CustomerPayment => ({
  id: 'transfer', order_id: 'order', payment_type: 'BANK_TRANSFER', amount,
  status: 'confirmed', receipt_url: 'receipts/order/transfer.jpg', ...overrides,
});
const cash = (amount: number): CustomerPayment => transfer(amount, {
  id: 'cash', payment_type: 'COD', receipt_url: null,
});
const editable = { driverId: null, pickedUpAt: null, deliveredAt: null };

describe('customer payment accounting', () => {
  it.each([[0, 72], [30, 42], [72, 0]])('keeps 72 revenue with %s transfer and %s COD', (paid, due) => {
    const result = paymentBreakdown('order', 72, paid ? [transfer(paid)] : []);
    expect(result.orderTotal).toBe(72);
    expect(result.transferPaid).toBe(paid);
    expect(result.codDue).toBe(due);
    expect(result.paymentStatus).toBe(due ? 'UNPAID' : 'PAID');
  });
  it('rejects a confirmed transfer larger than the sale', () => {
    expect(() => paymentBreakdown('order', 72, [transfer(80)])).toThrow();
  });
  it.each([['pending'], ['rejected'], ['voided']] as const)('does not deduct %s transfers', status => {
    expect(paymentBreakdown('order', 72, [transfer(30, { status })]).codDue).toBe(72);
  });
  it('combines actual cash and bank receipts without counting the sale again', () => {
    expect(paymentBreakdown('order', 72, [transfer(30), cash(42)])).toMatchObject({
      orderTotal: 72, transferPaid: 30, codDue: 42, codCollected: 42,
      totalCollected: 72, outstanding: 0, paymentStatus: 'PAID',
    });
  });
  it('preserves a cash shortfall instead of inventing a transfer', () => {
    expect(paymentBreakdown('order', 72, [transfer(30), cash(40)])).toMatchObject({
      transferPaid: 30, totalCollected: 70, outstanding: 2, paymentStatus: 'UNPAID',
    });
  });
  it('keeps the original receipt and payment after a full reversal', () => {
    const original = Object.freeze(transfer(30));
    const reversal = transfer(30, { id: 'reversal', reverses_payment_id: original.id });
    expect(paymentBreakdown('order', 72, [original, reversal]).codDue).toBe(72);
    expect(original.amount).toBe(30);
    expect(original.receipt_url).toBe('receipts/order/transfer.jpg');
  });
  it('rejects cross-order payments', () => {
    expect(() => paymentBreakdown('order', 72, [transfer(30, { order_id: 'other' })])).toThrow('another order');
  });
  it('rejects duplicate rows and duplicate reversals', () => {
    expect(() => paymentBreakdown('order', 72, [transfer(30), transfer(30)])).toThrow('Duplicate');
    const reversal = transfer(30, { id: 'r1', reverses_payment_id: 'transfer' });
    expect(() => paymentBreakdown('order', 72, [transfer(30), reversal, { ...reversal, id: 'r2' }])).toThrow('reversal');
  });
  it('does exact cent arithmetic', () => {
    expect(paymentBreakdown('order', '0.30', [transfer(0.1)]).codDue).toBe(0.2);
  });
  it.each(['-1', '1.001', 'NaN', 'Infinity', '1e2', '', '1,000', '99999999999999'])('rejects invalid currency %s', value => {
    expect(() => paymentMinorUnits(value)).toThrow();
  });
});

describe('payment edit guidance', () => {
  it('allows payment changes before assignment', () => {
    expect(paymentEditError(editable, 72, 42)).toBeNull();
  });
  it('blocks COD-changing edits while assigned', () => {
    expect(paymentEditError({ ...editable, driverId: 'driver' }, 72, 42)).toBe(ASSIGNED_PAYMENT_ERROR);
  });
  it('allows receipt-only metadata editing while assigned and before pickup', () => {
    expect(paymentEditError({ ...editable, driverId: 'driver' }, 42, 42)).toBeNull();
  });
  it('requires an unassignment reason', () => {
    expect(unassignPaymentError({ ...editable, driverId: 'driver' }, ' ')).toMatch(/reason/);
    expect(unassignPaymentError({ ...editable, driverId: 'driver' }, 'Correct deposit')).toBeNull();
  });
  it('allows payment edits after explicit unassignment', () => {
    expect(paymentEditError(editable, 42, 32)).toBeNull();
  });
  it('blocks confirmation changes which increase or decrease assigned COD', () => {
    const state = { ...editable, driverId: 'driver' };
    expect(paymentEditError(state, 42, 72)).toBe(ASSIGNED_PAYMENT_ERROR);
    expect(paymentEditError(state, 72, 42)).toBe(ASSIGNED_PAYMENT_ERROR);
  });
  it.each(['pickedUpAt', 'deliveredAt'] as const)('does not let unassignment bypass %s', field => {
    const state = { ...editable, [field]: '2026-09-28T08:00:00Z' };
    expect(paymentEditError(state, 42, 42)).toBe(LOCKED_PAYMENT_ERROR);
    expect(unassignPaymentError(state, 'Change payment')).toBe(LOCKED_PAYMENT_ERROR);
  });
});
