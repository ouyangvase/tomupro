import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { getVisibleOwnerIdsCached } from '@/lib/visibleOwnerIdsCache';
import { startOfMonth, subDays, format } from 'date-fns';

export type PeriodType = 'last7' | 'mtd';

interface TeamOverviewStats {
  realizedGmv: number;
  pipelineGmv: number;
  deliveredOrders: number;
  bookingOrders: number;
  readyOrders: number;
  actionRequiredCount: number;
}

interface TeamHealthStats {
  activeTeamMembers: number;
  teamMembersWithOrders: number;
  dependencyRatio: number;
  topBottomGapRatio: number;
  bottom30ImprovePct: number;
}

interface ManagerImpactStats {
  inboundAckCount: number;
  ordersRescuedCount: number;
  disputeResolvedCount: number;
  runnerReassignedCount: number;
}

interface PersonalPerformanceStats {
  personalRealizedGmv: number;
  personalPipelineGmv: number;
  personalDelivered: number;
  personalBooking: number;
  personalReady: number;
}

export interface ManagerDashboardData {
  teamOverview: TeamOverviewStats;
  teamHealth: TeamHealthStats;
  managerImpact: ManagerImpactStats;
  personalPerformance: PersonalPerformanceStats;
  leadershipScore: number;
  scoreBreakdown: {
    teamGrowth: number;
    bottom30Improvement: number;
    opsInterventions: number;
    personalContribution: number;
  };
}

export function useManagerDashboard(period: PeriodType = 'mtd') {
  const { user, role } = useAuth();
  const { data: teamMembers = [] } = useTeamMembers();

  return useQuery({
    queryKey: ['manager-dashboard', user?.id, period],
    queryFn: async (): Promise<ManagerDashboardData> => {
      if (!user?.id) throw new Error('Not authenticated');

      const now = new Date();
      const periodStart = period === 'last7'
        ? subDays(now, 7)
        : startOfMonth(now);
      const periodStartStr = format(periodStart, 'yyyy-MM-dd');

      // Use shared cache for team visibility (avoids redundant RPC calls)
      const visibleIds = await getVisibleOwnerIdsCached(user.id);

      const teamIds = visibleIds && visibleIds.length > 0
        ? visibleIds
        : [user.id];

      // Fetch team orders using explicit salesperson_id filter
      const { data: teamOrders, error: ordersError } = await supabase
        .from('orders')
        .select('id, status, runner_status, total_amount, salesperson_id, created_at')
        .in('salesperson_id', teamIds)
        .gte('created_at', periodStartStr);
      
      if (ordersError) throw ordersError;
      
      // Calculate team overview stats
      const deliveredOrders = teamOrders?.filter(o => o.runner_status === 'DELIVERED') || [];
      const bookingOrders = teamOrders?.filter(o => o.status === 'BOOKING') || [];
      const readyOrders = teamOrders?.filter(o =>
        o.status === 'READY' && !['DELIVERED', 'FAILED_DELIVERY'].includes(o.runner_status)
      ) || [];
      const actionRequiredOrders = teamOrders?.filter(o => o.runner_status === 'FAILED_DELIVERY') || [];
      
      const realizedGmv = deliveredOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const pipelineGmv = [...bookingOrders, ...readyOrders].reduce((sum, o) => sum + (o.total_amount || 0), 0);
      
      // Personal orders (manager as seller)
      const personalOrders = teamOrders?.filter(o => o.salesperson_id === user.id) || [];
      const personalDelivered = personalOrders.filter(o => o.runner_status === 'DELIVERED');
      const personalBooking = personalOrders.filter(o => o.status === 'BOOKING');
      const personalReady = personalOrders.filter(o =>
        o.status === 'READY' && !['DELIVERED', 'FAILED_DELIVERY'].includes(o.runner_status)
      );
      
      // Team health calculations
      const salespersonDeliveries = new Map<string, number>();
      deliveredOrders.forEach(o => {
        if (o.salesperson_id) {
          salespersonDeliveries.set(o.salesperson_id, (salespersonDeliveries.get(o.salesperson_id) || 0) + 1);
        }
      });
      
      const deliveryCounts = Array.from(salespersonDeliveries.values()).sort((a, b) => b - a);
      const topDelivery = deliveryCounts[0] || 0;
      const bottomDelivery = deliveryCounts[deliveryCounts.length - 1] || 0;
      const totalTeamDeliveries = deliveryCounts.reduce((sum, c) => sum + c, 0);
      
      const dependencyRatio = totalTeamDeliveries > 0 ? topDelivery / totalTeamDeliveries : 0;
      const topBottomGapRatio = bottomDelivery > 0 ? topDelivery / bottomDelivery : topDelivery;
      
      // Fetch inbound acknowledgments
      const { data: inbounds, error: inboundError } = await supabase
        .from('inbound_shipments')
        .select('id, status, salesperson_id')
        .in('salesperson_id', teamIds)
        .eq('status', 'ACKNOWLEDGED')
        .gte('created_at', periodStartStr);
      
      if (inboundError) throw inboundError;
      
      // Calculate leadership score
      const inboundAckCount = inbounds?.length || 0;
      const ordersRescuedCount = 0; // Would need audit log analysis
      const disputeResolvedCount = 0; // Would need dispute tracking
      const runnerReassignedCount = 0; // Would need audit log analysis
      
      const interventionsCount = inboundAckCount + ordersRescuedCount + disputeResolvedCount + runnerReassignedCount;
      const opsScore = Math.min(20, interventionsCount * 2);
      const personalScore = Math.min(10, personalDelivered.length);
      
      // Team growth would need previous period comparison
      const teamGrowthScore = 20; // Placeholder - needs previous period data
      const bottom30ImprovementScore = 15; // Placeholder - needs previous period data
      
      const leadershipScore = teamGrowthScore + bottom30ImprovementScore + opsScore + personalScore;
      
      return {
        teamOverview: {
          realizedGmv,
          pipelineGmv,
          deliveredOrders: deliveredOrders.length,
          bookingOrders: bookingOrders.length,
          readyOrders: readyOrders.length,
          actionRequiredCount: actionRequiredOrders.length,
        },
        teamHealth: {
          activeTeamMembers: teamIds.length - 1, // Exclude manager from count
          teamMembersWithOrders: salespersonDeliveries.size,
          dependencyRatio,
          topBottomGapRatio,
          bottom30ImprovePct: 0, // Needs historical comparison
        },
        managerImpact: {
          inboundAckCount,
          ordersRescuedCount,
          disputeResolvedCount,
          runnerReassignedCount,
        },
        personalPerformance: {
          personalRealizedGmv: personalDelivered.reduce((sum, o) => sum + (o.total_amount || 0), 0),
          personalPipelineGmv: [...personalBooking, ...personalReady].reduce((sum, o) => sum + (o.total_amount || 0), 0),
          personalDelivered: personalDelivered.length,
          personalBooking: personalBooking.length,
          personalReady: personalReady.length,
        },
        leadershipScore,
        scoreBreakdown: {
          teamGrowth: teamGrowthScore,
          bottom30Improvement: bottom30ImprovementScore,
          opsInterventions: opsScore,
          personalContribution: personalScore,
        },
      };
    },
    enabled: !!user?.id && (role === 'manager' || role === 'admin'),
    refetchInterval: 120000,
  });
}

export function useManagerKpiDaily(managerId?: string) {
  const { user, role } = useAuth();
  const targetManagerId = managerId || user?.id;
  
  return useQuery({
    queryKey: ['manager-kpi-daily', targetManagerId],
    queryFn: async () => {
      if (!targetManagerId) throw new Error('No manager ID');
      
      const { data, error } = await supabase
        .from('manager_kpi_daily')
        .select('*')
        .eq('manager_id', targetManagerId)
        .order('kpi_date', { ascending: false })
        .limit(30);
      
      if (error) throw error;
      return data;
    },
    enabled: !!targetManagerId && (role === 'manager' || role === 'admin'),
  });
}

export function useAllManagersKpi() {
  const { role } = useAuth();
  
  return useQuery({
    queryKey: ['all-managers-kpi'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_kpi_daily')
        .select(`
          *,
          manager:profiles!manager_kpi_daily_manager_id_fkey(id, display_name, email)
        `)
        .order('kpi_date', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data;
    },
    enabled: role === 'admin',
  });
}
