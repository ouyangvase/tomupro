import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToOrderRealtime } from '@/lib/orderRealtime';

export interface FinanceOverviewDay {
  date: string;
  assigned: number;
  delivered: number;
  failed: number;
  rescheduled: number;
  otherActionRequired: number;
  codAmount: number;
  transferAmount: number;
  salesValue?: number;
  transferPaid?: number;
  codDue?: number;
  codCollected?: number;
  totalCollected?: number;
  outstanding?: number;
}

export interface FinanceOverviewSummary {
  unverifiedClosedCount?: number;
  assigned: number;
  delivered: number;
  failed: number;
  rescheduled: number;
  otherActionRequired: number;
  openCurrent: number;
  deliveredAmount: number;
  codCount: number;
  codAmount: number;
  transferCount: number;
  transferAmount: number;
  salesValue?: number;
  transferPaid?: number;
  codDue?: number;
  codCollected?: number;
  totalCollected?: number;
  outstanding?: number;
}

export interface FinanceOpenBreakdown {
  total: number;
  booking: number;
  ready: number;
  assignedDelivery: number;
  awaitingRunnerAcceptance: number;
  futureScheduled: number;
  otherUnresolved: number;
}

export interface FinanceOverviewReport {
  timeZone: string;
  fromDate: string;
  toDate: string;
  runnerId: string | null;
  area: string | null;
  summary: FinanceOverviewSummary;
  open: FinanceOpenBreakdown;
  days: FinanceOverviewDay[];
}

export interface FinanceOverviewOrder {
  orderId: string;
  eventId: string;
  orderCode: string;
  customerName: string | null;
  area: string | null;
  totalAmount: number;
  paymentMethod: string | null;
  runnerId: string | null;
  classification: 'ASSIGNED' | 'DELIVERED' | 'FAILED_DELIVERY' | 'RESCHEDULED' | 'RUNNER_FLAGGED' | 'MANUAL';
  source: string;
  eventDate: string;
  reason: string | null;
  rescheduleDate: string | null;
}

export interface FinanceOverviewDayReport {
  date: string;
  runnerId: string | null;
  area: string | null;
  summary: Omit<FinanceOverviewSummary, 'assigned' | 'openCurrent' | 'deliveredAmount' | 'codCount' | 'transferCount'> & {
    assigned: number;
    delivered: number;
  };
  orders: FinanceOverviewOrder[];
}

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: Error | null }>;
  channel(name: string): ReturnType<typeof supabase.channel>;
  removeChannel(channel: ReturnType<typeof supabase.channel>): Promise<unknown>;
};

const rpcClient = supabase as unknown as RpcClient;

type FinancePaymentBreakdown = {
  summary: {
    salesValue: number;
    transferPaid: number;
    codDue: number;
    codCollected: number;
    totalCollected: number;
    outstanding: number;
    codCount: number;
    transferCount: number;
  };
  days: Array<FinanceOverviewDay & {
    salesValue: number;
    transferPaid: number;
    codDue: number;
    codCollected: number;
    totalCollected: number;
    outstanding: number;
  }>;
};

function mergePaymentBreakdown(report: FinanceOverviewReport, payments: FinancePaymentBreakdown): FinanceOverviewReport {
  return {
    ...report,
    summary: {
      ...report.summary,
      deliveredAmount: payments.summary.salesValue,
      codCount: payments.summary.codCount,
      codAmount: payments.summary.codDue,
      transferCount: payments.summary.transferCount,
      transferAmount: payments.summary.transferPaid,
      ...payments.summary,
    },
    days: report.days.map((day) => {
      const paymentDay = payments.days.find((candidate) => candidate.date === day.date);
      return paymentDay ? { ...day, ...paymentDay, codAmount: paymentDay.codDue, transferAmount: paymentDay.transferPaid } : day;
    }),
  };
}

export function useFinanceOverviewAreas() {
  const { user, role } = useAuth();
  return useQuery({
    queryKey: ['finance-overview-areas', user?.id, role],
    queryFn: async () => {
      const { data, error } = await rpcClient.rpc('get_finance_overview_areas', {});
      if (error) throw error;
      return ((data || []) as Array<{ area: string }>).map((row) => row.area).filter(Boolean);
    },
    enabled: Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
  });
}

export function useFinanceOverviewRunners() {
  const { user, role } = useAuth();
  return useQuery({
    queryKey: ['finance-overview-runners', user?.id, role],
    queryFn: async () => {
      const { data, error } = await rpcClient.rpc('get_finance_overview_runners', {});
      if (error) throw error;
      return (data || []) as Array<{ id: string; display_name: string | null; email: string | null }>;
    },
    enabled: Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
  });
}

export function useFinanceOverviewReport(params: { runnerId: string | null; area: string | null; fromDate: string; toDate: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { runnerId, area, fromDate, toDate } = params;

  useEffect(() => {
    if (!user?.id) return;
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['finance-overview'] });
    };
    const stopOrderSubscription = subscribeToOrderRealtime({
      userId: user.id,
      role: null,
      scope: 'main',
      onPayload: invalidate,
    });
    return () => {
      stopOrderSubscription();
    };
  }, [queryClient, user?.id]);

  return useQuery({
    queryKey: ['finance-overview', user?.id, runnerId, area, fromDate, toDate],
    queryFn: async () => {
      const [reportResponse, paymentResponse] = await Promise.all([
        rpcClient.rpc('get_finance_overview_report', {
          p_runner_id: runnerId,
          p_area: area,
          p_from_date: fromDate,
          p_to_date: toDate,
        }),
        rpcClient.rpc('get_finance_payment_breakdown', {
          p_runner_id: runnerId,
          p_area: area,
          p_from_date: fromDate,
          p_to_date: toDate,
        }),
      ]);
      if (reportResponse.error) throw reportResponse.error;
      if (paymentResponse.error) throw paymentResponse.error;
      return mergePaymentBreakdown(reportResponse.data as FinanceOverviewReport, paymentResponse.data as FinancePaymentBreakdown);
    },
    enabled: Boolean(user?.id && fromDate && toDate),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useFinanceOverviewDay(params: { runnerId: string | null; area: string | null; date: string | null }) {
  const { user } = useAuth();
  const { runnerId, area, date } = params;
  return useQuery({
    queryKey: ['finance-overview-day', user?.id, runnerId, area, date],
    queryFn: async () => {
      const [dayResponse, paymentResponse] = await Promise.all([
        rpcClient.rpc('get_finance_overview_day', {
          p_runner_id: runnerId,
          p_area: area,
          p_date: date,
        }),
        rpcClient.rpc('get_finance_payment_breakdown', {
          p_runner_id: runnerId,
          p_area: area,
          p_from_date: date,
          p_to_date: date,
        }),
      ]);
      if (dayResponse.error) throw dayResponse.error;
      if (paymentResponse.error) throw paymentResponse.error;
      const dayReport = dayResponse.data as FinanceOverviewDayReport;
      const payments = paymentResponse.data as FinancePaymentBreakdown;
      const paymentSummary = payments.summary;
      return {
        ...dayReport,
        summary: {
          ...dayReport.summary,
          deliveredAmount: paymentSummary.salesValue,
          codAmount: paymentSummary.codDue,
          transferAmount: paymentSummary.transferPaid,
          ...paymentSummary,
        },
      };
    },
    enabled: Boolean(user?.id && date),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}
