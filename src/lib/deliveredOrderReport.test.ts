import { describe, expect, it } from 'vitest';
import {
  formatKualaLumpurDateTime,
  getDeliveredOrderTimestamp,
  getKualaLumpurDateKey,
  isDeliveredInKualaLumpurDateRange,
  isPNumberArea,
} from './deliveredOrderReport';

describe('delivered order report rules', () => {
  it('uses the driver delivery event before the runner delivery timestamp', () => {
    expect(getDeliveredOrderTimestamp({
      delivered_at: '2026-08-24T16:45:00.000Z',
      driver_delivered_at: '2026-08-24T04:45:00.000Z',
    })).toBe('2026-08-24T04:45:00.000Z');
  });

  it('groups timestamps by the Kuala Lumpur calendar date', () => {
    expect(getKualaLumpurDateKey('2026-08-24T16:50:00.000Z')).toBe('2026-08-25');
    expect(getKualaLumpurDateKey('2026-08-24T04:50:00.000Z')).toBe('2026-08-24');
  });

  it('formats exported and visible timestamps in Kuala Lumpur time', () => {
    expect(formatKualaLumpurDateTime('2026-08-24T16:50:00.000Z')).toBe('25 Aug 2026 00:50');
  });

  it('keeps an order without a driver timestamp on its runner delivery timestamp', () => {
    const timestamp = getDeliveredOrderTimestamp({
      delivered_at: '2026-08-24T04:43:51.896Z',
      driver_delivered_at: null,
    });

    expect(timestamp).toBe('2026-08-24T04:43:51.896Z');
    expect(getKualaLumpurDateKey(timestamp!)).toBe('2026-08-24');
  });

  it('uses the driver timestamp when applying a Kuala Lumpur date range', () => {
    expect(isDeliveredInKualaLumpurDateRange({
      delivered_at: '2026-08-07T20:00:12.000Z',
      driver_delivered_at: '2026-07-29T10:23:09.000Z',
    }, '2026-08-01', '2026-08-28')).toBe(false);
  });

  it('identifies only P-number areas for the optional exclusion filter', () => {
    expect(isPNumberArea('P20')).toBe(true);
    expect(isPNumberArea('p40')).toBe(true);
    expect(isPNumberArea('P5 ')).toBe(true);
    expect(isPNumberArea('BM')).toBe(false);
    expect(isPNumberArea('P')).toBe(false);
    expect(isPNumberArea('P20A')).toBe(false);
  });

});
