import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Navigate, useSearchParams } from 'react-router-dom';
import { lazy, Suspense, useEffect, useState, Component, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';
import { SyncNowButton } from '@/components/google-sheet/SyncNowButton';
import { useMyAssistantBinding } from '@/hooks/useRunnerAssistants';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Layers, X } from 'lucide-react';

// Retry dynamic import once on chunk load failure (stale deployment cache)
function lazyRetry<T extends { default: React.ComponentType<any> }>(
  importFn: () => Promise<T>,
) {
  return lazy(() =>
    importFn().catch(() => {
      // Chunk missing after redeployment — reload page once
      const key = 'chunk_reload';
      const last = sessionStorage.getItem(key);
      if (!last || Date.now() - Number(last) > 10_000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
      }
      return importFn(); // rethrow if reload didn't help
    }),
  );
}

const RunnerInbox = lazyRetry(() => import('@/pages/runner/RunnerInbox'));
const AdminRunnerInbox = lazyRetry(() => import('@/pages/admin/AdminRunnerInbox'));
const DriverLocationsPage = lazyRetry(() => import('@/pages/runner/DriverLocationsPage'));
const RunnerDriverInbox = lazyRetry(() => import('@/pages/runner/RunnerDriverInbox'));
const DriverManagement = lazyRetry(() => import('@/pages/runner/DriverManagement'));
const RunnerDriverStockWorkspace = lazyRetry(() => import('@/pages/runner/RunnerDriverStockWorkspace'));
const RunnerFailedOrders = lazyRetry(() => import('@/pages/runner/RunnerFailedOrders'));
const RunnerDeliveredOrders = lazyRetry(() => import('@/pages/runner/RunnerDeliveredOrders'));
const SmartMergeTab = lazyRetry(() => import('@/pages/runner/SmartMergeTab'));

const Loading = () => (
  <div className="flex items-center justify-center py-16">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

class TabErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      const isChunkError = this.state.error.message?.includes('dynamically imported module') ||
        this.state.error.message?.includes('Loading chunk') ||
        this.state.error.message?.includes('Failed to fetch');
      return (
        <div className="p-8 text-center space-y-3">
          <p className="text-destructive font-medium">Something went wrong loading this tab.</p>
          <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
          <button
            className="text-sm text-primary underline"
            onClick={() => {
              if (isChunkError) {
                window.location.reload();
              } else {
                this.setState({ error: null });
              }
            }}
          >
            {isChunkError ? 'Reload page' : 'Try again'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function DispatchModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const role = profile?.role;
  const { data: assistantBinding, isLoading: assistantBindingLoading } = useMyAssistantBinding();
  const activeTab = searchParams.get('tab') || 'inbox';
  const highlightOrderId = searchParams.get('highlight') || null;
  const routeSearch = searchParams.get('search') || '';
  const [showDuplicateOrders, setShowDuplicateOrders] = useState(false);
  const assistantRunnerId = role === 'runner_assistant' ? assistantBinding?.runner_id : undefined;

  const runnerTabs = [
    { id: 'inbox', label: 'Runner Inbox' },
    { id: 'driver-inbox', label: 'Driver Inbox' },
    { id: 'drivers', label: 'Drivers' },
    { id: 'driver-stock', label: 'Driver Stock' },
    { id: 'failed', label: 'Failed Orders' },
    { id: 'delivered', label: 'Delivered Orders' },
    { id: 'map', label: 'Live Map' },
  ];

  const adminTabs = [
    { id: 'inbox', label: 'Runner Inbox' },
    { id: 'map', label: 'Live Map' },
  ];

  const runnerAssistantTabs = [
    { id: 'inbox', label: assistantBinding?.can_deliver ? 'Runner Inbox' : 'Receipt Inbox' },
    ...(assistantBinding?.can_manage_driver_inbox ? [{ id: 'driver-inbox', label: 'Driver Inbox' }] : []),
    ...(assistantBinding?.can_manage_driver_stock ? [{ id: 'driver-stock', label: 'Driver Stock' }] : []),
    ...(assistantBinding?.can_deliver ? [{ id: 'delivered', label: 'Delivered Orders' }] : []),
  ];

  const tabs = role === 'runner' ? runnerTabs : role === 'runner_assistant' ? runnerAssistantTabs : adminTabs;
  const canUseDriverInbox = role === 'runner' || (role === 'runner_assistant' && Boolean(assistantBinding?.can_manage_driver_inbox));
  const canUseDriverStock = role === 'runner' || (role === 'runner_assistant' && Boolean(assistantBinding?.can_manage_driver_stock));

  // Redirect unknown tabs to inbox (inside useEffect to avoid render-time state updates)
  const validTabIds = tabs.map(t => t.id);
  const assistantTabsPending = role === 'runner_assistant' && assistantBindingLoading;
  const isInvalidTab = !!role && !!activeTab && !assistantTabsPending && !validTabIds.includes(activeTab);
  useEffect(() => {
    if (isInvalidTab) {
      setSearchParams({ tab: 'inbox' }, { replace: true });
    }
  }, [isInvalidTab, setSearchParams]);

  useEffect(() => {
    setShowDuplicateOrders(false);
  }, [activeTab]);

  useEffect(() => {
    if (!highlightOrderId) return;

    const timer = window.setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('highlight');
        return next;
      }, { replace: true });
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [highlightOrderId, setSearchParams]);

  const duplicateOrdersAction = activeTab === 'inbox' && role === 'runner' ? (
    <Button
      type="button"
      variant={showDuplicateOrders ? 'default' : 'outline'}
      size="sm"
      className="h-10 rounded-full whitespace-nowrap"
      onClick={() => setShowDuplicateOrders((open) => !open)}
    >
      <Layers className="mr-2 h-4 w-4" />
      Duplicate Orders
    </Button>
  ) : null;

  const duplicateOrdersPanel = showDuplicateOrders && role === 'runner' ? (
    <Card className="mt-3 p-3 md:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Duplicate Orders</p>
          <p className="text-xs text-muted-foreground">
            Orders with the same customer phone, address, and delivery date.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full"
          onClick={() => setShowDuplicateOrders(false)}
          aria-label="Close duplicate orders"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <TabErrorBoundary>
        <SmartMergeTab embedded />
      </TabErrorBoundary>
    </Card>
  ) : null;

  if (activeTab === 'inbound') {
    return <Navigate to="/inventory?tab=inbound" replace />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })} className="min-w-0 flex-1">
          <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 scrollbar-hide touch-pan-x [-webkit-overflow-scrolling:touch] md:mx-0 md:px-0">
            <TabsList className="inline-flex h-11 w-max min-w-max justify-start bg-secondary/30">
              {tabs.map(t => (
                <TabsTrigger key={t.id} value={t.id} className="shrink-0 whitespace-nowrap px-3 text-xs md:px-4 md:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t.label}</TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
        {(role === 'runner' || role === 'runner_assistant' || role === 'admin' || role === 'manager' || role === 'operator') && (
          <SyncNowButton
            variant="ghost"
            size="sm"
            showLabel={false}
            className={`shrink-0 ${role === 'runner_assistant' ? 'hidden md:inline-flex' : ''}`}
          />
        )}
      </div>
      <EmbeddedProvider>
        <Suspense fallback={<Loading />}>
          <div className="mt-4">
            {activeTab === 'inbox' && role === 'admin' && (
              <div className="mb-4">
                <Button
                  type="button"
                  variant={showDuplicateOrders ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full"
                  onClick={() => setShowDuplicateOrders((open) => !open)}
                >
                  <Layers className="mr-2 h-4 w-4" />
                  Duplicate Orders
                </Button>
                {showDuplicateOrders && (
                  <Card className="mt-3 p-3 md:p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Duplicate Orders</p>
                        <p className="text-xs text-muted-foreground">
                          Orders with the same customer phone, address, and delivery date.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 rounded-full"
                        onClick={() => setShowDuplicateOrders(false)}
                        aria-label="Close duplicate orders"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <TabErrorBoundary>
                      <SmartMergeTab embedded />
                    </TabErrorBoundary>
                  </Card>
                )}
              </div>
            )}
            {activeTab === 'inbox' && (role === 'admin' ? <AdminRunnerInbox /> : (
              <TabErrorBoundary>
                <RunnerInbox
                  initialSearch={routeSearch}
                  highlightOrderId={highlightOrderId}
                  duplicateOrdersAction={duplicateOrdersAction}
                  duplicateOrdersPanel={duplicateOrdersPanel}
                />
              </TabErrorBoundary>
            ))}
            {activeTab === 'driver-inbox' && canUseDriverInbox && (
              <TabErrorBoundary>
                <RunnerDriverInbox runnerIdOverride={assistantRunnerId} />
              </TabErrorBoundary>
            )}
            {activeTab === 'drivers' && role === 'runner' && <DriverManagement />}
            {activeTab === 'driver-stock' && canUseDriverStock && (
              <TabErrorBoundary>
                <RunnerDriverStockWorkspace
                  runnerIdOverride={assistantRunnerId}
                  hideCashSettlement={role === 'runner_assistant'}
                />
              </TabErrorBoundary>
            )}
            {activeTab === 'failed' && role === 'runner' && (
              <RunnerFailedOrders initialSearch={routeSearch} highlightOrderId={highlightOrderId} />
            )}
            {activeTab === 'map' && <DriverLocationsPage />}
            {activeTab === 'delivered' && (role === 'runner' || role === 'runner_assistant') && (
              <RunnerDeliveredOrders initialSearch={routeSearch} highlightOrderId={highlightOrderId} />
            )}
          </div>
        </Suspense>
      </EmbeddedProvider>
    </div>
  );
}
