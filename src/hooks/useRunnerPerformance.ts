import { useQuery } from '@tanstack/react-query';
import { callSupabaseRpc } from '@/lib/supabaseRpc';

export type RunnerPerformanceMetric = {
  assigned: number;
  delivered: number;
  failed: number;
  rescheduled: number;
  pending: number;
  excluded: number;
  cohortTotal: number;
  cashAmount: number;
  transferAmount: number;
  deliveredAmount: number;
  deliveryRate: number;
  reconciliationOk: boolean;
};

export type RunnerPerformanceDay = RunnerPerformanceMetric & {
  date: string;
};

export type RunnerPerformanceOrder = {
  orderId: string;
  orderCode: string;
  customerName: string;
  area: string | null;
  totalAmount: number;
  paymentMethod: string;
  driverId: string | null;
  driverName: string | null;
  result: 'DELIVERED' | 'FAILED' | 'RESCHEDULED' | 'PENDING' | 'EXCLUDED';
  reason: string | null;
  rescheduleDate: string | null;
  cashAmount: number;
  transferAmount: number;
  deliveredAmount: number;
  effectiveAssignmentDate: string;
  assignmentSource: string;
  isExcluded: boolean;
};

export type RunnerPerformanceReport = {
  timeZone: string;
  fromDate: string;
  toDate: string;
  runnerId: string | null;
  summary: RunnerPerformanceMetric;
  days: RunnerPerformanceDay[];
};

export type RunnerPerformanceDayReport = {
  timeZone: string;
  date: string;
  runnerId: string | null;
  summary: RunnerPerformanceMetric;
  orders: RunnerPerformanceOrder[];
};

const numberValue = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const normalizeMetric = (value: Partial<RunnerPerformanceMetric> | null | undefined): RunnerPerformanceMetric => ({
  assigned: numberValue(value?.assigned),
  delivered: numberValue(value?.delivered),
  failed: numberValue(value?.failed),
  rescheduled: numberValue(value?.rescheduled),
  pending: numberValue(value?.pending),
  excluded: numberValue(value?.excluded),
  cohortTotal: numberValue(value?.cohortTotal),
  cashAmount: numberValue(value?.cashAmount),
  transferAmount: numberValue(value?.transferAmount),
  deliveredAmount: numberValue(value?.deliveredAmount),
  deliveryRate: numberValue(value?.deliveryRate),
  reconciliationOk: Boolean(value?.reconciliationOk),
});

const normalizeReport = (value: RunnerPerformanceReport): RunnerPerformanceReport => ({
  timeZone: value?.timeZone || 'Asia/Brunei',
  fromDate: value?.fromDate || '',
  toDate: value?.toDate || '',
  runnerId: value?.runnerId || null,
  summary: normalizeMetric(value?.summary),
  days: Array.isArray(value?.days)
    ? value.days.map((day) => ({ ...normalizeMetric(day), date: day.date }))
    : [],
});

const normalizeDayReport = (value: RunnerPerformanceDayReport): RunnerPerformanceDayReport => ({
  timeZone: value?.timeZone || 'Asia/Brunei',
  date: value?.date || '',
  runnerId: value?.runnerId || null,
  summary: normalizeMetric(value?.summary),
  orders: Array.isArray(value?.orders) ? value.orders : [],
});

export function useRunnerPerformance(runnerId: string | null, fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ['runner-performance', runnerId || 'all', fromDate, toDate],
    queryFn: async () => normalizeReport(await callSupabaseRpc<RunnerPerformanceReport>('get_runner_performance', {
      p_runner_id: runnerId,
      p_from_date: fromDate,
      p_to_date: toDate,
    })),
    enabled: Boolean(fromDate && toDate),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useRunnerPerformanceDay(runnerId: string | null, date: string | null) {
  return useQuery({
    queryKey: ['runner-performance-day', runnerId || 'all', date || 'none'],
    queryFn: async () => normalizeDayReport(await callSupabaseRpc<RunnerPerformanceDayReport>('get_runner_performance_day', {
      p_runner_id: runnerId,
      p_date: date,
    })),
    enabled: Boolean(date),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
