import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, format, subMonths } from "date-fns";

export type PeriodMode = 'today' | 'week' | 'month' | 'custom';
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
export function getPeriodDates(mode: PeriodMode, customStart?: Date, customEnd?: Date): { start: Date; end: Date } {
  const now = new Date();
  switch (mode) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
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

// Format date for database query
function formatDateForQuery(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

// Hook to fetch leaderboard settings
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
        // Return default settings if none exist
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

// Hook to update leaderboard settings
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

// Hook to fetch leaderboard participants
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

// Hook to upsert leaderboard participant
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

// Hook to fetch leaderboard rankings
export function useLeaderboardRankings(
  periodMode: PeriodMode = 'month',
  primaryMetric: PrimaryMetric = 'net_sales',
  customStart?: Date,
  customEnd?: Date
) {
  const { profile } = useAuth();
  const { data: settings } = useLeaderboardSettings();
  const { data: participants } = useLeaderboardParticipants();
  
  const { start, end } = getPeriodDates(periodMode, customStart, customEnd);
  
  return useQuery({
    queryKey: ['leaderboard-rankings', periodMode, primaryMetric, formatDateForQuery(start), formatDateForQuery(end)],
    queryFn: async () => {
      // Calculate rankings from orders directly
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          salesperson_id,
          total_amount,
          discount_amount,
          runner_status,
          driver_status,
          reconciliation_status,
          order_date
        `)
        .gte('order_date', formatDateForQuery(start))
        .lte('order_date', formatDateForQuery(end));
      
      if (ordersError) throw ordersError;
      
      // Get all active salespeople
      const { data: salespeople, error: spError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('role', 'salesperson')
        .eq('is_active', true);
      
      if (spError) throw spError;
      
      // Build exclusion list from participants table
      const excludedIds = new Set(
        participants?.filter(p => !p.is_included).map(p => p.salesperson_id) || []
      );
      
      // Calculate metrics per salesperson
      const metricsMap = new Map<string, {
        completed_orders: number;
        net_sales: number;
        delivered_orders: number;
        failed_orders: number;
      }>();
      
      // Initialize with all salespeople
      salespeople?.forEach(sp => {
        if (!excludedIds.has(sp.id)) {
          metricsMap.set(sp.id, {
            completed_orders: 0,
            net_sales: 0,
            delivered_orders: 0,
            failed_orders: 0
          });
        }
      });
      
      // Aggregate order data
      orders?.forEach(order => {
        const spId = order.salesperson_id;
        if (!metricsMap.has(spId)) return;
        
        const metrics = metricsMap.get(spId)!;
        
        // Completed orders (reconciliation approved)
        if (order.reconciliation_status === 'SETTLED') {
          metrics.completed_orders++;
          metrics.net_sales += (order.total_amount || 0) - (order.discount_amount || 0);
        }
        
        // Delivered orders
        if (order.runner_status === 'DELIVERED') {
          metrics.delivered_orders++;
        }
        
        // Failed orders
        if (order.runner_status === 'FAILED_DELIVERY' || order.driver_status === 'FAILED') {
          metrics.failed_orders++;
        }
      });
      
      // Build rankings array
      const rankings: LeaderboardRanking[] = [];
      salespeople?.forEach(sp => {
        if (!metricsMap.has(sp.id)) return;
        
        const metrics = metricsMap.get(sp.id)!;
        const deliveredTotal = metrics.delivered_orders + metrics.failed_orders;
        
        rankings.push({
          salesperson_id: sp.id,
          salesperson_name: sp.display_name,
          completed_orders: metrics.completed_orders,
          net_sales: metrics.net_sales,
          delivered_orders: metrics.delivered_orders,
          failed_orders: metrics.failed_orders,
          conversion_score: metrics.delivered_orders > 0 
            ? Math.round((metrics.completed_orders / metrics.delivered_orders) * 100 * 100) / 100
            : 0,
          success_rate: deliveredTotal > 0
            ? Math.round((metrics.delivered_orders / deliveredTotal) * 100 * 100) / 100
            : 0,
          rank_position: 0
        });
      });
      
      // Sort by primary metric and assign ranks
      rankings.sort((a, b) => {
        // Primary metric
        const aVal = a[primaryMetric as keyof LeaderboardRanking] as number;
        const bVal = b[primaryMetric as keyof LeaderboardRanking] as number;
        if (bVal !== aVal) return bVal - aVal;
        
        // Tie-breakers
        if (primaryMetric !== 'net_sales' && b.net_sales !== a.net_sales) {
          return b.net_sales - a.net_sales;
        }
        if (primaryMetric !== 'completed_orders' && b.completed_orders !== a.completed_orders) {
          return b.completed_orders - a.completed_orders;
        }
        return a.failed_orders - b.failed_orders;
      });
      
      // Assign rank positions
      rankings.forEach((r, i) => {
        r.rank_position = i + 1;
      });
      
      return rankings;
    },
    refetchInterval: 30000,
  });
}

// Hook to get user's own ranking
export function useMyRanking(periodMode: PeriodMode = 'month') {
  const { profile } = useAuth();
  const { data: rankings } = useLeaderboardRankings(periodMode);
  
  if (!profile || !rankings) return null;
  
  return rankings.find(r => r.salesperson_id === profile.id) || null;
}

// Hook to get previous period ranking for comparison
export function usePreviousPeriodRanking(periodMode: PeriodMode = 'month') {
  const { profile } = useAuth();
  
  const now = new Date();
  let prevStart: Date;
  let prevEnd: Date;
  
  switch (periodMode) {
    case 'today':
      prevStart = startOfDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      prevEnd = endOfDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      break;
    case 'week':
      const prevWeekStart = startOfWeek(now, { weekStartsOn: 1 });
      prevStart = new Date(prevWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
      prevEnd = new Date(prevStart.getTime() + 6 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
    default:
      const prevMonth = subMonths(now, 1);
      prevStart = startOfMonth(prevMonth);
      prevEnd = endOfMonth(prevMonth);
      break;
  }
  
  const { data: rankings } = useLeaderboardRankings('custom', 'net_sales', prevStart, prevEnd);
  
  if (!profile || !rankings) return null;
  
  return rankings.find(r => r.salesperson_id === profile.id) || null;
}

// Hook to fetch leaderboard archive
export function useLeaderboardArchive(periodStart?: string, periodEnd?: string) {
  return useQuery({
    queryKey: ['leaderboard-archive', periodStart, periodEnd],
    queryFn: async () => {
      let query = supabase.from('leaderboard_archive').select('*');
      
      if (periodStart) {
        query = query.eq('period_start', periodStart);
      }
      if (periodEnd) {
        query = query.eq('period_end', periodEnd);
      }
      
      const { data, error } = await query.order('period_start', { ascending: false });
      
      if (error) throw error;
      return data as unknown as LeaderboardArchive[];
    }
  });
}

// Hook to create leaderboard archive
export function useCreateLeaderboardArchive() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (archive: { period_start: string; period_end: string; metric_config_snapshot: Record<string, unknown>; ranks: LeaderboardRanking[] }) => {
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

// Hook for filtered rankings based on visibility
export function useVisibleRankings(periodMode: PeriodMode = 'month') {
  const { profile } = useAuth();
  const { data: settings } = useLeaderboardSettings();
  const { data: allRankings } = useLeaderboardRankings(periodMode, settings?.primary_metric);
  
  if (!allRankings || !profile) return [];
  
  const visibilityMode = settings?.visibility_mode || 'all';
  const userRole = profile.role;
  
  // Admin sees all
  if (userRole === 'admin') {
    return allRankings;
  }
  
  // Manager sees bound salespeople only - would need bindings check
  // For now, managers see all
  if (userRole === 'manager') {
    return allRankings;
  }
  
  // Salesperson visibility based on settings
  if (userRole === 'salesperson') {
    switch (visibilityMode) {
      case 'all':
        return allRankings;
      case 'top_10_self':
        const top10 = allRankings.slice(0, 10);
        const selfRanking = allRankings.find(r => r.salesperson_id === profile.id);
        if (selfRanking && selfRanking.rank_position > 10) {
          return [...top10, selfRanking];
        }
        return top10;
      case 'self_only':
        return allRankings.filter(r => r.salesperson_id === profile.id);
      default:
        return allRankings;
    }
  }
  
  return [];
}
