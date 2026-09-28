import { describe, expect, it } from 'vitest';
import { applyCancelledFilters, CANCELLED_ORDER_SELECT } from './cancelledOrderQuery';

describe('cancelled query filters shared by list, IDs and export', () => {
  it('filters before pagination with cancellation date fallback', () => {
    const calls: unknown[][] = [];
    const query = { eq: (...args: string[]) => { calls.push(args); return query; }, or: (s: string) => { calls.push(['or',s]); return query; } };
    applyCancelledFilters(query, { status: 'CANCELLED', cancelReason: 'Changed mind', cancelledSalespersonId: 'owner', cancelledDateFrom: '2026-09-01T00:00:00Z', cancelledDateTo: '2026-10-01T00:00:00Z' });
    expect(calls.slice(0,2)).toEqual([['cancel_reason','Changed mind'],['salesperson_id','owner']]);
    expect(calls[2][1]).toContain('and(cancelled_at.is.null,updated_at.gte.');
    expect(CANCELLED_ORDER_SELECT).not.toContain('*');
  });
  it('does not change other lists or apply all filters literally', () => {
    const query = { eq: () => { throw Error('Unexpected filter'); }, or: () => { throw Error('Unexpected filter'); } };
    expect(applyCancelledFilters(query, {status:'READY',cancelReason:'reason'})).toBe(query);
    expect(applyCancelledFilters(query, {status:'CANCELLED',cancelReason:'all',cancelledSalespersonId:'all'})).toBe(query);
  });
});
