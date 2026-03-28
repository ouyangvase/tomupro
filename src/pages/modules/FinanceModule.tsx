import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';

const ReconciliationAdmin = lazy(() => import('@/pages/reconciliation/ReconciliationAdmin'));
const ClaimBatchesAdmin = lazy(() => import('@/pages/admin/ClaimBatchesAdmin'));
const ClaimBatchesHistory = lazy(() => import('@/pages/admin/ClaimBatchesHistory'));
const DeliveryChargesAdmin = lazy(() => import('@/pages/admin/DeliveryChargesAdmin'));
const DeliveryFeesReport = lazy(() => import('@/pages/admin/DeliveryFeesReport'));
const AdminOverview = lazy(() => import('@/pages/admin/AdminOverview'));
const RunnerClaimBatches = lazy(() => import('@/pages/runner/RunnerClaimBatches'));
const RunnerCashSettlement = lazy(() => import('@/pages/runner/RunnerCashSettlement'));
const RunnerCashDriver = lazy(() => import('@/pages/runner/RunnerCashDriver'));
const RunnerDeliveryCharges = lazy(() => import('@/pages/runner/RunnerDeliveryCharges'));
const DriverPickups = lazy(() => import('@/pages/runner/DriverPickups'));
const DriverReturns = lazy(() => import('@/pages/runner/DriverReturns'));
const RunnerAllocatedStock = lazy(() => import('@/pages/runner/RunnerAllocatedStock'));

const Loading = () => (
  <div className="flex items-center justify-center py-16">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

export default function FinanceModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const role = profile?.role;

  const adminTabs = [
    { id: 'reconciliation', label: 'Reconciliation' },
    { id: 'claims', label: 'Claim Batches' },
    { id: 'claims-history', label: 'Claim History' },
    { id: 'delivery-charges', label: 'Delivery Charges' },
    { id: 'delivery-report', label: 'Delivery Report' },
    { id: 'overview', label: 'Overview' },
  ];

  const runnerTabs = [
    { id: 'my-claims', label: 'My Claims' },
    { id: 'claims-history', label: 'Claim History' },
    { id: 'cash-settlement', label: 'Cash Settlement' },
    { id: 'cash-driver', label: 'Cash Driver' },
    { id: 'delivery-charges', label: 'Delivery Charges' },
    { id: 'driver-pickups', label: 'Driver Pickups' },
    { id: 'driver-returns', label: 'Driver Returns' },
    { id: 'allocated-stock', label: 'Allocated Stock' },
  ];

  const tabs = role === 'runner' ? runnerTabs : adminTabs;
  const defaultTab = role === 'runner' ? 'my-claims' : 'reconciliation';
  const currentTab = tabs.find(t => t.id === (searchParams.get('tab') || '')) ? searchParams.get('tab')! : defaultTab;

  return (
    <div className="space-y-4">
      <Tabs value={currentTab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}>
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
            {currentTab === 'reconciliation' && <ReconciliationAdmin />}
            {currentTab === 'claims' && <ClaimBatchesAdmin />}
            {currentTab === 'claims-history' && <ClaimBatchesHistory />}
            {currentTab === 'delivery-charges' && (role === 'runner' ? <RunnerDeliveryCharges /> : <DeliveryChargesAdmin />)}
            {currentTab === 'delivery-report' && <DeliveryFeesReport />}
            {currentTab === 'overview' && <AdminOverview />}
            {currentTab === 'my-claims' && <RunnerClaimBatches />}
            {currentTab === 'cash-settlement' && <RunnerCashSettlement />}
            {currentTab === 'cash-driver' && <RunnerCashDriver />}
            {currentTab === 'driver-pickups' && <DriverPickups />}
            {currentTab === 'driver-returns' && <DriverReturns />}
            {currentTab === 'allocated-stock' && <RunnerAllocatedStock />}
          </div>
        </Suspense>
      </EmbeddedProvider>
    </div>
  );
}
