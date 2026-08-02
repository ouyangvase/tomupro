import { describe, expect, it, vi } from 'vitest';

describe('normalizeDriverAnalyticsMetrics', () => {
  it('maps Driver delivery-event totals used by daily and monthly rows', async () => {
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
      delivered_orders: 21,
      total_sales: '1178',
      cash_amount: '1091',
      cash_order_count: 19,
      cash_on_hand: '1091',
      cash_on_hand_count: 19,
      transfer_amount: '87',
      transfer_order_count: 2,
      pending_acceptance: 21,
      pending_acceptance_amount: '1178',
      runner_accepted_orders: 0,
      runner_accepted_amount: '0',
    });

    expect(result).toMatchObject({
      deliveredOrders: 21,
      totalSales: 1178,
      cashAmount: 1091,
      cashOrderCount: 19,
      cashOnHand: 1091,
      cashOnHandCount: 19,
      transferAmount: 87,
      transferOrderCount: 2,
      pendingAcceptance: 21,
      pendingAcceptanceAmount: 1178,
      runnerAcceptedOrders: 0,
      runnerAcceptedAmount: 0,
      assigned: 21,
      delivered: 21,
      totalAssignedSales: 1178,
      cashCollected: 1091,
      cashPendingSettlement: 1091,
      transfer: 87,
    });
    expect(result.deliveryRate).toBe(100);
  });
});

describe('groupDriverAnalyticsOrders', () => {
  it('keeps current orders visible and separates review outcomes for collapsed groups', async () => {
    const { groupDriverAnalyticsOrders } = await import('./useDriverAnalytics');
    const orders = [
      { id: 'active', assignment_state: 'ACTIVE' },
      { id: 'delivered', assignment_state: 'DELIVERED' },
      { id: 'pending', assignment_state: 'PENDING_ACCEPTANCE' },
      { id: 'failed', assignment_state: 'FAILED' },
    ] as never[];

    const groups = groupDriverAnalyticsOrders(orders);

    expect(groups.visible.map((order) => order.id)).toEqual(['active', 'delivered']);
    expect(groups.pendingAcceptance.map((order) => order.id)).toEqual(['pending']);
    expect(groups.failed.map((order) => order.id)).toEqual(['failed']);
  });
});
