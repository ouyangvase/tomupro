import { describe, expect, it } from 'vitest';
import { indexBindingPairs, matchesBindingCount, pluralizeBinding } from './systemBindings';

describe('system binding helpers', () => {
  it('keeps one subject linked to multiple owners as separate pairs', () => {
    const pairs = [
      { id: 'a', ownerId: 'allen', subjectId: 'huiting' },
      { id: 'b', ownerId: 'emily', subjectId: 'huiting' },
      { id: 'c', ownerId: 'yc2', subjectId: 'huiting' },
    ];

    const indexed = indexBindingPairs(pairs);
    expect(indexed.bySubject.get('huiting')).toHaveLength(3);
    expect(indexed.byOwner.get('allen')).toEqual([pairs[0]]);
  });

  it('removes only the requested pair from an in-memory refresh', () => {
    const remaining = [
      { id: 'b', ownerId: 'emily', subjectId: 'huiting' },
      { id: 'c', ownerId: 'yc2', subjectId: 'huiting' },
    ];

    const indexed = indexBindingPairs(remaining);
    expect(indexed.bySubject.get('huiting')?.map((pair) => pair.ownerId)).toEqual(['emily', 'yc2']);
  });

  it('uses correct count filters and wording', () => {
    expect(matchesBindingCount(0, 'none')).toBe(true);
    expect(matchesBindingCount(3, 'two-three')).toBe(true);
    expect(matchesBindingCount(4, 'four-plus')).toBe(true);
    expect(pluralizeBinding(1, 'manager')).toBe('1 manager');
    expect(pluralizeBinding(3, 'salesperson')).toBe('3 salespersons');
  });
});
