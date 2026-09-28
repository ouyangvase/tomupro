import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { callSupabaseRpc } from '@/lib/supabaseRpc';

export interface OperationsDeliveryMetric {
  total: number;
  delivered: number;
  failed: number;
  rescheduled: number;
  pending: number;
  rate: number | null;
}

export interface OperationsRunnerMetric {
  runnerId: string;
  runnerName: string;
  areas: string;
  yesterday: { total: number; delivered: number; rate: number | null };
  month: { total: number; delivered: number; rate: number | null };
  outstanding: { amount: number; orders: number; oldestDays: number };
}

export interface AdminOperationsDashboard {
  timeZone: string;
  asOfDate: string;
  outstanding: {
    amount: number;
    runners: number;
    oldestDays: number;
    byRunner: Array<{
      runnerId: string | null;
      runnerName: string;
      areas: string | null;
      amount: number;
      orders: number;
      oldestDays: number;
    }>;
  };
  yesterday: OperationsDeliveryMetric & { date: string };
  month: OperationsDeliveryMetric & { fromDate: string; toDate: string; previousRate: number | null };
  today: { date: string; total: number; ready: number; assigned: number; unassigned: number; rescheduledToday: number };
  attention: { total: number; unassigned: number; failed: number; rescheduled: number; pending24h: number; paymentIssues: number };
  runners: OperationsRunnerMetric[];
}

const numberOrZero = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullableRate = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

function normalizeMetric(value: unknown): OperationsDeliveryMetric {
  const metric = asRecord(value);
  return {
    total: numberOrZero(metric.total),
    delivered: numberOrZero(metric.delivered),
    failed: numberOrZero(metric.failed),
    rescheduled: numberOrZero(metric.rescheduled),
    pending: numberOrZero(metric.pending),
    rate: nullableRate(metric.rate),
  };
}

function normalizeDashboard(value: unknown): AdminOperationsDashboard {
  const dashboard = asRecord(value);
  const outstanding = asRecord(dashboard.outstanding);
  const yesterday = asRecord(dashboard.yesterday);
  const month = asRecord(dashboard.month);
  const today = asRecord(dashboard.today);
  const attention = asRecord(dashboard.attention);
  return {
    timeZone: String(dashboard.timeZone || 'Asia/Brunei'),
    asOfDate: String(dashboard.asOfDate || ''),
    outstanding: {
      amount: numberOrZero(outstanding.amount),
      runners: numberOrZero(outstanding.runners),
      oldestDays: numberOrZero(outstanding.oldestDays),
      byRunner: Array.isArray(outstanding.byRunner) ? outstanding.byRunner.map((row) => {
        const runner = asRecord(row);
        return {
        runnerId: runner.runnerId || null,
        runnerName: String(runner.runnerName || 'Unassigned runner'),
        areas: runner.areas || null,
        amount: numberOrZero(runner.amount),
        orders: numberOrZero(runner.orders),
        oldestDays: numberOrZero(runner.oldestDays),
        };
      }) : [],
    },
    yesterday: { ...normalizeMetric(yesterday), date: String(yesterday.date || '') },
    month: {
      ...normalizeMetric(month),
      fromDate: String(month.fromDate || ''),
      toDate: String(month.toDate || ''),
      previousRate: nullableRate(month.previousRate),
    },
    today: {
      date: String(today.date || ''),
      total: numberOrZero(today.total),
      ready: numberOrZero(today.ready),
      assigned: numberOrZero(today.assigned),
      unassigned: numberOrZero(today.unassigned),
      rescheduledToday: numberOrZero(today.rescheduledToday),
    },
    attention: {
      total: numberOrZero(attention.total),
      unassigned: numberOrZero(attention.unassigned),
      failed: numberOrZero(attention.failed),
      rescheduled: numberOrZero(attention.rescheduled),
      pending24h: numberOrZero(attention.pending24h),
      paymentIssues: numberOrZero(attention.paymentIssues),
    },
    runners: Array.isArray(dashboard.runners) ? dashboard.runners.map((row) => {
      const runner = asRecord(row);
      const yesterdayRunner = asRecord(runner.yesterday);
      const monthRunner = asRecord(runner.month);
      const outstandingRunner = asRecord(runner.outstanding);
      return {
      runnerId: String(runner.runnerId || ''),
      runnerName: String(runner.runnerName || 'Unknown runner'),
      areas: String(runner.areas || ''),
      yesterday: {
        total: numberOrZero(yesterdayRunner.total),
        delivered: numberOrZero(yesterdayRunner.delivered),
        rate: nullableRate(yesterdayRunner.rate),
      },
      month: {
        total: numberOrZero(monthRunner.total),
        delivered: numberOrZero(monthRunner.delivered),
        rate: nullableRate(monthRunner.rate),
      },
      outstanding: {
        amount: numberOrZero(outstandingRunner.amount),
        orders: numberOrZero(outstandingRunner.orders),
        oldestDays: numberOrZero(outstandingRunner.oldestDays),
      },
      };
    }) : [],
  };
}

export function useAdminOperationsDashboard() {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ['admin-operations-dashboard', user?.id],
    queryFn: async () => normalizeDashboard(await callSupabaseRpc('get_admin_operations_dashboard', {})),
    enabled: Boolean(user?.id && role === 'admin'),
    staleTime: 30_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });
}
