import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';

const InventoryBalance = lazy(() => import('@/pages/InventoryBalance'));
const InboundPending = lazy(() => import('@/pages/inbound/InboundPending'));
const InboundHistory = lazy(() => import('@/pages/inbound/InboundHistory'));
const StockAdjustment = lazy(() => import('@/pages/inventory/StockAdjustment'));
const WarehouseManagement = lazy(() => import('@/pages/admin/WarehouseManagement'));
const ProductsPage = lazy(() => import('@/pages/products/ProductsPage'));

const Loading = () => (
  <div className="flex items-center justify-center py-16">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

export default function InventoryModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const role = profile?.role;

  const allTabs = [
    { id: 'balance', label: 'Stock Balance', roles: ['admin', 'manager', 'salesperson', 'runner'] },
    { id: 'inbound', label: 'Inbound Pending', roles: ['admin', 'salesperson', 'manager'] },
    { id: 'inbound-history', label: 'Inbound History', roles: ['admin'] },
    { id: 'adjustments', label: 'Adjustments', roles: ['admin'] },
    { id: 'warehouses', label: 'Warehouses', roles: ['admin'] },
    { id: 'products', label: 'Products', roles: ['admin', 'manager', 'salesperson'] },
  ];

  const tabs = allTabs.filter(t => role && t.roles.includes(role));
  const activeTab = searchParams.get('tab') || 'balance';

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
            <TabsContent value="balance" className="mt-4"><InventoryBalance /></TabsContent>
            <TabsContent value="inbound" className="mt-4"><InboundPending /></TabsContent>
            <TabsContent value="inbound-history" className="mt-4"><InboundHistory /></TabsContent>
            <TabsContent value="adjustments" className="mt-4"><StockAdjustment /></TabsContent>
            <TabsContent value="warehouses" className="mt-4"><WarehouseManagement /></TabsContent>
            <TabsContent value="products" className="mt-4"><ProductsPage /></TabsContent>
          </Suspense>
        </EmbeddedProvider>
      </Tabs>
    </div>
  );
}
