import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const ReconciliationAdmin = lazy(() => import('@/pages/reconciliation/ReconciliationAdmin'));
const ClaimBatchesAdmin = lazy(() => import('@/pages/admin/ClaimBatchesAdmin'));
const ClaimBatchesHistory = lazy(() => import('@/pages/admin/ClaimBatchesHistory'));
const DeliveryChargesAdmin = lazy(() => import('@/pages/admin/DeliveryChargesAdmin'));
const DeliveryFeesReport = lazy(() => import('@/pages/admin/DeliveryFeesReport'));
const AdminOverview = lazy(() => import('@/pages/admin/AdminOverview'));

// Runner finance
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
  const activeTab = searchParams.get('tab') || 'reconciliation';

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

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
    { id: 'cash-settlement', label: 'Cash Settlement' },
    { id: 'cash-driver', label: 'Cash Driver' },
    { id: 'delivery-charges', label: 'Delivery Charges' },
    { id: 'driver-pickups', label: 'Driver Pickups' },
    { id: 'driver-returns', label: 'Driver Returns' },
    { id: 'allocated-stock', label: 'Allocated Stock' },
  ];

  const tabs = role === 'runner' ? runnerTabs : adminTabs;
  const defaultTab = role === 'runner' ? 'my-claims' : 'reconciliation';
  const currentTab = tabs.find(t => t.id === activeTab) ? activeTab : defaultTab;

  return (
    <div className="space-y-4">
      <Tabs value={currentTab} onValueChange={handleTabChange}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="w-full justify-start bg-secondary/30 h-11">
            {tabs.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="text-xs md:text-sm px-3 md:px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <Suspense fallback={<Loading />}>
          {/* Admin tabs */}
          <TabsContent value="reconciliation" className="mt-4"><ReconciliationAdmin embedded /></TabsContent>
          <TabsContent value="claims" className="mt-4"><ClaimBatchesAdmin embedded /></TabsContent>
          <TabsContent value="claims-history" className="mt-4"><ClaimBatchesHistory embedded /></TabsContent>
          <TabsContent value="delivery-charges" className="mt-4">
            {role === 'runner' ? <RunnerDeliveryCharges embedded /> : <DeliveryChargesAdmin embedded />}
          </TabsContent>
          <TabsContent value="delivery-report" className="mt-4"><DeliveryFeesReport embedded /></TabsContent>
          <TabsContent value="overview" className="mt-4"><AdminOverview embedded /></TabsContent>

          {/* Runner tabs */}
          <TabsContent value="my-claims" className="mt-4"><RunnerClaimBatches embedded /></TabsContent>
          <TabsContent value="cash-settlement" className="mt-4"><RunnerCashSettlement embedded /></TabsContent>
          <TabsContent value="cash-driver" className="mt-4"><RunnerCashDriver embedded /></TabsContent>
          <TabsContent value="driver-pickups" className="mt-4"><DriverPickups embedded /></TabsContent>
          <TabsContent value="driver-returns" className="mt-4"><DriverReturns embedded /></TabsContent>
          <TabsContent value="allocated-stock" className="mt-4"><RunnerAllocatedStock embedded /></TabsContent>
        </Suspense>
      </Tabs>
    </div>
  );
}
