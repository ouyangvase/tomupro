import { describe, expect, it } from 'vitest';
import { getRunnerAreaChargeKey, getRunnerDeliveryCharge } from '@/lib/runnerDeliveryCharges';

describe('runner delivery charge resolution', () => {
  const charges = {
    [getRunnerAreaChargeKey('yc2', 'BM')!]: 12,
    [getRunnerAreaChargeKey('ume', 'BM')!]: 9,
  };

  it('resolves each order from its source runner, not the viewer', () => {
    expect(getRunnerDeliveryCharge({ runner_id: 'yc2', area: ' bm ' }, charges)).toBe(12);
    expect(getRunnerDeliveryCharge({ runner_id: 'ume', area: 'BM' }, charges)).toBe(9);
  });

  it('does not fall back to another runner or to an area-only rate', () => {
    expect(getRunnerDeliveryCharge({ runner_id: 'sarah', area: 'BM' }, charges)).toBeUndefined();
    expect(getRunnerDeliveryCharge({ runner_id: 'yc2', area: null }, charges)).toBeUndefined();
  });
});
