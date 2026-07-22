import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense, useEffect, Component, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';
import { SyncNowButton } from '@/components/google-sheet/SyncNowButton';
import { useMyAssistantBinding } from '@/hooks/useRunnerAssistants';

// Retry dynamic import once on chunk load failure (stale deployment cache)
function lazyRetry<T extends { default: React.ComponentType<unknown> }>(
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
const RunnerInbound = lazyRetry(() => import('@/pages/runner/RunnerInbound'));
const DriverLocationsPage = lazyRetry(() => import('@/pages/runner/DriverLocationsPage'));
const RunnerDriverInbox = lazyRetry(() => import('@/pages/runner/RunnerDriverInbox'));
const DriverManagement = lazyRetry(() => import('@/pages/runner/DriverManagement'));
const RunnerFailedOrders = lazyRetry(() => import('@/pages/runner/RunnerFailedOrders'));
const RunnerDeliveredOrders = lazyRetry(() => import('@/pages/runner/RunnerDeliveredOrders'));
const RunnerPickupOrders = lazyRetry(() => import('@/pages/runner/RunnerPickupOrders'));
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
  const { data: assistantBinding } = useMyAssistantBinding();
  const activeTab = searchParams.get('tab') || 'inbox';

  const runnerTabs = [
    { id: 'inbox', label: 'Runner Inbox' },
    { id: 'driver-inbox', label: 'Driver Inbox' },
    { id: 'smart-merge', label: 'Smart Merge' },
    { id: 'pickup-orders', label: 'Pickup Orders' },
    { id: 'inbound', label: 'Inbound' },
    { id: 'drivers', label: 'Drivers' },
    { id: 'failed', label: 'Failed Orders' },
    { id: 'map', label: 'Live Map' },
    { id: 'delivered', label: 'Delivered Orders' },
  ];

  const adminTabs = [
    { id: 'inbox', label: 'Runner Inbox' },
    { id: 'smart-merge', label: 'Smart Merge' },
    { id: 'inbound', label: 'Inbound' },
    { id: 'map', label: 'Live Map' },
  ];

  const runnerAssistantTabs = assistantBinding?.can_deliver
    ? [
        { id: 'inbox', label: 'Runner Inbox' },
        { id: 'delivered', label: 'Delivered Orders' },
      ]
    : [
        { id: 'inbox', label: 'Receipt Inbox' },
      ];

  const tabs = role === 'runner' ? runnerTabs : role === 'runner_assistant' ? runnerAssistantTabs : adminTabs;

  // Redirect unknown tabs to inbox (inside useEffect to avoid render-time state updates)
  const validTabIds = tabs.map(t => t.id);
  const isInvalidTab = !!role && !!activeTab && !validTabIds.includes(activeTab);
  useEffect(() => {
    if (isInvalidTab) {
      setSearchParams({ tab: 'inbox' }, { replace: true });
    }
  }, [isInvalidTab, setSearchParams]);

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
            {activeTab === 'inbox' && (role === 'admin' ? <AdminRunnerInbox /> : <TabErrorBoundary><RunnerInbox /></TabErrorBoundary>)}
            {activeTab === 'smart-merge' && <TabErrorBoundary><SmartMergeTab /></TabErrorBoundary>}
            {activeTab === 'pickup-orders' && role === 'runner' && <RunnerPickupOrders />}
            {activeTab === 'inbound' && <RunnerInbound />}
            {activeTab === 'driver-inbox' && role === 'runner' && <RunnerDriverInbox />}
            {activeTab === 'drivers' && role === 'runner' && <DriverManagement />}
            {activeTab === 'failed' && role === 'runner' && <RunnerFailedOrders />}
            {activeTab === 'map' && <DriverLocationsPage />}
            {activeTab === 'delivered' && (role === 'runner' || role === 'runner_assistant') && <RunnerDeliveredOrders />}
          </div>
        </Suspense>
      </EmbeddedProvider>
    </div>
  );
}
