import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_RESCHEDULE_REASON,
  DELIVERY_TOMORROW_REASON,
  getFailedStatusDate,
  getDriverFailureSubmission,
  getTomorrowDateKey,
  hasRequiredDeliveryPhotos,
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

  it('requires at least one delivery photo for every failed outcome', () => {
    expect(hasRequiredDeliveryPhotos([])).toBe(false);
    expect(hasRequiredDeliveryPhotos(undefined)).toBe(false);
    expect(hasRequiredDeliveryPhotos([ 'uploaded-photo' ])).toBe(true);
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

  it('submits Delivery Tomorrow with its dedicated result type and reason', () => {
    expect(getDriverFailureSubmission(' Delivery   Tomorrow ', '2026-08-08')).toEqual({
      resultType: 'DRIVER_DELIVERY_TOMORROW_SUBMITTED',
      reason: DELIVERY_TOMORROW_REASON,
      nextDeliveryDate: '2026-08-08',
    });
  });

  it('classifies each mixed failed reason independently', () => {
    const results = [
      getFailedStatusDate('Cannot contact customer', undefined, today),
      getFailedStatusDate(DELIVERY_TOMORROW_REASON, undefined, today),
      getFailedStatusDate(CUSTOMER_RESCHEDULE_REASON, '2026-08-10', today),
      getFailedStatusDate(CUSTOMER_RESCHEDULE_REASON, undefined, today),
    ];

    expect(results).toEqual([
      { valid: true, nextDeliveryDate: undefined },
      { valid: true, nextDeliveryDate: '2026-08-08' },
      { valid: true, nextDeliveryDate: '2026-08-10' },
      { valid: false, nextDeliveryDate: undefined },
    ]);
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
