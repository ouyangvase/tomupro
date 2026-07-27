import { cn } from '@/lib/utils';
import { driverTabPath, type DriverTabId } from '@/lib/driverTabs';
import { Link, Navigate, useLocation } from 'react-router-dom';
import type { ComponentType } from 'react';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';
import DriverInbox from '@/pages/driver/DriverInbox';
import DriverPickupsPage from '@/pages/driver/DriverPickupsPage';
import DriverReturnsPage from '@/pages/driver/DriverReturnsPage';
import DriverStockOnHandPage from '@/pages/driver/DriverStockOnHandPage';
import DriverAnalyticsPage from '@/pages/driver/DriverAnalyticsPage';

const tabs: Array<{ id: DriverTabId; label: string }> = [
  { id: 'inbox', label: 'My Deliveries' },
  { id: 'pickups', label: 'Pickups' },
  { id: 'returns', label: 'Returns' },
  { id: 'stock', label: 'Stock on Hand' },
  { id: 'analytics', label: 'Analytics' },
];

const tabPages: Record<DriverTabId, ComponentType> = {
  inbox: DriverInbox,
  pickups: DriverPickupsPage,
  returns: DriverReturnsPage,
  stock: DriverStockOnHandPage,
  analytics: DriverAnalyticsPage,
};

export default function DeliveryModule() {
  const location = useLocation();
  const routeTab = location.pathname.split('/')[2];
  const requestedTab = routeTab || new URLSearchParams(location.search).get('tab') || 'inbox';
  const validRequestedTab = tabs.some((tab) => tab.id === requestedTab)
    ? requestedTab as DriverTabId
    : 'inbox';
  const activeTab = validRequestedTab;
  const ActivePage = tabPages[activeTab];

  if (requestedTab !== validRequestedTab) {
    return <Navigate to="/delivery" replace />;
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
              to={driverTabPath(tab.id)}
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
        <div className="mt-4 min-w-0">
          <ActivePage key={activeTab} />
        </div>
      </EmbeddedProvider>
    </div>
  );
}
