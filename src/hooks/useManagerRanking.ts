import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfMonth, subDays, format } from 'date-fns';

export type RankingPeriod = 'monthly' | 'quarterly' | 'yearly';
export type RankingMetric = 'leadership_score' | 'team_gmv' | 'team_delivered';

export interface ManagerRankingParticipant {
  id: string;
  manager_id: string;
  is_enabled: boolean;
  enabled_at: string | null;
  disabled_at: string | null;
  updated_by: string | null;
  updated_at: string;
  manager?: {
    id: string;
    display_name: string;
    email: string;
    is_active: boolean;
  };
}

export interface ManagerRankingData {
  manager_id: string;
  manager_name: string;
  manager_avatar_url: string | null;
  rank: number;
  leadership_score: number;
  team_realized_gmv: number;
  team_pipeline_gmv: number;
  team_delivered_orders: number;
  team_booking_orders: number;
  team_ready_orders: number;
  growth_pct: number;
  bottom30_improve_pct: number;
  dependency_ratio: number;
  score_breakdown: {
    team_growth_score: number;
    improvement_score: number;
    ops_score: number;
    personal_score: number;
  } | null;
}

// Hook to fetch enabled participants (for ranking board)
export function useManagerRankingParticipants() {
  return useQuery({
    queryKey: ['manager-ranking-participants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_ranking_participants')
        .select(`
          *,
          manager:profiles!manager_ranking_participants_manager_id_fkey (
            id,
            display_name,
            email,
            is_active
          )
        `)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as ManagerRankingParticipant[];
    },
  });
}

// Hook to fetch all managers for admin panel (includes disabled)
export function useAllManagersForRanking() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['all-managers-for-ranking'],
    queryFn: async () => {
      // Fetch all managers
      const { data: managers, error: managersError } = await supabase
        .from('profiles')
        .select('id, display_name, email, is_active')
        .eq('role', 'manager')
        .order('display_name');

      if (managersError) throw managersError;

      // Fetch participant records
      const { data: participants, error: participantsError } = await supabase
        .from('manager_ranking_participants')
        .select('*');

      if (participantsError) throw participantsError;

      // Merge data
      const participantMap = new Map(participants?.map(p => [p.manager_id, p]) || []);
      
      return managers?.map(m => ({
        ...m,
        participant: participantMap.get(m.id) || null,
        is_enabled: participantMap.get(m.id)?.is_enabled ?? false,
      })) || [];
    },
    enabled: profile?.role === 'admin',
  });
}

// Hook to toggle participant status (admin only)
export function useToggleManagerRankingParticipant() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ managerId, isEnabled }: { managerId: string; isEnabled: boolean }) => {
      // Check if participant record exists
      const { data: existing } = await supabase
        .from('manager_ranking_participants')
        .select('id')
        .eq('manager_id', managerId)
        .single();

      if (existing) {
        // Update existing record
        const { error } = await supabase
          .from('manager_ranking_participants')
          .update({
            is_enabled: isEnabled,
            enabled_at: isEnabled ? new Date().toISOString() : null,
            disabled_at: isEnabled ? null : new Date().toISOString(),
            updated_by: profile?.id,
            updated_at: new Date().toISOString(),
          })
          .eq('manager_id', managerId);

        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from('manager_ranking_participants')
          .insert({
            manager_id: managerId,
            is_enabled: isEnabled,
            enabled_at: isEnabled ? new Date().toISOString() : null,
            disabled_at: isEnabled ? null : new Date().toISOString(),
            updated_by: profile?.id,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-ranking-participants'] });
      queryClient.invalidateQueries({ queryKey: ['all-managers-for-ranking'] });
      queryClient.invalidateQueries({ queryKey: ['manager-ranking-data'] });
    },
  });
}

// Hook to bulk update participants (admin only)
export function useBulkUpdateManagerRankingParticipants() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ managerIds, isEnabled }: { managerIds: string[]; isEnabled: boolean }) => {
      for (const managerId of managerIds) {
        const { data: existing } = await supabase
          .from('manager_ranking_participants')
          .select('id')
          .eq('manager_id', managerId)
          .single();

        if (existing) {
          await supabase
            .from('manager_ranking_participants')
            .update({
              is_enabled: isEnabled,
              enabled_at: isEnabled ? new Date().toISOString() : null,
              disabled_at: isEnabled ? null : new Date().toISOString(),
              updated_by: profile?.id,
              updated_at: new Date().toISOString(),
            })
            .eq('manager_id', managerId);
        } else {
          await supabase
            .from('manager_ranking_participants')
            .insert({
              manager_id: managerId,
              is_enabled: isEnabled,
              enabled_at: isEnabled ? new Date().toISOString() : null,
              disabled_at: isEnabled ? null : new Date().toISOString(),
              updated_by: profile?.id,
            });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-ranking-participants'] });
      queryClient.invalidateQueries({ queryKey: ['all-managers-for-ranking'] });
      queryClient.invalidateQueries({ queryKey: ['manager-ranking-data'] });
    },
  });
}

// Hook to fetch ranking data with KPIs
export function useManagerRankingData(period: RankingPeriod = 'monthly', metric: RankingMetric = 'leadership_score') {
  return useQuery({
    queryKey: ['manager-ranking-data', period, metric],
    queryFn: async () => {
      // Get enabled participants
      const { data: participants, error: participantsError } = await supabase
        .from('manager_ranking_participants')
        .select('manager_id')
        .eq('is_enabled', true);

      if (participantsError) throw participantsError;
      if (!participants?.length) return [];

      const managerIds = participants.map(p => p.manager_id);

      // Fetch manager profiles separately to avoid RLS issues
      const { data: managerProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', managerIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map(managerProfiles?.map(p => [p.id, p]) || []);

      // Calculate date range
      const now = new Date();
      let startDate: Date;
      let prevStartDate: Date;
      let prevEndDate: Date;

      if (period === 'quarterly') {
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterStart, 1);
        prevStartDate = new Date(now.getFullYear(), quarterStart - 3, 1);
        prevEndDate = new Date(now.getFullYear(), quarterStart, 0);
      } else if (period === 'yearly') {
        startDate = new Date(now.getFullYear(), 0, 1);
        prevStartDate = new Date(now.getFullYear() - 1, 0, 1);
        prevEndDate = new Date(now.getFullYear() - 1, 11, 31);
      } else {
        // monthly (default)
        startDate = startOfMonth(now);
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        prevStartDate = prevMonth;
        prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
      }

      // Fetch KPI data from manager_kpi_daily
      const { data: kpiData, error: kpiError } = await supabase
        .from('manager_kpi_daily')
        .select('*')
        .in('manager_id', managerIds)
        .gte('kpi_date', format(startDate, 'yyyy-MM-dd'))
        .lte('kpi_date', format(now, 'yyyy-MM-dd'));

      if (kpiError) throw kpiError;

      // Aggregate KPI data per manager
      const managerKpis = new Map<string, {
        leadership_score: number;
        team_realized_gmv: number;
        team_pipeline_gmv: number;
        team_delivered: number;
        team_booking: number;
        team_ready: number;
        bottom30_improve_pct: number;
        dependency_ratio: number;
        score_breakdown: any;
        count: number;
      }>();

      for (const kpi of kpiData || []) {
        const existing = managerKpis.get(kpi.manager_id) || {
          leadership_score: 0,
          team_realized_gmv: 0,
          team_pipeline_gmv: 0,
          team_delivered: 0,
          team_booking: 0,
          team_ready: 0,
          bottom30_improve_pct: 0,
          dependency_ratio: 0,
          score_breakdown: null,
          count: 0,
        };

        existing.leadership_score = Math.max(existing.leadership_score, kpi.leadership_score || 0);
        existing.team_realized_gmv += kpi.team_realized_gmv_bnd || 0;
        existing.team_pipeline_gmv += kpi.team_pipeline_gmv_bnd || 0;
        existing.team_delivered += kpi.team_delivered_orders || 0;
        existing.team_booking += kpi.team_booking_orders || 0;
        existing.team_ready += kpi.team_ready_orders || 0;
        existing.bottom30_improve_pct = kpi.bottom30_improve_pct || 0;
        existing.dependency_ratio = kpi.dependency_ratio || 0;
        existing.score_breakdown = kpi.score_breakdown_json;
        existing.count++;

        managerKpis.set(kpi.manager_id, existing);
      }

      // Fetch previous period data for growth calculation
      const { data: prevKpiData } = await supabase
        .from('manager_kpi_daily')
        .select('manager_id, team_realized_gmv_bnd')
        .in('manager_id', managerIds)
        .gte('kpi_date', format(prevStartDate, 'yyyy-MM-dd'))
        .lte('kpi_date', format(prevEndDate, 'yyyy-MM-dd'));

      const prevGmvMap = new Map<string, number>();
      for (const kpi of prevKpiData || []) {
        const existing = prevGmvMap.get(kpi.manager_id) || 0;
        prevGmvMap.set(kpi.manager_id, existing + (kpi.team_realized_gmv_bnd || 0));
      }

      // Build ranking data
      const rankingData: ManagerRankingData[] = participants.map(p => {
        const profile = profileMap.get(p.manager_id);
        const kpi = managerKpis.get(p.manager_id);
        const prevGmv = prevGmvMap.get(p.manager_id) || 0;
        const currentGmv = kpi?.team_realized_gmv || 0;
        const growth = prevGmv > 0 ? ((currentGmv - prevGmv) / prevGmv) * 100 : 0;

        return {
          manager_id: p.manager_id,
          manager_name: profile?.display_name || 'Unknown',
          manager_avatar_url: profile?.avatar_url || null,
          rank: 0,
          leadership_score: kpi?.leadership_score || 0,
          team_realized_gmv: kpi?.team_realized_gmv || 0,
          team_pipeline_gmv: kpi?.team_pipeline_gmv || 0,
          team_delivered_orders: kpi?.team_delivered || 0,
          team_booking_orders: kpi?.team_booking || 0,
          team_ready_orders: kpi?.team_ready || 0,
          growth_pct: growth,
          bottom30_improve_pct: kpi?.bottom30_improve_pct || 0,
          dependency_ratio: kpi?.dependency_ratio || 0,
          score_breakdown: kpi?.score_breakdown || null,
        };
      });

      // Sort by selected metric
      rankingData.sort((a, b) => {
        switch (metric) {
          case 'team_gmv':
            return b.team_realized_gmv - a.team_realized_gmv;
          case 'team_delivered':
            return b.team_delivered_orders - a.team_delivered_orders;
          case 'leadership_score':
          default:
            return b.leadership_score - a.leadership_score;
        }
      });

      // Assign ranks
      rankingData.forEach((item, index) => {
        item.rank = index + 1;
      });

      return rankingData;
    },
  });
}
