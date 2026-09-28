import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ calls: [] as unknown[][], selection: '', owners: ['owner'] }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
  from: (table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'range', 'order', 'eq', 'neq', 'in', 'or', 'ilike']) {
      query[method] = (...args: unknown[]) => {
        mocks.calls.push([table, method, ...args]);
        if (method === 'select') mocks.selection = String(args[0]);
        return query;
      };
    }
    query.then = (resolve: (value: unknown) => unknown) => resolve({ data: mocks.selection === 'id'
      ? [{ id: 'b' }, { id: 'a' }]
      : [{ id: 'a' }, { id: 'b' }], error: null });
    return query;
  },
} }));
vi.mock('@/lib/visibleOwnerIdsCache', () => ({ getVisibleOwnerIdsCached: async () => mocks.owners }));
import { fetchOrdersForExport } from './exportFetcher';

describe('Cancelled export consistency', () => {
  beforeEach(() => { mocks.calls = []; mocks.owners = ['owner']; });
  it('applies matching filters and restores server sort after data batches', async () => {
    const orders = await fetchOrdersForExport({ status: 'CANCELLED', cancelReason: 'Changed mind',
      cancelledSalespersonId: 'owner', cancelledDateFrom: '2026-09-01', cancelledDateTo: '2026-10-01',
      searchQuery: 'VR', areaFilter: 'B1', sortField: 'cancelled_at', sortDirection: 'desc' }, undefined, 'admin');
    expect(orders.map(order => order.id)).toEqual(['b', 'a']);
    expect(mocks.calls).toContainEqual(['orders', 'eq', 'cancel_reason', 'Changed mind']);
    expect(mocks.calls).toContainEqual(['orders', 'eq', 'salesperson_id', 'owner']);
    expect(mocks.calls).toContainEqual(['orders', 'eq', 'area', 'B1']);
    expect(mocks.calls).toContainEqual(['orders', 'ilike', 'order_code', 'VR%']);
    expect(mocks.calls.some(call => call[1] === 'or' && String(call[2]).includes('cancelled_at.gte.'))).toBe(true);
  });
  it('does not export rows when the role has no visible owners', async () => {
    mocks.owners = [];
    expect(await fetchOrdersForExport({ status: 'CANCELLED' }, undefined, 'salesperson')).toEqual([]);
    expect(mocks.calls.filter(call => call[1] === 'in')).toEqual([]);
  });
});
