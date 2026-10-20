import { describe, expect, it } from 'vitest';
import {
  hasOrderCodeSearch,
  normalizeOrderCodeSearch,
  orderCodeSearchPattern,
  dedupeOrderSearchResults,
  matchesOrderCodeOrPhoneSearch,
} from './orderSearch';

describe('order code search', () => {
  it('normalizes spaces and casing without changing the order code', () => {
    expect(normalizeOrderCodeSearch(' pl 4371 ')).toBe('PL4371');
    expect(orderCodeSearchPattern(' pl 4371 ')).toBe('PL4371%');
  });

  it('only treats non-empty input as an active order search', () => {
    expect(hasOrderCodeSearch()).toBe(false);
    expect(hasOrderCodeSearch('   ')).toBe(false);
    expect(hasOrderCodeSearch('PL4371')).toBe(true);
  });

  it('matches delivered orders by formatted or local phone digits', () => {
    const order = { order_code: 'FX270', phone: '+673 710-9093' };
    expect(matchesOrderCodeOrPhoneSearch(order, '7109093')).toBe(true);
    expect(matchesOrderCodeOrPhoneSearch(order, '+6737109093')).toBe(true);
    expect(matchesOrderCodeOrPhoneSearch(order, 'FX270')).toBe(true);
    expect(matchesOrderCodeOrPhoneSearch(order, '7100000')).toBe(false);
  });

  it('keeps one latest result for duplicate canonical IDs and order codes', () => {
    const results = dedupeOrderSearchResults([
      { id: 'old', order_code: 'PL4371', updated_at: '2026-08-09T00:00:00Z' },
      { id: 'new', order_code: 'PL4371', updated_at: '2026-08-11T00:00:00Z' },
      { id: 'new', order_code: 'PL4371', updated_at: '2026-08-10T00:00:00Z' },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('new');
  });
});
