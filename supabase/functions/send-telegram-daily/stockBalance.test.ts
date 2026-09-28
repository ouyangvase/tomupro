import { describe, expect, it, vi } from 'vitest';
import { fetchAllStockBalances } from './stockBalance';

function stockClient(rows: any[], cap = 1000, failAt?: number) {
  const query: any = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(async (from: number, to: number) => {
      if (from === failAt) return { data: null, error: { message: 'database unavailable' } };
      return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null };
    }),
  };
  return { from: vi.fn(() => query), query };
}

describe('daily report stock pagination', () => {
  it('retains all 56 APPLE rows when only PAP01 is in the first 1000', async () => {
    const rows = Array.from({ length: 2372 }, (_, i) => ({
      warehouse_id: `warehouse-${i}`,
      owner_user_id: i === 0 || (i >= 1000 && i < 1055) ? 'apple' : 'other',
      sku_code: i === 0 ? 'PAP01' : `SKU-${i}`,
      balance_qty: i === 0 ? 8 : 1,
    }));
    const client = stockClient(rows);
    const result = await fetchAllStockBalances(client);
    expect(result).toEqual(rows);
    expect(result.filter(row => row.owner_user_id === 'apple')).toHaveLength(56);
    expect(client.query.order.mock.calls).toContainEqual(['warehouse_id', { ascending: true }]);
    expect(client.query.order.mock.calls).toContainEqual(['product_id', { ascending: true }]);
  });

  it('continues when the server returns fewer rows than the requested page size', async () => {
    const rows = Array.from({ length: 1200 }, (_, id) => ({ id }));
    expect(await fetchAllStockBalances(stockClient(rows, 500))).toEqual(rows);
  });

  it('fails instead of returning incomplete stock when a later page fails', async () => {
    const client = stockClient(Array.from({ length: 1200 }, (_, id) => ({ id })), 1000, 1000);
    await expect(fetchAllStockBalances(client)).rejects.toThrow('database unavailable');
  });

  it('returns an empty list when there are no stock rows', async () => {
    expect(await fetchAllStockBalances(stockClient([]))).toEqual([]);
  });
});
