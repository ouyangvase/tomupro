import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const RunnerInbox = lazy(() => import('@/pages/runner/RunnerInbox'));
const AdminRunnerInbox = lazy(() => import('@/pages/admin/AdminRunnerInbox'));
const RunnerInbound = lazy(() => import('@/pages/runner/RunnerInbound'));
const DriverLocationsPage = lazy(() => import('@/pages/runner/DriverLocationsPage'));

// Runner-specific extras
const RunnerDriverInbox = lazy(() => import('@/pages/runner/RunnerDriverInbox'));
const DriverManagement = lazy(() => import('@/pages/runner/DriverManagement'));
const RunnerFailedOrders = lazy(() => import('@/pages/runner/RunnerFailedOrders'));

const Loading = () => (
  <div className="flex items-center justify-center py-16">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

export default function DispatchModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const role = profile?.role;
  const activeTab = searchParams.get('tab') || 'inbox';

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  const runnerTabs = [
    { id: 'inbox', label: 'Runner Inbox' },
    { id: 'inbound', label: 'Inbound' },
    { id: 'driver-inbox', label: 'Driver Inbox' },
    { id: 'drivers', label: 'Drivers' },
    { id: 'failed', label: 'Failed Orders' },
    { id: 'map', label: 'Live Map' },
  ];

  const adminTabs = [
    { id: 'inbox', label: 'Runner Inbox' },
    { id: 'inbound', label: 'Inbound' },
    { id: 'map', label: 'Live Map' },
  ];

  const tabs = role === 'runner' ? runnerTabs : adminTabs;

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="w-full justify-start bg-secondary/30 h-11">
            {tabs.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="text-xs md:text-sm px-3 md:px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <Suspense fallback={<Loading />}>
          <TabsContent value="inbox" className="mt-4">
            {role === 'admin' ? <AdminRunnerInbox embedded /> : <RunnerInbox embedded />}
          </TabsContent>
          <TabsContent value="inbound" className="mt-4"><RunnerInbound embedded /></TabsContent>
          {role === 'runner' && (
            <>
              <TabsContent value="driver-inbox" className="mt-4"><RunnerDriverInbox embedded /></TabsContent>
              <TabsContent value="drivers" className="mt-4"><DriverManagement embedded /></TabsContent>
              <TabsContent value="failed" className="mt-4"><RunnerFailedOrders embedded /></TabsContent>
            </>
          )}
          <TabsContent value="map" className="mt-4"><DriverLocationsPage embedded /></TabsContent>
        </Suspense>
      </Tabs>
    </div>
  );
}
