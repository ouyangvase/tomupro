import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';

const RunnerInbox = lazy(() => import('@/pages/runner/RunnerInbox'));
const AdminRunnerInbox = lazy(() => import('@/pages/admin/AdminRunnerInbox'));
const RunnerInbound = lazy(() => import('@/pages/runner/RunnerInbound'));
const DriverLocationsPage = lazy(() => import('@/pages/runner/DriverLocationsPage'));
const RunnerDriverInbox = lazy(() => import('@/pages/runner/RunnerDriverInbox'));
const DriverManagement = lazy(() => import('@/pages/runner/DriverManagement'));
const RunnerFailedOrders = lazy(() => import('@/pages/runner/RunnerFailedOrders'));
const RunnerDeliveredOrders = lazy(() => import('@/pages/runner/RunnerDeliveredOrders'));

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
      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="w-full justify-start bg-secondary/30 h-11">
            {tabs.map(t => (
              <TabsTrigger key={t.id} value={t.id} className="text-xs md:text-sm px-3 md:px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      <EmbeddedProvider>
        <Suspense fallback={<Loading />}>
          <div className="mt-4">
            {activeTab === 'inbox' && (role === 'admin' ? <AdminRunnerInbox /> : <RunnerInbox />)}
            {activeTab === 'inbound' && <RunnerInbound />}
            {activeTab === 'driver-inbox' && role === 'runner' && <RunnerDriverInbox />}
            {activeTab === 'drivers' && role === 'runner' && <DriverManagement />}
            {activeTab === 'failed' && role === 'runner' && <RunnerFailedOrders />}
            {activeTab === 'map' && <DriverLocationsPage />}
          </div>
        </Suspense>
      </EmbeddedProvider>
    </div>
  );
}
