import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const LeaderboardPage = lazy(() => import('@/pages/leaderboard/LeaderboardPage'));
const ManagerRankingBoard = lazy(() => import('@/pages/manager/ManagerRankingBoard'));
const ManagerImpactBoard = lazy(() => import('@/pages/manager/ManagerImpactBoard'));
const DriverRanking = lazy(() => import('@/pages/runner/DriverRanking'));
const DriverRankingPage = lazy(() => import('@/pages/driver/DriverRankingPage'));

const Loading = () => (
  <div className="flex items-center justify-center py-16">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

export default function PerformanceModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const role = profile?.role;
  const activeTab = searchParams.get('tab') || 'leaderboard';

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  // Role-specific tabs
  const getTabs = () => {
    if (role === 'driver') return [{ id: 'ranking', label: 'Ranking' }];
    if (role === 'runner') return [{ id: 'driver-ranking', label: 'Driver Ranking' }];
    if (role === 'salesperson') return [{ id: 'leaderboard', label: 'Leaderboard' }];
    // admin & manager
    const tabs = [{ id: 'leaderboard', label: 'Leaderboard' }];
    if (role === 'manager' || role === 'admin') {
      tabs.push({ id: 'ranking', label: 'Ranking Board' });
      tabs.push({ id: 'impact', label: 'Impact Board' });
    }
    return tabs;
  };

  const tabs = getTabs();

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        {tabs.length > 1 && (
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <TabsList className="w-full justify-start bg-secondary/30 h-11">
              {tabs.map(tab => (
                <TabsTrigger key={tab.id} value={tab.id} className="text-xs md:text-sm px-3 md:px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        )}

        <Suspense fallback={<Loading />}>
          <TabsContent value="leaderboard" className="mt-4"><LeaderboardPage embedded /></TabsContent>
          <TabsContent value="ranking" className="mt-4">
            {role === 'driver' ? <DriverRankingPage embedded /> : <ManagerRankingBoard embedded />}
          </TabsContent>
          <TabsContent value="impact" className="mt-4"><ManagerImpactBoard embedded /></TabsContent>
          <TabsContent value="driver-ranking" className="mt-4"><DriverRanking embedded /></TabsContent>
        </Suspense>
      </Tabs>
    </div>
  );
}
