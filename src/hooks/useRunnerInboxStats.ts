import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { callSupabaseRpc } from '@/lib/supabaseRpc';

export interface RunnerOperationalStats {
  totalActive: number;
  assignedCount: number;
  takenCount: number;
  noDriverCount: number;
  deliveredToday: number;
  failedToday: number;
  totalDelivered: number;
  totalFailed: number;
  activeValue: number;
  deliveredTodayValue: number;
  pendingClaimCount: number;
  pendingClaimValue: number;
  submittedClaimCount: number;
  submittedClaimValue: number;
  approvedClaimValue: number;
  failedOrdersCount: number;
  missingDeliveryChargesCount: number;
  driverIssuesCount: number;
}

export interface RunnerInboxStats {
  totalActive: number;
  assignedCount: number;
  takenCount: number;
  noDriverCount: number;
}

const runnerStatKeys: Array<keyof RunnerOperationalStats> = [
  'totalActive',
  'assignedCount',
  'takenCount',
  'noDriverCount',
  'deliveredToday',
  'failedToday',
  'totalDelivered',
  'totalFailed',
  'activeValue',
  'deliveredTodayValue',
  'pendingClaimCount',
  'pendingClaimValue',
  'submittedClaimCount',
  'submittedClaimValue',
  'approvedClaimValue',
  'failedOrdersCount',
  'missingDeliveryChargesCount',
  'driverIssuesCount',
];

export async function fetchRunnerOperationalStats(runnerId: string): Promise<RunnerOperationalStats> {
  const result = await callSupabaseRpc<Record<string, unknown>>('get_dashboard_stats_runner', {
    p_user_id: runnerId,
  });

  return runnerStatKeys.reduce((stats, key) => {
    stats[key] = Number(result?.[key] || 0);
    return stats;
  }, {} as RunnerOperationalStats);
}

export function runnerOperationalStatsQueryKey(runnerId?: string | string[]) {
  return ['runner-operational-stats', runnerId] as const;
}

function sumRunnerStats(stats: RunnerOperationalStats[]) {
  return runnerStatKeys.reduce((total, key) => {
    total[key] = stats.reduce((sum, item) => sum + Number(item[key] || 0), 0);
    return total;
  }, {} as RunnerOperationalStats);
}

export function useRunnerOperationalStats(runnerId?: string | string[]) {
  const { user } = useAuth();
  const effectiveRunnerIds = Array.isArray(runnerId)
    ? runnerId
    : [runnerId || user?.id].filter((id): id is string => Boolean(id));

  return useQuery({
    queryKey: runnerOperationalStatsQueryKey(effectiveRunnerIds),
    queryFn: async () => sumRunnerStats(await Promise.all(effectiveRunnerIds.map(fetchRunnerOperationalStats))),
    enabled: effectiveRunnerIds.length > 0,
    staleTime: 60000,
    refetchInterval: 120000,
  });
}

export function useRunnerInboxStats(runnerId?: string | string[]) {
  const { user } = useAuth();
  const effectiveRunnerIds = Array.isArray(runnerId)
    ? runnerId
    : [runnerId || user?.id].filter((id): id is string => Boolean(id));

  return useQuery({
    queryKey: runnerOperationalStatsQueryKey(effectiveRunnerIds),
    queryFn: async () => sumRunnerStats(await Promise.all(effectiveRunnerIds.map(fetchRunnerOperationalStats))),
    enabled: effectiveRunnerIds.length > 0,
    staleTime: 60000,
    refetchInterval: 120000,
    select: (stats): RunnerInboxStats => ({
      totalActive: stats.totalActive,
      assignedCount: stats.assignedCount,
      takenCount: stats.takenCount,
      noDriverCount: stats.noDriverCount,
    }),
  });
}
