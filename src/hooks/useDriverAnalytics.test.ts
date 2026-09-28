import { describe, expect, it, vi } from 'vitest';

describe('normalizeDriverAnalyticsMetrics', () => {
  it('maps Runner-finalized totals and never treats pending Driver deliveries as final', async () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-key');
    const { normalizeDriverAnalyticsMetrics } = await import('./useDriverAnalytics');
    const result = normalizeDriverAnalyticsMetrics({
      assigned_orders: 29,
      delivered_orders: 0,
      total_sales: '0',
      cash_amount: '0',
      cash_order_count: 0,
      cash_on_hand: '0',
      cash_on_hand_count: 0,
      transfer_amount: '0',
      transfer_order_count: 0,
      pending_acceptance: 29,
      pending_acceptance_amount: '1457',
      runner_accepted_orders: 0,
      runner_accepted_amount: '0',
      pending_cash_amount: '120',
      pending_cash_order_count: 3,
      pending_transfer_amount: '39',
      pending_transfer_order_count: 1,
    });

    expect(result).toMatchObject({
      deliveredOrders: 0,
      totalSales: 0,
      cashAmount: 0,
      cashOrderCount: 0,
      cashOnHand: 0,
      cashOnHandCount: 0,
      transferAmount: 0,
      transferOrderCount: 0,
      pendingAcceptance: 29,
      pendingAcceptanceAmount: 1457,
      runnerAcceptedOrders: 0,
      runnerAcceptedAmount: 0,
      assigned: 29,
      delivered: 0,
      totalAssignedSales: 0,
      cashCollected: 0,
      cashPendingSettlement: 0,
      transfer: 0,
      pendingCashAmount: 120,
      pendingCashOrderCount: 3,
      pendingTransferAmount: 39,
      pendingTransferOrderCount: 1,
    });
    expect(result.deliveryRate).toBe(0);
  });

  it('maps canonical daily rows that use snake_case delivered and total fields', async () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-key');
    const { normalizeDriverAnalyticsMetrics: normalizeDailyRow } = await import('./useDriverAnalytics');
    const result = normalizeDailyRow({
      assigned_orders: 30,
      delivered_orders: 9,
      total_sales: '1150',
      cash_amount: '805',
      transfer_amount: '315',
      accepted_failed_orders: 4,
      pending_acceptance: 17,
    });

    expect(result).toMatchObject({
      assignedOrders: 30,
      deliveredOrders: 9,
      runnerAcceptedOrders: 9,
      totalSales: 1120,
      runnerAcceptedAmount: 1120,
      acceptedFailedOrders: 4,
      pendingAcceptance: 17,
      deliveryRate: 30,
    });
  });
});

describe('groupDriverAnalyticsOrders', () => {
  it('groups every order by its current analytics state', async () => {
    const { groupDriverAnalyticsOrders } = await import('./useDriverAnalytics');
    const orders = [
      { id: 'active', assignment_state: 'ACTIVE' },
      { id: 'delivered', assignment_state: 'DELIVERED' },
      { id: 'pending', assignment_state: 'PENDING_ACCEPTANCE' },
      { id: 'failed', assignment_state: 'FAILED' },
      { id: 'runner-took-it', assignment_state: 'INACTIVE', driver_id: null },
    ] as never[];

    const groups = groupDriverAnalyticsOrders(orders);

    expect(groups.ACTIVE.map((order) => order.id)).toEqual(['active']);
    expect(groups.DELIVERED.map((order) => order.id)).toEqual(['delivered']);
    expect(groups.PENDING_ACCEPTANCE.map((order) => order.id)).toEqual(['pending']);
    expect(groups.FAILED.map((order) => order.id)).toEqual(['failed']);
    expect(groups.INACTIVE.map((order) => order.id)).toEqual(['runner-took-it']);
  });
});
