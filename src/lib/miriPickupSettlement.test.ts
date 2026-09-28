import { describe, expect, it } from 'vitest';
import { calculateMiriPickupSettlement } from './miriPickupSettlement';

describe('calculateMiriPickupSettlement', () => {
  it.each([
    ['20', '180.00'],
    ['40', '160.00'],
    ['50', '150.00'],
    ['200', '0.00'],
  ])('calculates %s with offset %s', (actual, offset) => {
    expect(calculateMiriPickupSettlement(actual)).toEqual({
      settlementBase: '200.00',
      actualPickupCharge: `${Number(actual).toFixed(2)}`,
      internalOffset: offset,
      runnerPayable: `${Number(actual).toFixed(2)}`,
      sellerCharge: `${Number(actual).toFixed(2)}`,
    });
  });

  it('rejects an amount above the settlement base', () => {
    expect(() => calculateMiriPickupSettlement('200.01')).toThrow('AMOUNT_EXCEEDS_SETTLEMENT_BASE');
  });

  it.each(['0', '-1', '-0.01'])('rejects non-positive amount %s', (actual) => {
    expect(() => calculateMiriPickupSettlement(actual)).toThrow();
  });
});
