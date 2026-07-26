import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';
import { useMyAssistantBinding } from '@/hooks/useRunnerAssistants';

const InventoryBalance = lazy(() => import('@/pages/InventoryBalance'));
const InboundPending = lazy(() => import('@/pages/inbound/InboundPending'));
const RunnerInbound = lazy(() => import('@/pages/runner/RunnerInbound'));
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
  const { data: assistantBinding } = useMyAssistantBinding();
  const isAssistantContext = role !== 'runner' && Boolean(assistantBinding?.runner_id);
  const assistantRunnerId = isAssistantContext ? assistantBinding?.runner_id : undefined;

  const allTabs = [
    { id: 'balance', label: 'Stock Balance', roles: ['admin', 'manager', 'salesperson', 'runner'] },
    { id: 'inbound', label: role === 'runner' ? 'Inbound Stock' : 'Inbound Pending', roles: ['admin', 'salesperson', 'manager', 'runner'] },
    { id: 'inbound-history', label: 'Inbound History', roles: ['admin', 'runner'] },
    { id: 'stock-audit', label: 'Stock Audit', roles: ['admin', 'runner', 'manager', 'salesperson'] },
    { id: 'adjustments', label: 'Adjustments', roles: ['admin'] },
    { id: 'warehouses', label: 'Warehouses', roles: ['admin'] },
    { id: 'data-sharing', label: 'Data Sharing', roles: ['admin'] },
  ];

  const tabs = allTabs.filter((tab) => {
    if (role && tab.roles.includes(role)) return true;
    if (!isAssistantContext) return false;
    if (tab.id === 'balance' || tab.id === 'stock-audit') return Boolean(assistantBinding?.can_view_stock_audit);
    if (tab.id === 'inbound' || tab.id === 'inbound-history') return Boolean(assistantBinding?.can_manage_inbound_stock);
    return false;
  });
  const requestedTab = searchParams.get('tab');
  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab! : (tabs[0]?.id || 'balance');

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })} className="min-w-0">
        <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 scrollbar-hide touch-pan-x [-webkit-overflow-scrolling:touch] md:mx-0 md:px-0">
          <TabsList className="inline-flex h-11 w-max min-w-max justify-start bg-secondary/30">
            {tabs.map(t => (
              <TabsTrigger key={t.id} value={t.id} className="shrink-0 whitespace-nowrap px-3 text-xs md:px-4 md:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      <EmbeddedProvider>
        <Suspense fallback={<Loading />}>
          <div className="mt-4">
            {activeTab === 'balance' && <InventoryBalance />}
            {activeTab === 'inbound' && ((role === 'runner' || (isAssistantContext && assistantBinding?.can_manage_inbound_stock))
              ? <RunnerInbound runnerIdOverride={assistantRunnerId} />
              : <InboundPending />)}
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
