import { describe, expect, it } from 'vitest';
import { driverEventMessage } from './driverEventMessage';

describe('partial payment Driver notification', () => {
  it('reports full sales, confirmed transfer and zero remaining after cash collection', () => {
    const message = driverEventMessage({ event_type: 'driver_delivered', created_at: '2026-09-29T00:00:00Z', submitted_at: null,
      metadata: { total_amount: 72, transfer_paid_amount: 30, cod_due_amount: 42, outstanding_amount: 0 } },
      { order_code: 'PAYMENT-TEST', total_amount: 72, driver_failed_reason: null, driver_failed_remark: null, driver_next_delivery_date: null });
    expect(message).toContain('Order total: BND 72.00');
    expect(message).toContain('Transfer paid: BND 30.00');
    expect(message).toContain('Remaining: BND 0.00');
  });
});
