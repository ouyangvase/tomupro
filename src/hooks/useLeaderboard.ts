import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, subMonths, subQuarters, subYears,
  format
} from "date-fns";
import { useEffect, useMemo } from "react";

// ── Types ───────────────────────────────────────────────────────────────────

export type PeriodTab = 'monthly' | 'quarterly' | 'yearly';
export type PrimaryMetric = 'completed_orders' | 'net_sales' | 'delivered_orders' | 'conversion_score' | 'success_rate';
export type VisibilityMode = 'all' | 'top_10_self' | 'self_only';

// Keep the old PeriodMode for backwards compat with dashboard card etc.
export type PeriodMode = 'today' | 'week' | 'month' | 'custom';

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
  improvement_pct: number | null; // null = NEW, number = percentage change
}

export interface LeaderboardArchive {
  id: string;
  period_start: string;
  period_end: string;
  metric_config_snapshot: Record<string, unknown>;
  ranks: LeaderboardRanking[];
  created_at: string;
}

// ── Period Calculation ──────────────────────────────────────────────────────

/**
 * Get start/end dates for a given period tab and reference date (selected month).
 * ALL dates are based on delivered_at — the only source of truth.
 */
export function getTabPeriodDates(
  tab: PeriodTab,
  selectedMonth: Date
): { start: Date; end: Date } {
  switch (tab) {
    case 'monthly':
      return { start: startOfMonth(selectedMonth), end: endOfMonth(selectedMonth) };
    case 'quarterly':
      return { start: startOfQuarter(selectedMonth), end: endOfQuarter(selectedMonth) };
    case 'yearly':
      return { start: startOfYear(selectedMonth), end: endOfYear(selectedMonth) };
    default:
      return { start: startOfMonth(selectedMonth), end: endOfMonth(selectedMonth) };
  }
}

/**
 * Get the previous period for comparison (improvement %).
 */
export function getPreviousPeriodDates(
  tab: PeriodTab,
  selectedMonth: Date
): { start: Date; end: Date } {
  switch (tab) {
    case 'monthly': {
      const prev = subMonths(selectedMonth, 1);
      return { start: startOfMonth(prev), end: endOfMonth(prev) };
    }
    case 'quarterly': {
      const prev = subQuarters(selectedMonth, 1);
      return { start: startOfQuarter(prev), end: endOfQuarter(prev) };
    }
    case 'yearly': {
      const prev = subYears(selectedMonth, 1);
      return { start: startOfYear(prev), end: endOfYear(prev) };
    }
    default: {
      const prev = subMonths(selectedMonth, 1);
      return { start: startOfMonth(prev), end: endOfMonth(prev) };
    }
  }
}

// Legacy getPeriodDates for backward compat (dashboard card)
export function getPeriodDates(mode: PeriodMode, customStart?: Date, customEnd?: Date): { start: Date; end: Date } {
  const now = new Date();
  switch (mode) {
    case 'today':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'week':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
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

// ── Available Months ────────────────────────────────────────────────────────

/**
 * Fetch distinct months from delivered_at in the orders table.
 */
export function useAvailableMonths() {
  return useQuery({
    queryKey: ['leaderboard-available-months'],
    queryFn: async () => {
      // Query distinct months from delivered_at
      const { data, error } = await supabase
        .from('orders')
        .select('delivered_at')
        .not('delivered_at', 'is', null)
        .order('delivered_at', { ascending: false });

      if (error) throw error;

      // Extract unique year-month combinations
      const monthSet = new Set<string>();
      (data || []).forEach((row: { delivered_at: string | null }) => {
        if (row.delivered_at) {
          const d = new Date(row.delivered_at);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          monthSet.add(key);
        }
      });

      // Convert to sorted array of Date objects (first day of month)
      const months = Array.from(monthSet)
        .sort((a, b) => b.localeCompare(a))
        .map(key => {
          const [year, month] = key.split('-');
          return new Date(parseInt(year), parseInt(month) - 1, 1);
        });

      return months;
    },
    staleTime: 300000, // 5 min cache
  });
}

// ── Settings ────────────────────────────────────────────────────────────────

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
            id: '',
            period_mode: 'month' as PeriodMode,
            primary_metric: 'net_sales' as PrimaryMetric,
            tie_breakers: ['net_sales', 'completed_orders', 'failed_count'],
            visibility_mode: 'all' as VisibilityMode,
            included_salesperson_ids: null,
            excluded_salesperson_ids: [],
            enabled_metrics: ['completed_orders', 'net_sales', 'delivered_orders'],
            filters_default: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updated_by: null
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
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString()
      };
      if (settings.period_mode) updateData.period_mode = settings.period_mode;
      if (settings.primary_metric) updateData.primary_metric = settings.primary_metric;
      if (settings.visibility_mode) updateData.visibility_mode = settings.visibility_mode;
      if (settings.enabled_metrics) updateData.enabled_metrics = settings.enabled_metrics;
      if (settings.tie_breakers) updateData.tie_breakers = settings.tie_breakers;

      const { data, error } = await supabase
        .from('leaderboard_settings')
        .update(updateData)
        .eq('id', settings.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaderboard-settings'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard-rankings'] });
    }
  });
}

// ── Participants ─────────────────────────────────────────────────────────────

export function useLeaderboardParticipants() {
  return useQuery({
    queryKey: ['leaderboard-participants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leaderboard_participants')
        .select('*');
      if (error) throw error;
      return data as LeaderboardParticipant[];
    }
  });
}

export function useUpsertLeaderboardParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (participant: { salesperson_id: string; is_included: boolean }) => {
      const { data, error } = await supabase
        .from('leaderboard_participants')
        .upsert({
          salesperson_id: participant.salesperson_id,
          is_included: participant.is_included,
          updated_by: (await supabase.auth.getUser()).data.user?.id
        }, { onConflict: 'salesperson_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaderboard-participants'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard-rankings'] });
    }
  });
}

// ── Core Rankings Query ─────────────────────────────────────────────────────

interface RawRankingRow {
  salesperson_id: string;
  salesperson_name: string;
  avatar_url: string | null;
  delivered_orders: number;
  failed_orders: number;
  net_sales: number;
  completed_orders: number;
}

function mapRankings(data: RawRankingRow[]): Omit<LeaderboardRanking, 'improvement_pct'>[] {
  return (data || []).map((row, index) => {
    const deliveredTotal = row.delivered_orders + row.failed_orders;
    return {
      salesperson_id: row.salesperson_id,
      salesperson_name: row.salesperson_name || 'Unknown',
      avatar_url: row.avatar_url || null,
      completed_orders: row.completed_orders,
      net_sales: Number(row.net_sales) || 0,
      delivered_orders: row.delivered_orders,
      failed_orders: row.failed_orders,
      conversion_score: row.delivered_orders > 0
        ? Math.round((row.completed_orders / row.delivered_orders) * 100 * 100) / 100
        : 0,
      success_rate: deliveredTotal > 0
        ? Math.round((row.delivered_orders / deliveredTotal) * 100 * 100) / 100
        : 0,
      rank_position: index + 1
    };
  });
}

/**
 * Fetch rankings for a specific date range.
 * Uses the get_leaderboard_rankings RPC which filters by delivered_at.
 */
function useRankingsForRange(startStr: string, endStr: string, enabled = true) {
  return useQuery({
    queryKey: ['leaderboard-rankings', startStr, endStr],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_leaderboard_rankings', {
        p_start_date: startStr,
        p_end_date: endStr
      });
      if (error) throw error;
      return mapRankings(data as RawRankingRow[]);
    },
    enabled,
    staleTime: 10000,
  });
}

/**
 * Main hook for the leaderboard page.
 * Fetches current + previous period, computes improvement %.
 */
export function useLeaderboardRankingsWithImprovement(
  tab: PeriodTab,
  selectedMonth: Date
) {
  const queryClient = useQueryClient();

  const { start, end } = getTabPeriodDates(tab, selectedMonth);
  const { start: prevStart, end: prevEnd } = getPreviousPeriodDates(tab, selectedMonth);

  const startStr = formatDateForQuery(start);
  const endStr = formatDateForQuery(end);
  const prevStartStr = formatDateForQuery(prevStart);
  const prevEndStr = formatDateForQuery(prevEnd);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('leaderboard-orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['leaderboard-rankings'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const currentQuery = useRankingsForRange(startStr, endStr);
  const prevQuery = useRankingsForRange(prevStartStr, prevEndStr);

  // Merge improvement %
  const rankings = useMemo<LeaderboardRanking[]>(() => {
    if (!currentQuery.data) return [];

    const prevMap = new Map<string, number>();
    (prevQuery.data || []).forEach(r => {
      prevMap.set(r.salesperson_id, r.net_sales);
    });

    return currentQuery.data.map(r => {
      const prevSales = prevMap.get(r.salesperson_id);
      let improvement_pct: number | null = null;

      if (prevSales === undefined) {
        // Not in previous period at all → NEW
        improvement_pct = r.net_sales > 0 ? null : null;
      } else if (prevSales === 0 && r.net_sales > 0) {
        // Was zero, now has sales → NEW
        improvement_pct = null;
      } else if (prevSales === 0 && r.net_sales === 0) {
        improvement_pct = 0;
      } else if (prevSales > 0) {
        improvement_pct = Math.round(((r.net_sales - prevSales) / prevSales) * 100 * 10) / 10;
      }

      return { ...r, improvement_pct };
    });
  }, [currentQuery.data, prevQuery.data]);

  return {
    rankings,
    lastUpdated: new Date(),
    isLoading: currentQuery.isLoading,
    isFetching: currentQuery.isFetching || prevQuery.isFetching,
  };
}

// Legacy hook (dashboard card uses this)
export function useLeaderboardRankings(
  periodMode: PeriodMode = 'month',
  primaryMetric: PrimaryMetric = 'net_sales',
  customStart?: Date,
  customEnd?: Date
) {
  const queryClient = useQueryClient();

  const { start, end } = getPeriodDates(periodMode, customStart, customEnd);
  const startStr = formatDateForQuery(start);
  const endStr = formatDateForQuery(end);

  useEffect(() => {
    const channel = supabase
      .channel('leaderboard-orders-realtime-legacy')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['leaderboard-rankings'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const query = useQuery({
    queryKey: ['leaderboard-rankings', periodMode, primaryMetric, startStr, endStr],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_leaderboard_rankings', {
        p_start_date: startStr,
        p_end_date: endStr
      });
      if (error) throw error;

      const rankings: LeaderboardRanking[] = mapRankings(data as RawRankingRow[]).map(r => ({
        ...r,
        improvement_pct: null
      }));

      return { rankings, lastUpdated: new Date() };
    },
    refetchInterval: 30000,
    staleTime: 5000,
  });

  return query;
}

// ── User-specific hooks ─────────────────────────────────────────────────────

export function useMyRanking(periodMode: PeriodMode = 'month') {
  const { profile } = useAuth();
  const { data } = useLeaderboardRankings(periodMode);
  if (!profile || !data?.rankings) return null;
  return data.rankings.find(r => r.salesperson_id === profile.id) || null;
}

export function usePreviousPeriodRanking(periodMode: PeriodMode = 'month') {
  const { profile } = useAuth();
  const now = new Date();
  const prevMonth = subMonths(now, 1);
  const prevStart = startOfMonth(prevMonth);
  const prevEnd = endOfMonth(prevMonth);

  const { data } = useLeaderboardRankings('custom', 'net_sales', prevStart, prevEnd);
  if (!profile || !data?.rankings) return null;
  return data.rankings.find(r => r.salesperson_id === profile.id) || null;
}

// ── Archive ─────────────────────────────────────────────────────────────────

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
    mutationFn: async (archive: {
      period_start: string;
      period_end: string;
      metric_config_snapshot: Record<string, unknown>;
      ranks: LeaderboardRanking[];
    }) => {
      const { data, error } = await supabase
        .from('leaderboard_archive')
        .insert({
          period_start: archive.period_start,
          period_end: archive.period_end,
          metric_config_snapshot: archive.metric_config_snapshot as unknown as Record<string, never>,
          ranks: archive.ranks as unknown as Record<string, never>[]
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaderboard-archive'] });
    }
  });
}

// ── Visibility Filtering ────────────────────────────────────────────────────

export function useVisibleRankingsNew(tab: PeriodTab, selectedMonth: Date) {
  const { profile } = useAuth();
  const { data: settings } = useLeaderboardSettings();
  const { rankings: allRankings, lastUpdated, isLoading, isFetching } =
    useLeaderboardRankingsWithImprovement(tab, selectedMonth);

  if (!allRankings.length || !profile) {
    return {
      rankings: [],
      top3Rankings: [],
      lastUpdated,
      isLoading,
      isFetching,
      hasDeliveredOrders: false
    };
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
      case 'all':
        filteredRankings = allRankings;
        break;
      case 'top_10_self': {
        const top10 = allRankings.slice(0, 10);
        const selfRanking = allRankings.find(r => r.salesperson_id === profile.id);
        if (selfRanking && selfRanking.rank_position > 10) {
          filteredRankings = [...top10, selfRanking];
        } else {
          filteredRankings = top10;
        }
        break;
      }
      case 'self_only':
        filteredRankings = allRankings.filter(r => r.salesperson_id === profile.id);
        break;
      default:
        filteredRankings = allRankings;
    }
    return { rankings: filteredRankings, top3Rankings, lastUpdated, isLoading, isFetching, hasDeliveredOrders };
  }

  return { rankings: [], top3Rankings: [], lastUpdated, isLoading, isFetching, hasDeliveredOrders: false };
}

// Legacy useVisibleRankings for dashboard card
export function useVisibleRankings(periodMode: PeriodMode = 'month') {
  const { profile } = useAuth();
  const { data: settings } = useLeaderboardSettings();
  const { data: rankingsData, isLoading, isFetching } = useLeaderboardRankings(periodMode, settings?.primary_metric);

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
      case 'all':
        filteredRankings = allRankings;
        break;
      case 'top_10_self': {
        const top10 = allRankings.slice(0, 10);
        const selfRanking = allRankings.find(r => r.salesperson_id === profile.id);
        if (selfRanking && selfRanking.rank_position > 10) {
          filteredRankings = [...top10, selfRanking];
        } else {
          filteredRankings = top10;
        }
        break;
      }
      case 'self_only':
        filteredRankings = allRankings.filter(r => r.salesperson_id === profile.id);
        break;
      default:
        filteredRankings = allRankings;
    }
    return { rankings: filteredRankings, top3Rankings, lastUpdated, isLoading, isFetching, hasDeliveredOrders };
  }

  return { rankings: [], top3Rankings: [], lastUpdated, isLoading, isFetching, hasDeliveredOrders: false };
}
