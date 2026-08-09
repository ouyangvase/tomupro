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

  it('can group a complete reassignment selection by delivery area', () => {
    const selectedOldOrders = [
      { id: 'belait-1', area: 'Belait' },
      { id: 'belait-2', area: 'Belait' },
      { id: 'tutong-1', area: 'Tutong' },
      { id: 'temburong-1', area: 'Temburong' },
    ];

    const groups = groupRemainingOrdersByLocality(
      selectedOldOrders,
      (order) => order.area,
    );

    expect(groups).toEqual([
      {
        label: 'Belait',
        orders: [
          { id: 'belait-1', area: 'Belait' },
          { id: 'belait-2', area: 'Belait' },
        ],
      },
      { label: 'Temburong', orders: [{ id: 'temburong-1', area: 'Temburong' }] },
      { label: 'Tutong', orders: [{ id: 'tutong-1', area: 'Tutong' }] },
    ]);
    expect(groups.reduce((total, group) => total + group.orders.length, 0)).toBe(4);
  });
});
