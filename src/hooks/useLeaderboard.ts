import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay,
  startOfQuarter, endOfQuarter, startOfYear, endOfYear,
  format, subMonths, subWeeks, subDays, subQuarters, subYears
} from "date-fns";
import { useEffect } from "react";

export type PeriodMode = 'today' | 'yesterday' | 'week' | 'last_week' | 'month' | 'last_month' | 'quarter' | 'last_quarter' | 'year' | 'lifetime' | 'custom';
export type PrimaryMetric = 'completed_orders' | 'net_sales' | 'delivered_orders' | 'conversion_score' | 'success_rate';
export type VisibilityMode = 'all' | 'top_10_self' | 'self_only';

export interface LeaderboardSettings {
  id: string;
  period_mode: PeriodMode;
  primary_metric: PrimaryMetric;
  tie_breakers: string[];
  visibility_mode: VisibilityMode;
  included_salesperson_ids: string[] | null;
  excluded_salesperson_ids: string[];
  enabled_metrics: string[];
  filters_default: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface LeaderboardParticipant {
  id: string;
  salesperson_id: string;
  is_included: boolean;
  created_at: string;
  updated_by: string | null;
}

export interface LeaderboardRanking {
  salesperson_id: string;
  salesperson_name: string;
  avatar_url: string | null;
  completed_orders: number;
  net_sales: number;
  delivered_orders: number;
  failed_orders: number;
  conversion_score: number;
  success_rate: number;
  rank_position: number;
}

export interface LeaderboardArchive {
  id: string;
  period_start: string;
  period_end: string;
  metric_config_snapshot: Record<string, unknown>;
  ranks: LeaderboardRanking[];
  created_at: string;
}

// Get period dates based on mode
export function getPeriodDates(
  mode: PeriodMode,
  customStart?: Date,
  customEnd?: Date,
  selectedMonth?: number,
  selectedQuarter?: number,
  selectedYear?: number
): { start: Date; end: Date } {
  const now = new Date();
  const year = selectedYear || now.getFullYear();

  switch (mode) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'yesterday': {
      const yd = subDays(now, 1);
      return { start: startOfDay(yd), end: endOfDay(yd) };
    }
    case 'week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'last_week': {
      const lw = subWeeks(now, 1);
      return { start: startOfWeek(lw, { weekStartsOn: 1 }), end: endOfWeek(lw, { weekStartsOn: 1 }) };
    }
    case 'month': {
      const monthDate = selectedMonth !== undefined ? new Date(year, selectedMonth, 1) : now;
      return { start: startOfMonth(monthDate), end: endOfMonth(monthDate) };
    }
    case 'last_month': {
      const lm = subMonths(now, 1);
      return { start: startOfMonth(lm), end: endOfMonth(lm) };
    }
    case 'quarter': {
      const qMonth = selectedQuarter !== undefined ? selectedQuarter * 3 : now.getMonth();
      const qDate = new Date(year, qMonth, 1);
      return { start: startOfQuarter(qDate), end: endOfQuarter(qDate) };
    }
    case 'last_quarter': {
      const lq = subQuarters(now, 1);
      return { start: startOfQuarter(lq), end: endOfQuarter(lq) };
    }
    case 'year': {
      const yDate = new Date(year, 0, 1);
      return { start: startOfYear(yDate), end: endOfYear(yDate) };
    }
    case 'lifetime':
      return { start: new Date(2020, 0, 1), end: endOfDay(now) };
    case 'custom':
      return {
        start: customStart || startOfMonth(now),
        end: customEnd || endOfMonth(now)
      };
    default:
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
}

function formatDateForQuery(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function useLeaderboardSettings() {
  return useQuery({
    queryKey: ['leaderboard-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leaderboard_settings')
        .select('*')
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return {
            id: '', period_mode: 'month' as PeriodMode, primary_metric: 'net_sales' as PrimaryMetric,
            tie_breakers: ['net_sales', 'completed_orders', 'failed_count'],
            visibility_mode: 'all' as VisibilityMode, included_salesperson_ids: null,
            excluded_salesperson_ids: [], enabled_metrics: ['completed_orders', 'net_sales', 'delivered_orders'],
            filters_default: {}, created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(), updated_by: null
          } as LeaderboardSettings;
        }
        throw error;
      }
      return data as LeaderboardSettings;
    },
    staleTime: 60000,
  });
}

export function useUpdateLeaderboardSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Partial<LeaderboardSettings> & { id: string }) => {
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (settings.period_mode) updateData.period_mode = settings.period_mode;
      if (settings.primary_metric) updateData.primary_metric = settings.primary_metric;
      if (settings.visibility_mode) updateData.visibility_mode = settings.visibility_mode;
      if (settings.enabled_metrics) updateData.enabled_metrics = settings.enabled_metrics;
      if (settings.tie_breakers) updateData.tie_breakers = settings.tie_breakers;

      const { data, error } = await supabase.from('leaderboard_settings').update(updateData).eq('id', settings.id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaderboard-settings'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard-rankings'] });
    }
  });
}

export function useLeaderboardParticipants() {
  return useQuery({
    queryKey: ['leaderboard-participants'],
    queryFn: async () => {
      const { data, error } = await supabase.from('leaderboard_participants').select('*');
      if (error) throw error;
      return data as LeaderboardParticipant[];
    }
  });
}

export function useUpsertLeaderboardParticipant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (participant: { salesperson_id: string; is_included: boolean }) => {
      const { data, error } = await supabase.from('leaderboard_participants').upsert({
        salesperson_id: participant.salesperson_id, is_included: participant.is_included,
        updated_by: (await supabase.auth.getUser()).data.user?.id
      }, { onConflict: 'salesperson_id' }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaderboard-participants'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard-rankings'] });
    }
  });
}

export function useLeaderboardRankings(
  periodMode: PeriodMode = 'month',
  primaryMetric: PrimaryMetric = 'net_sales',
  customStart?: Date,
  customEnd?: Date,
  selectedMonth?: number,
  selectedQuarter?: number,
  selectedYear?: number
) {
  const queryClient = useQueryClient();
  const { start, end } = getPeriodDates(periodMode, customStart, customEnd, selectedMonth, selectedQuarter, selectedYear);
  const startStr = formatDateForQuery(start);
  const endStr = formatDateForQuery(end);

  // Removed: leaderboard-orders-realtime subscription
  // The orders table gets many writes; a blanket realtime sub here was redundant
  // with the 60s polling interval below. Polling alone is sufficient for leaderboard.

  const query = useQuery({
    queryKey: ['leaderboard-rankings', periodMode, primaryMetric, startStr, endStr, selectedMonth, selectedQuarter, selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_leaderboard_rankings', {
        p_start_date: startStr, p_end_date: endStr
      });
      if (error) throw error;

      const rankings: LeaderboardRanking[] = (data || []).map((row: {
        salesperson_id: string; salesperson_name: string; avatar_url: string | null;
        delivered_orders: number; failed_orders: number; net_sales: number; completed_orders: number;
      }, index: number) => {
        const deliveredTotal = row.delivered_orders + row.failed_orders;
        return {
          salesperson_id: row.salesperson_id,
          salesperson_name: row.salesperson_name || 'Unknown',
          avatar_url: row.avatar_url || null,
          completed_orders: row.completed_orders,
          net_sales: Number(row.net_sales) || 0,
          delivered_orders: row.delivered_orders,
          failed_orders: row.failed_orders,
          conversion_score: row.delivered_orders > 0 ? Math.round((row.completed_orders / row.delivered_orders) * 100 * 100) / 100 : 0,
          success_rate: deliveredTotal > 0 ? Math.round((row.delivered_orders / deliveredTotal) * 100 * 100) / 100 : 0,
          rank_position: index + 1
        };
      });
      return { rankings, lastUpdated: new Date() };
    },
    refetchInterval: 180000,
    staleTime: 30000,
  });
  return query;
}

export function useMyRanking(
  periodMode: PeriodMode = 'month',
  selectedMonth?: number,
  selectedQuarter?: number,
  selectedYear?: number
) {
  const { profile } = useAuth();
  const { data } = useLeaderboardRankings(periodMode, 'net_sales', undefined, undefined, selectedMonth, selectedQuarter, selectedYear);
  if (!profile || !data?.rankings) return null;
  return data.rankings.find(r => r.salesperson_id === profile.id) || null;
}

export function usePreviousPeriodRanking(periodMode: PeriodMode = 'month') {
  const { profile } = useAuth();
  const now = new Date();
  let prevStart: Date;
  let prevEnd: Date;

  switch (periodMode) {
    case 'today':
      prevStart = startOfDay(subDays(now, 1));
      prevEnd = endOfDay(subDays(now, 1));
      break;
    case 'week':
      prevStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      prevEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      break;
    case 'quarter':
      prevStart = startOfQuarter(subQuarters(now, 1));
      prevEnd = endOfQuarter(subQuarters(now, 1));
      break;
    case 'year':
      prevStart = startOfYear(subYears(now, 1));
      prevEnd = endOfYear(subYears(now, 1));
      break;
    case 'month':
    default: {
      const prevMonth = subMonths(now, 1);
      prevStart = startOfMonth(prevMonth);
      prevEnd = endOfMonth(prevMonth);
      break;
    }
  }

  const { data } = useLeaderboardRankings('custom', 'net_sales', prevStart, prevEnd);
  if (!profile || !data?.rankings) return null;
  return data.rankings.find(r => r.salesperson_id === profile.id) || null;
}

export function useLeaderboardArchive(periodStart?: string, periodEnd?: string) {
  return useQuery({
    queryKey: ['leaderboard-archive', periodStart, periodEnd],
    queryFn: async () => {
      let query = supabase.from('leaderboard_archive').select('*');
      if (periodStart) query = query.eq('period_start', periodStart);
      if (periodEnd) query = query.eq('period_end', periodEnd);
      const { data, error } = await query.order('period_start', { ascending: false });
      if (error) throw error;
      return data as unknown as LeaderboardArchive[];
    }
  });
}

export function useCreateLeaderboardArchive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (archive: { period_start: string; period_end: string; metric_config_snapshot: Record<string, unknown>; ranks: LeaderboardRanking[] }) => {
      const { data, error } = await supabase.from('leaderboard_archive').insert({
        period_start: archive.period_start, period_end: archive.period_end,
        metric_config_snapshot: archive.metric_config_snapshot as unknown as Record<string, never>,
        ranks: archive.ranks as unknown as Record<string, never>[]
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['leaderboard-archive'] }); }
  });
}

export function useVisibleRankings(
  periodMode: PeriodMode = 'month',
  selectedMonth?: number,
  selectedQuarter?: number,
  selectedYear?: number
) {
  const { profile } = useAuth();
  const { data: settings } = useLeaderboardSettings();
  const { data: rankingsData, isLoading, isFetching } = useLeaderboardRankings(
    periodMode, settings?.primary_metric, undefined, undefined,
    selectedMonth, selectedQuarter, selectedYear
  );

  const allRankings = rankingsData?.rankings || [];
  const lastUpdated = rankingsData?.lastUpdated || new Date();

  if (!allRankings.length || !profile) {
    return { rankings: [], top3Rankings: [], lastUpdated, isLoading, isFetching, hasDeliveredOrders: false };
  }

  const visibilityMode = settings?.visibility_mode || 'all';
  const userRole = profile.role;
  const hasDeliveredOrders = allRankings.some(r => r.delivered_orders > 0 || r.net_sales > 0);
  const top3Rankings = allRankings.slice(0, 3);

  if (userRole === 'admin' || userRole === 'manager') {
    return { rankings: allRankings, top3Rankings, lastUpdated, isLoading, isFetching, hasDeliveredOrders };
  }

  if (userRole === 'salesperson') {
    let filteredRankings: LeaderboardRanking[];
    switch (visibilityMode) {
      case 'all': filteredRankings = allRankings; break;
      case 'top_10_self': {
        const top10 = allRankings.slice(0, 10);
        const selfRanking = allRankings.find(r => r.salesperson_id === profile.id);
        filteredRankings = selfRanking && selfRanking.rank_position > 10 ? [...top10, selfRanking] : top10;
        break;
      }
      case 'self_only': filteredRankings = allRankings.filter(r => r.salesperson_id === profile.id); break;
      default: filteredRankings = allRankings;
    }
    return { rankings: filteredRankings, top3Rankings, lastUpdated, isLoading, isFetching, hasDeliveredOrders };
  }

  // Runner/Driver can see general leaderboard
  return { rankings: allRankings, top3Rankings, lastUpdated, isLoading, isFetching, hasDeliveredOrders };
}
