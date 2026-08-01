import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';
import { useMyAssistantScope } from '@/hooks/useRunnerAssistants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { resolveAssistantWorkspace } from '@/lib/assistantWorkspace';

const InventoryBalance = lazy(() => import('@/pages/InventoryBalance'));
const InboundPending = lazy(() => import('@/pages/inbound/InboundPending'));
const RunnerInbound = lazy(() => import('@/pages/runner/RunnerInbound'));
const InboundHistory = lazy(() => import('@/pages/inbound/InboundHistory'));
const StockAdjustment = lazy(() => import('@/pages/inventory/StockAdjustment'));
const WarehouseManagement = lazy(() => import('@/pages/admin/WarehouseManagement'));
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
  const { data: assistantBinding } = useMyAssistantScope();
  const linkedRunnerIds = assistantBinding?.runnerIds || [];
  const hasPrimaryInventoryWorkspace = ['admin', 'manager', 'salesperson', 'runner'].includes(role || '');
  const {
    selectedWorkspace,
    isAssistantWorkspace: isAssistantContext,
    runnerIdsOverride: assistantRunnerIds,
    showWorkspaceSelector,
  } = resolveAssistantWorkspace({
    hasPrimaryWorkspace: hasPrimaryInventoryWorkspace,
    linkedRunnerIds,
    requestedWorkspace: searchParams.get('runner'),
  });
  const setRouteParam = (key: string, value: string) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(key, value);
      return next;
    }, { replace: true });
  };

  const allTabs = [
    { id: 'balance', label: 'Stock Balance', roles: ['admin', 'manager', 'salesperson', 'runner'] },
    { id: 'inbound', label: role === 'runner' ? 'Inbound Stock' : 'Inbound Pending', roles: ['admin', 'salesperson', 'manager', 'runner'] },
    { id: 'inbound-history', label: 'Inbound History', roles: ['admin', 'runner'] },
    { id: 'adjustments', label: 'Adjustments', roles: ['admin'] },
    { id: 'warehouses', label: 'Warehouses', roles: ['admin'] },
    { id: 'data-sharing', label: 'Data Sharing', roles: ['admin'] },
  ];

  const tabs = allTabs.filter((tab) => {
    if (isAssistantContext) {
      if (tab.id === 'balance') return Boolean(assistantBinding?.can_view_stock_audit);
      if (tab.id === 'inbound' || tab.id === 'inbound-history') return Boolean(assistantBinding?.can_manage_inbound_stock);
      return false;
    }
    return Boolean(role && tab.roles.includes(role));
  });
  const rawRequestedTab = searchParams.get('tab');
  const requestedTab = rawRequestedTab === 'stock-audit' || rawRequestedTab === 'stock-rebuild'
    ? 'balance'
    : rawRequestedTab;
  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab! : (tabs[0]?.id || 'balance');

  useEffect(() => {
    if (rawRequestedTab === 'stock-audit' || rawRequestedTab === 'stock-rebuild') {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        next.set('tab', 'balance');
        return next;
      }, { replace: true });
    }
  }, [rawRequestedTab, setSearchParams]);

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setRouteParam('tab', v)} className="min-w-0">
        <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 scrollbar-hide touch-pan-x [-webkit-overflow-scrolling:touch] md:mx-0 md:px-0">
          <TabsList className="inline-flex h-11 w-max min-w-max justify-start bg-secondary/30">
            {tabs.map(t => (
              <TabsTrigger key={t.id} value={t.id} className="shrink-0 whitespace-nowrap px-3 text-xs md:px-4 md:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      {showWorkspaceSelector && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Workspace</span>
          <Select value={selectedWorkspace} onValueChange={(value) => setRouteParam('runner', value)}>
            <SelectTrigger className="h-9 w-full max-w-[240px] rounded-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {hasPrimaryInventoryWorkspace && <SelectItem value="self">My Workspace</SelectItem>}
              {!hasPrimaryInventoryWorkspace && <SelectItem value="all">All Linked Runners</SelectItem>}
              {(assistantBinding?.runners || []).map((runner) => (
                <SelectItem key={runner.id} value={runner.id}>
                  {runner.display_name || runner.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <EmbeddedProvider>
        <Suspense fallback={<Loading />}>
          <div className="mt-4">
            {activeTab === 'balance' && (
              <InventoryBalance
                isRunnerAssistant={isAssistantContext}
                assistantRunnerIds={assistantRunnerIds}
              />
            )}
            {activeTab === 'inbound' && (((role === 'runner' && !isAssistantContext) || (isAssistantContext && assistantBinding?.can_manage_inbound_stock))
              ? isAssistantContext && assistantRunnerIds && assistantRunnerIds.length !== 1
                ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Select one linked Runner before creating inbound stock.</div>
                : <RunnerInbound runnerIdOverride={assistantRunnerIds?.[0]} />
              : <InboundPending />)}
            {activeTab === 'inbound-history' && <InboundHistory runnerIdOverride={assistantRunnerIds} />}
            {activeTab === 'adjustments' && <StockAdjustment />}
            {activeTab === 'warehouses' && <WarehouseManagement />}
            {activeTab === 'data-sharing' && <DataSharingAdmin />}
          </div>
        </Suspense>
      </EmbeddedProvider>
    </div>
  );
}
