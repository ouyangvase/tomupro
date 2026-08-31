import { describe, expect, it } from 'vitest';
import {
  getDriverReportedPaymentComponents,
  getDriverActionTimestamp,
  groupDriverReviewOrdersByDate,
  isPendingDriverReviewOrder,
} from '@/lib/driverReviewDateGroups';

describe('groupDriverReviewOrdersByDate', () => {
  it('uses the complete COD total for collection and zero for bank transfer', () => {
    expect(getDriverReportedPaymentComponents({
      id: 'kitani-cod',
      payment_method: 'COD',
      total_amount: 20,
    })).toEqual({ cashAmount: 20, transferAmount: 0 });
    expect(getDriverReportedPaymentComponents({
      id: 'kitani-transfer',
      payment_method: 'TRANSFER',
      total_amount: 20,
    })).toEqual({ cashAmount: 0, transferAmount: 20 });
  });

  it('groups delivered and failed orders by the Brunei driver-action date', () => {
    const groups = groupDriverReviewOrdersByDate([
      {
        id: 'delivered-late',
        driver_status: 'DRIVER_DELIVERED',
        payment_method: 'COD',
        total_amount: 39,
        driver_delivered_at: '2026-07-30T16:30:00.000Z',
      },
      {
        id: 'failed-same-day',
        driver_status: 'DRIVER_FAILED',
        payment_method: 'TRANSFER',
        total_amount: 69,
        driver_failed_at: '2026-07-31T03:00:00.000Z',
      },
      {
        id: 'delivered-previous-day',
        driver_status: 'DRIVER_DELIVERED',
        payment_method: 'TRANSFER',
        total_amount: 20,
        driver_delivered_at: '2026-07-30T10:00:00.000Z',
      },
    ]);

    expect(groups.map((group) => group.dateKey)).toEqual(['2026-07-31', '2026-07-30']);
    expect(groups[0]).toMatchObject({
      deliveredAmount: 39,
      cashAmount: 39,
      transferAmount: 0,
      cashOrderCount: 1,
      transferOrderCount: 0,
    });
    expect(groups[1]).toMatchObject({
      deliveredAmount: 20,
      cashAmount: 0,
      transferAmount: 20,
      cashOrderCount: 0,
      transferOrderCount: 1,
    });
    expect(groups[0].deliveredOrders.map((order) => order.id)).toEqual(['delivered-late']);
    expect(groups[0].failedOrders.map((order) => order.id)).toEqual(['failed-same-day']);
  });

  it('uses the Driver delivery-event payment split before the original order method', () => {
    const groups = groupDriverReviewOrdersByDate([
      {
        id: 'cash-event',
        driver_status: 'DRIVER_DELIVERED',
        payment_method: 'COD',
        driver_payment_method: 'CASH',
        driver_cash_amount: 1091,
        driver_transfer_amount: 0,
        total_amount: 1091,
        driver_delivered_at: '2026-08-01T02:00:00.000Z',
      },
      {
        id: 'transfer-event',
        driver_status: 'DRIVER_DELIVERED',
        payment_method: 'COD',
        driver_payment_method: 'TRANSFER',
        driver_cash_amount: 0,
        driver_transfer_amount: 87,
        total_amount: 87,
        driver_delivered_at: '2026-08-01T03:00:00.000Z',
      },
    ]);

    expect(groups[0]).toMatchObject({
      deliveredAmount: 1178,
      cashAmount: 1091,
      cashOrderCount: 1,
      transferAmount: 87,
      transferOrderCount: 1,
    });
  });

  it('derives mixed Driver payments using the same fallback as Driver Analytics', () => {
    expect(getDriverReportedPaymentComponents({
      id: 'mixed-event',
      payment_method: 'COD',
      driver_payment_method: 'CASH_TRANSFER',
      driver_transfer_amount: 39,
      total_amount: 99,
    })).toEqual({ cashAmount: 60, transferAmount: 39 });
  });

  it('uses updated_at only as a historical fallback for failed orders', () => {
    const historicalFailedOrder = {
      id: 'historical-failed',
      driver_status: 'DRIVER_FAILED',
      total_amount: 10,
      driver_failed_at: null,
      updated_at: '2026-07-29T02:00:00.000Z',
    };

    expect(getDriverActionTimestamp(historicalFailedOrder)).toBe(historicalFailedOrder.updated_at);
    expect(groupDriverReviewOrdersByDate([historicalFailedOrder])[0].dateKey).toBe('2026-07-29');
  });

  it.each([
    ['CANCELLED', 'DRIVER_DELIVERED'],
    ['CANCELED', 'DRIVER_FAILED'],
    ['RETURNED', 'DRIVER_DELIVERED'],
  ] as const)(
    'excludes non-reviewable Runner status %s from the pending review queue',
    (runnerStatus, driverStatus) => {
      expect(isPendingDriverReviewOrder({
        id: 'final-order',
        assignment_state: 'PENDING_ACCEPTANCE',
        driver_id: 'driver-1',
        driver_status: driverStatus,
        runner_status: runnerStatus,
      }, driverStatus)).toBe(false);
    },
  );

  it('keeps an unreviewed Driver outcome in the pending review queue', () => {
    expect(isPendingDriverReviewOrder({
      id: 'pending-order',
      assignment_state: 'PENDING_ACCEPTANCE',
      driver_id: 'driver-1',
      driver_status: 'DRIVER_DELIVERED',
      runner_status: 'ASSIGNED',
    }, 'DRIVER_DELIVERED')).toBe(true);
  });

  it.each([
    { runner_accept_status: 'ACCEPTED', runner_review_status: 'NOT_REVIEWED' },
    { runner_accept_status: 'PENDING', runner_review_status: 'REVIEWED' },
  ])('excludes a Driver outcome already accepted or reviewed', (finalState) => {
    expect(isPendingDriverReviewOrder({
      id: 'already-processed-order',
      assignment_state: 'PENDING_ACCEPTANCE',
      driver_id: 'driver-1',
      driver_status: 'DRIVER_DELIVERED',
      runner_status: 'DELIVERED',
      ...finalState,
    }, 'DRIVER_DELIVERED')).toBe(false);
  });

  it.each([
    ['DELIVERED', 'DRIVER_DELIVERED'],
    ['FAILED_DELIVERY', 'DRIVER_FAILED'],
  ] as const)(
    'keeps an unreviewed Driver outcome visible when Runner status is already %s',
    (runnerStatus, driverStatus) => {
      expect(isPendingDriverReviewOrder({
        id: 'stale-final-status-order',
        assignment_state: 'PENDING_ACCEPTANCE',
        driver_id: 'driver-1',
        driver_status: driverStatus,
        runner_status: runnerStatus,
      }, driverStatus)).toBe(true);
    },
  );
});
