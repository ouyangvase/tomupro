import { describe, expect, it } from 'vitest';
import {
  filterDriverPaymentOrders,
  formatDriverPaymentDisplay,
  getDriverRecordedPaymentCategory,
  getDriverPaymentSummary,
  sortDriverPaymentOrders,
} from '@/lib/driverPaymentSummary';

describe('driver payment summary', () => {
  it('uses Driver-recorded cash and transfer amounts after delivery', () => {
    expect(getDriverPaymentSummary({
      id: 'mixed',
      payment_method: 'COD',
      driver_payment_method: 'CASH_TRANSFER',
      driver_cash_amount: 60,
      driver_transfer_amount: 39,
      total_amount: 99,
    })).toMatchObject({
      category: 'CASH_TRANSFER',
      label: 'CASH + TRANSFER',
      cashAmount: 60,
      transferAmount: 39,
      totalAmount: 99,
      isDriverReported: true,
    });
  });

  it('formats Driver payment without inferring from the ordinary order payment method', () => {
    expect(formatDriverPaymentDisplay({
      id: 'cash',
      payment_method: 'COD',
      driver_payment_method: 'CASH',
      driver_cash_amount: 55,
      total_amount: 55,
    })).toBe('Cash · BND 55.00');

    expect(formatDriverPaymentDisplay({
      id: 'transfer',
      payment_method: 'COD',
      driver_payment_method: 'TRANSFER',
      driver_transfer_amount: 84,
      total_amount: 84,
    })).toBe('Transfer · BND 84.00');

    expect(formatDriverPaymentDisplay({
      id: 'mixed',
      payment_method: 'COD',
      driver_payment_method: 'CASH_TRANSFER',
      driver_cash_amount: 40,
      driver_transfer_amount: 39,
      total_amount: 79,
    })).toBe('Cash · BND 40.00 + Transfer · BND 39.00');

    expect(formatDriverPaymentDisplay({
      id: 'legacy',
      payment_method: 'TRANSFER',
      total_amount: 42,
    })).toBe('Not recorded');
  });

  it('falls back to the original order payment method before Driver reports payment', () => {
    expect(getDriverPaymentSummary({
      id: 'planned-transfer',
      payment_method: 'TRANSFER',
      total_amount: 42,
    })).toMatchObject({
      category: 'TRANSFER',
      transferAmount: 42,
      totalAmount: 42,
      isDriverReported: false,
    });
  });

  it('filters and sorts by the displayed Driver payment classification', () => {
    const orders = [
      { id: 'cash', payment_method: 'COD', total_amount: 20 },
      { id: 'transfer', payment_method: 'TRANSFER', total_amount: 80 },
      { id: 'mixed', payment_method: 'COD', driver_payment_method: 'CASH_TRANSFER', driver_cash_amount: 50, driver_transfer_amount: 30, total_amount: 80 },
    ];

    expect(filterDriverPaymentOrders(orders, 'CASH_TRANSFER').map((order) => order.id)).toEqual(['mixed']);
    expect(sortDriverPaymentOrders(orders, 'AMOUNT_DESC').map((order) => order.id)).toEqual(['transfer', 'mixed', 'cash']);
  });

  it('classifies Runner filters from Driver records instead of the original order payment method', () => {
    expect(getDriverRecordedPaymentCategory({
      id: 'planned-transfer',
      payment_method: 'TRANSFER',
      total_amount: 42,
    })).toBe('UNKNOWN');

    expect(getDriverRecordedPaymentCategory({
      id: 'driver-cash',
      payment_method: 'TRANSFER',
      driver_payment_method: 'CASH',
      driver_cash_amount: 42,
      total_amount: 42,
    })).toBe('CASH');

    expect(getDriverRecordedPaymentCategory({
      id: 'driver-mixed',
      payment_method: 'COD',
      driver_payment_method: 'CASH_TRANSFER',
      driver_cash_amount: 20,
      driver_transfer_amount: 22,
      total_amount: 42,
    })).toBe('CASH_TRANSFER');

    expect(getDriverRecordedPaymentCategory({
      id: 'empty-driver-record',
      payment_method: 'TRANSFER',
      driver_cash_amount: 0,
      total_amount: 42,
    })).toBe('UNKNOWN');
  });
});
