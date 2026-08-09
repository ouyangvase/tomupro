import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface FinanceOverviewDay {
  date: string;
  assigned: number;
  delivered: number;
  failed: number;
  rescheduled: number;
  otherActionRequired: number;
  codAmount: number;
  transferAmount: number;
}

export interface FinanceOverviewSummary {
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
    const channel = rpcClient.channel(`finance-overview-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reschedule_history' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'runner_assignment_history' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, invalidate)
      .subscribe();
    return () => { void rpcClient.removeChannel(channel); };
  }, [queryClient, user?.id]);

  return useQuery({
    queryKey: ['finance-overview', user?.id, runnerId, area, fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await rpcClient.rpc('get_finance_overview_report', {
        p_runner_id: runnerId,
        p_area: area,
        p_from_date: fromDate,
        p_to_date: toDate,
      });
      if (error) throw error;
      return data as FinanceOverviewReport;
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
      const { data, error } = await rpcClient.rpc('get_finance_overview_day', {
        p_runner_id: runnerId,
        p_area: area,
        p_date: date,
      });
      if (error) throw error;
      return data as FinanceOverviewDayReport;
    },
    enabled: Boolean(user?.id && date),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}
