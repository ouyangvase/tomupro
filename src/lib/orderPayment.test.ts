import { describe, expect, it } from 'vitest';
import { calculatePaymentBreakdown, orderCodDue, orderPaymentBreakdown, paymentPlanValues, validateTransferAmount } from './orderPayment';
import { getDriverReportedPaymentComponents } from './driverReviewDateGroups';

describe('order payment breakdown', () => {
  const partial = { id: 'one', total_amount: 72, cod_amount: 42, payment_method: 'COD', payment_plan: 'PARTIAL_TRANSFER_COD', receipt_status: 'confirmed' };
  it('keeps pending evidence out of paid money and shows 72 until confirmation', () => {
    expect(orderPaymentBreakdown({ ...partial, receipt_status: 'pending' })).toMatchObject({ transferPaid: 0, codDue: 72, outstanding: 72, paymentStatus: 'UNPAID' });
  });
  it('shows Runner and Driver the same confirmed balance', () => {
    expect(orderCodDue(partial)).toBe(42);
    expect(orderPaymentBreakdown(partial)).toMatchObject({ totalAmount: 72, transferPaid: 30, codDue: 42, outstanding: 42 });
  });
  it.each([[42, 0, 'PAID'], [40, 2, 'PARTIAL']] as const)('reconciles cash %s without counting transfer twice', (cash, outstanding, status) => {
    expect(orderPaymentBreakdown({ ...partial, driver_cash_amount: cash })).toMatchObject({ totalAmount: 72, transferPaid: 30, codDue: outstanding, codCollected: cash, totalCollected: 30 + cash, outstanding, paymentStatus: status });
  });
  it('full transfer needs no Driver collection', () => {
    expect(orderPaymentBreakdown({ ...partial, payment_plan: 'TRANSFER', payment_method: 'TRANSFER', cod_amount: 0 })).toMatchObject({ totalAmount: 72, transferPaid: 72, codDue: 0, outstanding: 0, paymentStatus: 'PAID' });
  });
  it.each([-1, 80, NaN, Infinity, 30.001])('rejects invalid transfer %s', transfer => {
    expect(() => validateTransferAmount(72, transfer)).toThrow();
  });
  it.each([0, 30, 30.01, 72])('allows valid two-decimal transfer %s', transfer => {
    expect(() => validateTransferAmount(72, transfer)).not.toThrow();
  });
  it('does not infer partial Driver cash from the COD enum', () => {
    expect(getDriverReportedPaymentComponents(partial)).toEqual({ cashAmount: 0, transferAmount: 0 });
    expect(getDriverReportedPaymentComponents({ ...partial, driver_payment_method: 'CASH', driver_cash_amount: 42, driver_transfer_amount: 0 })).toEqual({ cashAmount: 42, transferAmount: 0 });
  });
  it('supports remaining COD collected by transfer without cash liability', () => {
    const order = { ...partial, driver_payment_method: 'TRANSFER', driver_cash_amount: 0, driver_transfer_amount: 42 };
    expect(getDriverReportedPaymentComponents(order)).toEqual({ cashAmount: 0, transferAmount: 42 });
    expect(orderPaymentBreakdown(order).totalCollected).toBe(72);
  });
  it('keeps a full COD order collectible in COD', () => {
    expect(calculatePaymentBreakdown(72, 0)).toEqual({
      totalAmount: 72,
      transferPaidAmount: 0,
      codDueAmount: 72,
    });
  });

  it('calculates partial transfer and COD due without changing sales value', () => {
    expect(calculatePaymentBreakdown(72, 30)).toEqual({
      totalAmount: 72,
      transferPaidAmount: 30,
      codDueAmount: 42,
    });
  });

  it('caps transfer payment at the order total', () => {
    expect(calculatePaymentBreakdown(72, 90).codDueAmount).toBe(0);
  });

  it('maps the three creation plans to legacy payment columns', () => {
    expect(paymentPlanValues('COD', 72, 0)).toEqual({ paymentMethod: 'COD', transferAmount: 0, codAmount: 72 });
    expect(paymentPlanValues('PARTIAL_TRANSFER_COD', 72, 30)).toEqual({ paymentMethod: 'COD', transferAmount: 30, codAmount: 42 });
    expect(paymentPlanValues('TRANSFER', 72, 0)).toEqual({ paymentMethod: 'TRANSFER', transferAmount: 72, codAmount: 0 });
  });

  it('does not treat a zero COD amount as the full total', () => {
    expect(orderCodDue({ total_amount: 72, cod_amount: 0, payment_method: 'TRANSFER' })).toBe(0);
  });
  it('does not reopen an unverified closed legacy order or invent paid money', () => {
    expect(orderPaymentBreakdown({ total_amount: 72, cod_amount: 72, payment_plan: 'COD', payment_history_unverified: true }))
      .toMatchObject({ codDue: 0, totalCollected: 0, outstanding: null, paymentStatus: 'REVIEW' });
  });
});
