import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';
import BookingSales from '@/pages/sales/BookingSales';
import ReadySales from '@/pages/sales/ReadySales';
import SalespersonActionInbox from '@/pages/sales/SalespersonActionInbox';
import RunnerDeliveredOrders from '@/pages/runner/RunnerDeliveredOrders';
import CancelledSales from '@/pages/sales/CancelledSales';
import { lifecycleTrace } from '@/lib/lifecycleTrace';

const tabs = [
  { id: 'booking', label: 'Booking' },
  { id: 'ready', label: 'Ready' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'action-required', label: 'Action Required' },
];

export default function OrdersModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'booking';
  const highlightOrderId = searchParams.get('highlight') || null;

  useEffect(() => {
    lifecycleTrace('route_opened', { route: '/orders', tab: activeTab });
    lifecycleTrace('orders_page_mounted', { tab: activeTab });
  }, [activeTab]);

  // Clear highlight param after 4 seconds so it doesn't persist on refresh
  useEffect(() => {
    if (highlightOrderId) {
      const timer = setTimeout(() => {
        const params = new URLSearchParams(searchParams);
        params.delete('highlight');
        setSearchParams(params, { replace: true });
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [highlightOrderId]);

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
        <div className="mt-4">
          {activeTab === 'booking' && <BookingSales highlightOrderId={highlightOrderId} />}
          {activeTab === 'ready' && <ReadySales highlightOrderId={highlightOrderId} />}
          {activeTab === 'delivered' && <RunnerDeliveredOrders highlightOrderId={highlightOrderId} />}
          {activeTab === 'cancelled' && <CancelledSales highlightOrderId={highlightOrderId} />}
          {activeTab === 'action-required' && <SalespersonActionInbox highlightOrderId={highlightOrderId} />}
        </div>
      </EmbeddedProvider>
    </div>
  );
}
