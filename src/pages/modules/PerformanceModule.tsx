import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';
import { useLeaderboardSettings } from '@/hooks/useLeaderboard';

const LeaderboardPage = lazy(() => import('@/pages/leaderboard/LeaderboardPage'));
const ManagerRankingBoard = lazy(() => import('@/pages/manager/ManagerRankingBoard'));
const ManagerImpactBoard = lazy(() => import('@/pages/manager/ManagerImpactBoard'));
const DriverRanking = lazy(() => import('@/pages/runner/DriverRanking'));
const DriverRankingPage = lazy(() => import('@/pages/driver/DriverRankingPage'));
const RunnerAuditLog = lazy(() => import('@/pages/runner/RunnerAuditLog'));

const Loading = () => (
  <div className="flex items-center justify-center py-16">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

export default function PerformanceModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const role = profile?.role;
  const { data: leaderboardSettings } = useLeaderboardSettings();
  const hidePerformanceUI = !!(leaderboardSettings?.filters_default as any)?.hide_performance_ui;

  const getTabs = () => {
    if (role === 'driver') return [{ id: 'ranking', label: 'Ranking' }];
    if (role === 'runner') return [{ id: 'driver-ranking', label: 'Driver Ranking' }, { id: 'audit-log', label: 'Audit Trail' }];
    if (role === 'runner_assistant') return [{ id: 'audit-log', label: 'Audit Trail' }];

    // Admin always sees leaderboard (for configuration); non-admin respects hide setting
    const showLeaderboard = role === 'admin' || !hidePerformanceUI;

    if (role === 'salesperson') {
      return showLeaderboard ? [{ id: 'leaderboard', label: 'Leaderboard' }] : [];
    }
    const tabs = [];
    if (showLeaderboard) tabs.push({ id: 'leaderboard', label: 'Leaderboard' });
    tabs.push(
      { id: 'ranking', label: 'Ranking Board' },
      { id: 'impact', label: 'Impact Board' },
      { id: 'audit-log', label: 'Audit Trail' },
    );
    return tabs;
  };

  const tabs = getTabs();
  const defaultTab = tabs[0]?.id || 'leaderboard';
  const activeTab = searchParams.get('tab') || defaultTab;

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}>
        {tabs.length > 1 && (
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <TabsList className="h-11 w-max min-w-max justify-start bg-secondary/30">
              {tabs.map(t => (
                <TabsTrigger key={t.id} value={t.id} className="shrink-0 whitespace-nowrap px-3 text-xs md:px-4 md:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t.label}</TabsTrigger>
              ))}
            </TabsList>
          </div>
        )}
      </Tabs>
      <EmbeddedProvider>
        <Suspense fallback={<Loading />}>
          <div className="mt-4">
            {activeTab === 'leaderboard' && <LeaderboardPage />}
            {activeTab === 'ranking' && (role === 'driver' ? <DriverRankingPage /> : <ManagerRankingBoard />)}
            {activeTab === 'impact' && <ManagerImpactBoard />}
            {activeTab === 'driver-ranking' && <DriverRanking />}
            {activeTab === 'audit-log' && <RunnerAuditLog />}
          </div>
        </Suspense>
      </EmbeddedProvider>
    </div>
  );
}
