import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';

const InventoryBalance = lazy(() => import('@/pages/InventoryBalance'));
const InboundPending = lazy(() => import('@/pages/inbound/InboundPending'));
const InboundHistory = lazy(() => import('@/pages/inbound/InboundHistory'));
const StockAdjustment = lazy(() => import('@/pages/inventory/StockAdjustment'));
const WarehouseManagement = lazy(() => import('@/pages/admin/WarehouseManagement'));
const StockIntegrityAudit = lazy(() => import('@/pages/admin/StockIntegrityAudit'));
const DataSharingAdmin = lazy(() => import('@/pages/admin/DataSharingAdmin'));

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
    { id: 'inbound-history', label: 'Inbound History', roles: ['admin', 'runner'] },
    { id: 'stock-audit', label: 'Stock Audit', roles: ['admin', 'runner'] },
    { id: 'adjustments', label: 'Adjustments', roles: ['admin'] },
    { id: 'warehouses', label: 'Warehouses', roles: ['admin'] },
    { id: 'data-sharing', label: 'Data Sharing', roles: ['admin'] },
  ];

  const tabs = useMemo(() => allTabs.filter(t => role && t.roles.includes(role)), [role]);
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
      </Tabs>
      <EmbeddedProvider>
        <Suspense fallback={<Loading />}>
          <div className="mt-4">
            {activeTab === 'balance' && <InventoryBalance />}
            {activeTab === 'inbound' && <InboundPending />}
            {activeTab === 'inbound-history' && <InboundHistory />}
            {activeTab === 'stock-audit' && <StockIntegrityAudit />}
            {activeTab === 'adjustments' && <StockAdjustment />}
            {activeTab === 'warehouses' && <WarehouseManagement />}
            {activeTab === 'data-sharing' && <DataSharingAdmin />}
          </div>
        </Suspense>
      </EmbeddedProvider>
    </div>
  );
}
