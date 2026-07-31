import { describe, expect, it, vi } from 'vitest';

describe('normalizeDriverAnalyticsMetrics', () => {
  it('maps server aggregate snake_case fields used by daily and monthly rows', async () => {
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
      assigned: 102,
      delivered: 34,
      total_assigned_sales: '6491',
      accepted_sales: '2295',
      pending_sales: '4196',
      cash_collected: '2072',
      cash_pending: '2072',
      transfer: '223',
    });

    expect(result).toMatchObject({
      assigned: 102,
      delivered: 34,
      totalAssignedSales: 6491,
      acceptedSales: 2295,
      pendingSales: 4196,
      cashCollected: 2072,
      cashPendingSettlement: 2072,
      transfer: 223,
    });
    expect(result.deliveryRate).toBeCloseTo(33.3, 1);
  });
});
