import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_RESCHEDULE_REASON,
  DELIVERY_TOMORROW_REASON,
  getFailedStatusDate,
  getTomorrowDateKey,
  normalizeFailedReason,
  sortFailedStatusReasons,
} from './driverFailedStatus';

const today = new Date('2026-08-07T10:00:00+08:00');

describe('driver failed status', () => {
  it('normalizes reason labels consistently', () => {
    expect(normalizeFailedReason('  Customer   requested reschedule ')).toBe(
      'customer requested reschedule',
    );
  });

  it('maps Delivery Tomorrow to the next Brunei calendar date', () => {
    expect(getTomorrowDateKey(today)).toBe('2026-08-08');
    expect(getFailedStatusDate(DELIVERY_TOMORROW_REASON, undefined, today)).toEqual({
      valid: true,
      nextDeliveryDate: '2026-08-08',
    });
  });

  it('uses the Brunei calendar date even when the device timestamp is still UTC', () => {
    const lateUtcTimestamp = new Date('2026-08-08T23:30:00.000Z');
    expect(getTomorrowDateKey(lateUtcTimestamp)).toBe('2026-08-10');
  });

  it('requires tomorrow or later for customer reschedule', () => {
    expect(getFailedStatusDate(CUSTOMER_RESCHEDULE_REASON, '2026-08-07', today).valid).toBe(false);
    expect(getFailedStatusDate(CUSTOMER_RESCHEDULE_REASON, '2026-08-08', today)).toEqual({
      valid: true,
      nextDeliveryDate: '2026-08-08',
    });
  });

  it('clears a stale date for ordinary failed reasons', () => {
    expect(getFailedStatusDate('Wrong address', '2026-08-20', today)).toEqual({
      valid: true,
      nextDeliveryDate: undefined,
    });
  });

  it('keeps Delivery Tomorrow before Other in the shared option order', () => {
    const options = [
      { id: 'other', label: 'Other' },
      { id: 'tomorrow', label: DELIVERY_TOMORROW_REASON },
      { id: 'wrong', label: 'Wrong address' },
    ];
    expect(sortFailedStatusReasons(options).map((option) => option.label)).toEqual([
      DELIVERY_TOMORROW_REASON,
      'Other',
      'Wrong address',
    ]);
  });
});
