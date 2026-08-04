import { describe, expect, it } from 'vitest';
import { groupRemainingOrdersByLocality } from './driverInboxAreaCounts';

describe('groupRemainingOrdersByLocality', () => {
  it('counts only current remaining orders, not assigned history', () => {
    const allOrders = [
      { id: 'assigned-gadong', locality: 'GADONG', assigned: true },
      { id: 'remaining-gadong', locality: 'GADONG', assigned: false },
      { id: 'remaining-rimba', locality: 'RIMBA', assigned: false },
      { id: 'remaining-rimba-2', locality: 'RIMBA', assigned: false },
    ];
    const remainingOrders = allOrders.filter((order) => !order.assigned);
    const groups = groupRemainingOrdersByLocality(
      remainingOrders,
      (order) => order.locality,
    );

    expect(groups).toEqual([
      { label: 'GADONG', orders: [{ id: 'remaining-gadong', locality: 'GADONG', assigned: false }] },
      {
        label: 'RIMBA',
        orders: [
          { id: 'remaining-rimba', locality: 'RIMBA', assigned: false },
          { id: 'remaining-rimba-2', locality: 'RIMBA', assigned: false },
        ],
      },
    ]);
    expect(groups.reduce((total, group) => total + group.orders.length, 0)).toBe(3);
    expect(groups.flatMap(({ orders }) => orders.map(({ id }) => id))).not.toContain('assigned-gadong');
  });
});
