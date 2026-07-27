import { cn } from '@/lib/utils';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';

const DriverInbox = lazy(() => import('@/pages/driver/DriverInbox'));
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
  { id: 'pickups', label: 'Pickups' },
  { id: 'returns', label: 'Returns' },
  { id: 'stock', label: 'Stock on Hand' },
  { id: 'analytics', label: 'Analytics' },
];

export default function DeliveryModule() {
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') || 'inbox';
  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab : 'inbox';

  if (requestedTab !== activeTab) {
    return <Navigate to="/delivery?tab=inbox" replace />;
  }

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <nav
          aria-label="Driver delivery sections"
          className="inline-flex h-11 w-max min-w-max items-center justify-start gap-1 rounded-xl bg-secondary/30 p-1.5"
        >
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              to={`/delivery?tab=${tab.id}`}
              reloadDocument
              aria-current={activeTab === tab.id ? 'page' : undefined}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors md:px-4 md:text-sm",
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground/70 hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      <EmbeddedProvider>
        <Suspense fallback={<Loading />}>
          <div className="mt-4 min-w-0">
            {activeTab === 'inbox' && <DriverInbox />}
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
