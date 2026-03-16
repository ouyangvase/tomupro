import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';

const BookingSales = lazy(() => import('@/pages/sales/BookingSales'));
const ReadySales = lazy(() => import('@/pages/sales/ReadySales'));
const RunnerDeliveredOrders = lazy(() => import('@/pages/runner/RunnerDeliveredOrders'));
const CancelledSales = lazy(() => import('@/pages/sales/CancelledSales'));
const SalespersonActionInbox = lazy(() => import('@/pages/sales/SalespersonActionInbox'));

const Loading = () => (
  <div className="flex items-center justify-center py-16">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

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
            <TabsContent value="booking" className="mt-4"><BookingSales /></TabsContent>
            <TabsContent value="ready" className="mt-4"><ReadySales /></TabsContent>
            <TabsContent value="delivered" className="mt-4"><RunnerDeliveredOrders /></TabsContent>
            <TabsContent value="cancelled" className="mt-4"><CancelledSales /></TabsContent>
            <TabsContent value="action-required" className="mt-4"><SalespersonActionInbox /></TabsContent>
          </Suspense>
        </EmbeddedProvider>
      </Tabs>
    </div>
  );
}
