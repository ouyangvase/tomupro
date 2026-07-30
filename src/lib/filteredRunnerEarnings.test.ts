import { describe, expect, it } from 'vitest';
import { summarizeFilteredRunnerEarnings } from '@/lib/filteredRunnerEarnings';

describe('filtered runner earnings', () => {
  it('uses approved area charges and groups the currently filtered orders by claim status', () => {
    const summary = summarizeFilteredRunnerEarnings([
      { area: 'Belait', reconciliation_status: 'NOT_CLAIMED' },
      { area: ' belait ', reconciliation_status: 'ADMIN_ACK_PENDING' },
      { area: 'Tutong', reconciliation_status: 'SP_ACK_PENDING' },
      { area: 'Tutong', reconciliation_status: 'CLAIMED' },
      { area: 'Belait', reconciliation_status: 'SETTLED' },
      { area: 'Unknown', reconciliation_status: 'DISPUTE' },
    ], {
      belait: 5,
      tutong: 7.5,
    });

    expect(summary).toEqual({
      total_amount: 30,
      total_orders: 6,
      pending_amount: 5,
      pending_orders: 1,
      submitted_amount: 12.5,
      submitted_orders: 2,
      approved_amount: 12.5,
      approved_orders: 2,
    });
  });

  it('returns zero amounts for missing area rates while preserving real order counts', () => {
    expect(summarizeFilteredRunnerEarnings([
      { area: null, reconciliation_status: 'NOT_CLAIMED' },
      { area: 'Missing', reconciliation_status: 'CLAIMED' },
    ], {})).toEqual({
      total_amount: 0,
      total_orders: 2,
      pending_amount: 0,
      pending_orders: 1,
      submitted_amount: 0,
      submitted_orders: 0,
      approved_amount: 0,
      approved_orders: 1,
    });
  });
});
