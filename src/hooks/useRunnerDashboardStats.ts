import { useRunnerOperationalStats } from '@/hooks/useRunnerInboxStats';

export interface RunnerDashboardData {
  todayStats: {
    pendingAssignment: number;
    inProgress: number;
    deliveredToday: number;
    failedToday: number;
    totalTodayValue: number;
  };
  allTimeStats: {
    totalDelivered: number;
    totalFailed: number;
  };
  earningsStats: {
    deliveredTodayValue: number;
    pendingClaimCount: number;
    pendingClaimValue: number;
    submittedClaimCount: number;
    submittedClaimValue: number;
    approvedClaimValue: number;
  };
  blockerStats: {
    failedOrdersCount: number;
    missingDeliveryChargesCount: number;
    driverIssuesCount: number;
  };
}

export function useRunnerDashboardStats() {
  const query = useRunnerOperationalStats();
  const stats = query.data;

  const data: RunnerDashboardData | undefined = stats ? {
    todayStats: {
      pendingAssignment: stats.noDriverCount,
      inProgress: stats.totalActive,
      deliveredToday: stats.deliveredToday,
      failedToday: stats.failedToday,
      totalTodayValue: stats.activeValue + stats.deliveredTodayValue,
    },
    allTimeStats: {
      totalDelivered: stats.totalDelivered,
      totalFailed: stats.totalFailed,
    },
    earningsStats: {
      deliveredTodayValue: stats.deliveredTodayValue,
      pendingClaimCount: stats.pendingClaimCount,
      pendingClaimValue: stats.pendingClaimValue,
      submittedClaimCount: stats.submittedClaimCount,
      submittedClaimValue: stats.submittedClaimValue,
      approvedClaimValue: stats.approvedClaimValue,
    },
    blockerStats: {
      failedOrdersCount: stats.failedOrdersCount,
      missingDeliveryChargesCount: stats.missingDeliveryChargesCount,
      driverIssuesCount: stats.driverIssuesCount,
    },
  } : undefined;

  return { ...query, data };
}
