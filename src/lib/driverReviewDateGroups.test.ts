import { describe, expect, it } from 'vitest';
import {
  getDriverActionTimestamp,
  groupDriverReviewOrdersByDate,
} from '@/lib/driverReviewDateGroups';

describe('groupDriverReviewOrdersByDate', () => {
  it('groups delivered and failed orders by the Brunei driver-action date', () => {
    const groups = groupDriverReviewOrdersByDate([
      {
        id: 'delivered-late',
        driver_status: 'DRIVER_DELIVERED',
        total_amount: 39,
        driver_delivered_at: '2026-07-30T16:30:00.000Z',
      },
      {
        id: 'failed-same-day',
        driver_status: 'DRIVER_FAILED',
        total_amount: 69,
        driver_failed_at: '2026-07-31T03:00:00.000Z',
      },
      {
        id: 'delivered-previous-day',
        driver_status: 'DRIVER_DELIVERED',
        total_amount: 20,
        driver_delivered_at: '2026-07-30T10:00:00.000Z',
      },
    ]);

    expect(groups.map((group) => group.dateKey)).toEqual(['2026-07-31', '2026-07-30']);
    expect(groups[0]).toMatchObject({
      deliveredAmount: 39,
      failedAmount: 69,
    });
    expect(groups[0].deliveredOrders.map((order) => order.id)).toEqual(['delivered-late']);
    expect(groups[0].failedOrders.map((order) => order.id)).toEqual(['failed-same-day']);
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
});
