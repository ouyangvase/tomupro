import { describe, expect, it } from 'vitest';
import {
  getDriverAnalyticsCalendarCell,
  summarizeDriverAnalyticsDay,
} from './driverAnalytics';

describe('driver analytics calendar', () => {
  it('shows delivered over assigned with a completion status', () => {
    expect(getDriverAnalyticsCalendarCell(29, 30)).toEqual({
      deliveredOrders: 29,
      assignedOrders: 30,
      percentage: (29 / 30) * 100,
      label: '29 / 30',
      status: 'partial',
    });
    expect(getDriverAnalyticsCalendarCell(0, 0).label).toBe('0 / 0');
    expect(getDriverAnalyticsCalendarCell(0, 2).status).toBe('zero');
    expect(getDriverAnalyticsCalendarCell(3, 3).status).toBe('complete');
  });

  it('partitions the selected day and preserves the assigned denominator', () => {
    const breakdown = summarizeDriverAnalyticsDay([
      { assignment_state: 'DELIVERED' },
      { assignment_state: 'PENDING_ACCEPTANCE' },
      { assignment_state: 'FAILED' },
      { assignment_state: 'RESCHEDULED' },
      { assignment_state: 'ACTIVE' },
      { assignment_state: 'INACTIVE' },
    ], 6);

    expect(breakdown).toEqual({
      assignedOrders: 6,
      deliveredOrders: 1,
      remainingOrders: 5,
      pendingAcceptanceOrders: 1,
      acceptedFailedOrders: 1,
      rescheduledOrders: 1,
      activePendingOrders: 1,
      rejectedReopenedOrders: 1,
    });
  });

  it('reconciles a safe four-day demo fixture across calendar, selected day, and month totals', () => {
    const demoDays = [
      { date: '2026-08-01', delivered: 29, assigned: 30 },
      { date: '2026-08-02', delivered: 3, assigned: 3 },
      { date: '2026-08-03', delivered: 0, assigned: 2 },
      { date: '2026-08-04', delivered: 0, assigned: 0 },
    ];

    expect(demoDays.map((day) => getDriverAnalyticsCalendarCell(day.delivered, day.assigned).label)).toEqual([
      '29 / 30',
      '3 / 3',
      '0 / 2',
      '0 / 0',
    ]);

    const selectedDay = summarizeDriverAnalyticsDay([
      ...Array.from({ length: 29 }, () => ({ assignment_state: 'DELIVERED' })),
      { assignment_state: 'ACTIVE' },
    ], 30);
    expect(selectedDay).toMatchObject({
      assignedOrders: 30,
      deliveredOrders: 29,
      remainingOrders: 1,
      activePendingOrders: 1,
    });

    const monthTotals = demoDays.reduce(
      (totals, day) => ({
        delivered: totals.delivered + day.delivered,
        assigned: totals.assigned + day.assigned,
      }),
      { delivered: 0, assigned: 0 },
    );
    expect(getDriverAnalyticsCalendarCell(monthTotals.delivered, monthTotals.assigned).label).toBe('32 / 35');
  });
});
