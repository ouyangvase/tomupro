import { differenceInDays, startOfDay } from 'date-fns';
import type { Order } from '@/types/database';

export type ReminderState = 'none' | 'upcoming' | 'due_today' | 'overdue';

export function calculateReminderState(order: Order): ReminderState {
  // Only applicable for BOOKING orders with expected_pickup_date
  if (order.status !== 'BOOKING' || !order.expected_pickup_date) {
    return 'none';
  }

  const today = startOfDay(new Date());
  const expectedDate = startOfDay(new Date(order.expected_pickup_date));
  const daysUntil = differenceInDays(expectedDate, today);

  // Reminder starts 2 days before expected date
  if (daysUntil > 2) {
    return 'none';
  } else if (daysUntil === 0) {
    return 'due_today';
  } else if (daysUntil > 0) {
    return 'upcoming'; // 1-2 days before
  } else {
    return 'overdue'; // Past expected date
  }
}

export function getReminderBadgeProps(state: ReminderState) {
  switch (state) {
    case 'overdue':
      return { variant: 'destructive' as const, text: 'Overdue' };
    case 'due_today':
      return { variant: 'default' as const, text: 'Due Today' };
    case 'upcoming':
      return { variant: 'secondary' as const, text: 'Upcoming' };
    default:
      return null;
  }
}
