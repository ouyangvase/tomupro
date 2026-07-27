import { cn } from '@/lib/utils';
import {
  DRIVER_TAB_CHANGE_EVENT,
  driverTabPath,
  type DriverTabId,
} from '@/lib/driverTabs';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { lazy, Suspense, useEffect, useState } from 'react';
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

const tabs: Array<{ id: DriverTabId; label: string }> = [
  { id: 'inbox', label: 'My Deliveries' },
  { id: 'pickups', label: 'Pickups' },
  { id: 'returns', label: 'Returns' },
  { id: 'stock', label: 'Stock on Hand' },
  { id: 'analytics', label: 'Analytics' },
];

export default function DeliveryModule() {
  const navigate = useNavigate();
  const { tab: routeTab } = useParams<{ tab?: string }>();
  const [searchParams] = useSearchParams();
  const requestedTab = routeTab || searchParams.get('tab') || 'inbox';
  const validRequestedTab = tabs.some((tab) => tab.id === requestedTab)
    ? requestedTab as DriverTabId
    : 'inbox';
  const [activeTab, setActiveTab] = useState<DriverTabId>(validRequestedTab);

  useEffect(() => {
    setActiveTab(validRequestedTab);
  }, [validRequestedTab]);

  useEffect(() => {
    const handleTabChange = (event: Event) => {
      const tab = (event as CustomEvent<DriverTabId>).detail;
      if (tabs.some((item) => item.id === tab)) {
        setActiveTab(tab);
      }
    };

    window.addEventListener(DRIVER_TAB_CHANGE_EVENT, handleTabChange);
    return () => window.removeEventListener(DRIVER_TAB_CHANGE_EVENT, handleTabChange);
  }, []);

  if (requestedTab !== validRequestedTab) {
    return <Navigate to="/delivery" replace />;
  }

  const selectTab = (tab: DriverTabId) => {
    setActiveTab(tab);
    navigate(driverTabPath(tab));
  };

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <nav
          aria-label="Driver delivery sections"
          className="inline-flex h-11 w-max min-w-max items-center justify-start gap-1 rounded-xl bg-secondary/30 p-1.5"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors md:px-4 md:text-sm",
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground/70 hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
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
