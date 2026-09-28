import { describe, expect, it } from 'vitest';
import { driverEventMessage } from './driverEventMessage';

const failedOrder = {
  order_code: 'TESTING 001',
  total_amount: 0,
  driver_failed_reason: null,
  driver_failed_remark: null,
  driver_next_delivery_date: null,
};

const failedEvent = {
  event_type: 'driver_failed',
  metadata: {
    order_code: 'TESTING 001',
    total_amount: 0,
    submitted_at: '2026-08-21T04:27:16.515Z',
    delivery_timing: 'tomorrow',
  },
  submitted_at: '2026-08-21T04:27:16.515Z',
  created_at: '2026-08-21T04:27:16.515Z',
};

describe('Telegram Driver final notification', () => {
  it('shows the source Driver and does not invent a reason when none was submitted', () => {
    const message = driverEventMessage(failedEvent, failedOrder, 'ASHRAF');

    expect(message).toContain('Driver: ASHRAF');
    expect(message).toContain('Failed Delivery');
    expect(message).not.toContain('Delivery Tomorrow');
    expect(message).not.toContain('Deliver again tomorrow');
    expect(message).not.toContain('Remark:');
  });

  it('keeps a real Delivery Tomorrow reason but removes the hardcoded follow-up sentence', () => {
    const message = driverEventMessage(
      {
        ...failedEvent,
        metadata: {
          ...failedEvent.metadata,
          driver_failed_reason: 'Delivery Tomorrow',
          driver_next_delivery_date: '2026-08-22',
        },
      },
      failedOrder,
      'ASHRAF',
      {
        result_type: 'DRIVER_DELIVERY_TOMORROW_SUBMITTED',
        failure_reason: 'Delivery Tomorrow',
        remark: null,
        reschedule_date: '2026-08-22',
      },
    );

    expect(message).toContain('Delivery Tomorrow');
    expect(message).toContain('22 Aug 2026');
    expect(message).not.toContain('Deliver again tomorrow');
  });

  it('uses the driver attempt reason instead of stale queue delivery timing', () => {
    const message = driverEventMessage(
      {
        ...failedEvent,
        metadata: {
          ...failedEvent.metadata,
          delivery_timing: 'tomorrow',
          driver_failed_reason: 'Customer requested reschedule',
          driver_failed_remark: 'Change date',
          driver_next_delivery_date: '2026-08-20',
        },
      },
      failedOrder,
      'Khairul',
      {
        result_type: 'DRIVER_RESCHEDULE_SUBMITTED',
        failure_reason: 'Customer requested reschedule',
        remark: 'Change date',
        reschedule_date: '2026-08-20',
      },
    );

    expect(message).toContain('Customer requested reschedule');
    expect(message).toContain('20 Aug 2026');
    expect(message).toContain('Remark: Change date');
    expect(message).not.toContain('Delivery Tomorrow');
    expect(message).not.toContain('Deliver again tomorrow');
  });
});
