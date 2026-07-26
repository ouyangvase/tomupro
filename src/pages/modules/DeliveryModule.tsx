import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';

const DriverInbox = lazy(() => import('@/pages/driver/DriverInbox'));
const DriverRoutePage = lazy(() => import('@/pages/driver/DriverRoutePage'));
const DriverPickupsPage = lazy(() => import('@/pages/driver/DriverPickupsPage'));
const DriverReturnsPage = lazy(() => import('@/pages/driver/DriverReturnsPage'));
const DriverStockOnHandPage = lazy(() => import('@/pages/driver/DriverStockOnHandPage'));
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
  { id: 'stock', label: 'Stock on Hand' },
  { id: 'analytics', label: 'Analytics' },
];

export default function DeliveryModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'inbox';

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="h-11 w-max min-w-max justify-start bg-secondary/30">
            {tabs.map(t => (
              <TabsTrigger key={t.id} value={t.id} className="shrink-0 whitespace-nowrap px-3 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground md:px-4 md:text-sm">{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      <EmbeddedProvider>
        <Suspense fallback={<Loading />}>
          <div className="mt-4 min-w-0">
            {activeTab === 'inbox' && <DriverInbox />}
            {activeTab === 'route' && <DriverRoutePage />}
            {activeTab === 'pickups' && <DriverPickupsPage />}
            {activeTab === 'returns' && <DriverReturnsPage />}
            {activeTab === 'stock' && <DriverStockOnHandPage />}
            {activeTab === 'analytics' && <DriverAnalyticsPage />}
          </div>
        </Suspense>
      </EmbeddedProvider>
    </div>
  );
}
