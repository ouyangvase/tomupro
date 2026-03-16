import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';

const DriverInbox = lazy(() => import('@/pages/driver/DriverInbox'));
const DriverRoutePage = lazy(() => import('@/pages/driver/DriverRoutePage'));
const DriverPickupsPage = lazy(() => import('@/pages/driver/DriverPickupsPage'));
const DriverReturnsPage = lazy(() => import('@/pages/driver/DriverReturnsPage'));
const DriverAnalyticsPage = lazy(() => import('@/pages/driver/DriverAnalyticsPage'));

const Loading = () => (
  <div className="flex items-center justify-center py-16">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const tabs = [
  { id: 'inbox', label: 'My Deliveries' },
  { id: 'route', label: 'Route' },
  { id: 'pickups', label: 'Pickups' },
  { id: 'returns', label: 'Returns' },
  { id: 'analytics', label: 'Analytics' },
];

export default function DeliveryModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'inbox';

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
        <EmbeddedProvider>
          <Suspense fallback={<Loading />}>
            <TabsContent value="inbox" className="mt-4"><DriverInbox /></TabsContent>
            <TabsContent value="route" className="mt-4"><DriverRoutePage /></TabsContent>
            <TabsContent value="pickups" className="mt-4"><DriverPickupsPage /></TabsContent>
            <TabsContent value="returns" className="mt-4"><DriverReturnsPage /></TabsContent>
            <TabsContent value="analytics" className="mt-4"><DriverAnalyticsPage /></TabsContent>
          </Suspense>
        </EmbeddedProvider>
      </Tabs>
    </div>
  );
}
