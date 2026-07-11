import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';
import { CompanyProvider } from '@/contexts/CompanyContext';

// Existing finance components
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

// Finance Workspace components
const WorkspaceSettings = lazy(() => import('@/components/finance/WorkspaceSettings'));
const RunnerClaimPage = lazy(() => import('@/components/finance/RunnerClaimPage'));
const ApprovalCenter = lazy(() => import('@/components/finance/ApprovalCenter'));
const FinanceDashboard = lazy(() => import('@/components/finance/FinanceDashboard'));
const FinalReportDashboard = lazy(() => import('@/components/finance/FinalReportDashboard'));
const MonthlyClosingPage = lazy(() => import('@/components/finance/MonthlyClosingPage'));
const FinanceAuditLogPage = lazy(() => import('@/components/finance/FinanceAuditLogPage'));

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
    { id: 'workspace', label: 'Workspace' },
    { id: 'approval-center', label: 'Approvals' },
    { id: 'finance-dashboard', label: 'Dashboard' },
    { id: 'monthly-closing', label: 'Close Month' },
    { id: 'finance-audit', label: 'Audit Log' },
  ];

  const runnerTabs = [
    { id: 'my-claims', label: 'My Claims' },
    { id: 'claims-history', label: 'Claim History' },
    { id: 'cash-settlement', label: 'Cash Settlement' },
    { id: 'cash-driver', label: 'Cash Driver' },
    { id: 'delivery-charges', label: 'Delivery Charges' },
    { id: 'delivery-report', label: 'My Income' },
    { id: 'driver-pickups', label: 'Driver Pickups' },
    { id: 'driver-returns', label: 'Driver Returns' },
    { id: 'allocated-stock', label: 'Allocated Stock' },
    { id: 'expense-claim', label: 'Expense Claim' },
    { id: 'workspace', label: 'Workspace' },
  ];

  const financeViewerTabs = [
    { id: 'reports', label: 'Reports' },
    { id: 'workspace', label: 'Workspace' },
  ];

  const tabs = role === 'finance_viewer' ? financeViewerTabs : role === 'runner' ? runnerTabs : adminTabs;
  const defaultTab = role === 'finance_viewer' ? 'reports' : role === 'runner' ? 'my-claims' : 'reconciliation';
  const currentTab = tabs.find(t => t.id === (searchParams.get('tab') || '')) ? searchParams.get('tab')! : defaultTab;

  // Check if current tab is a workspace-related tab that needs CompanyProvider
  const workspaceTabs = ['workspace', 'expense-claim', 'approval-center', 'finance-dashboard', 'reports', 'monthly-closing', 'finance-audit'];
  const needsCompanyProvider = workspaceTabs.includes(currentTab);

  const renderTabContent = () => {
    switch (currentTab) {
      // Existing tabs
      case 'reconciliation': return <ReconciliationAdmin />;
      case 'claims': return <ClaimBatchesAdmin />;
      case 'claims-history': return <ClaimBatchesHistory />;
      case 'delivery-charges': return role === 'runner' ? <RunnerDeliveryCharges /> : <DeliveryChargesAdmin />;
      case 'delivery-report': return <DeliveryFeesReport />;
      case 'overview': return <AdminOverview />;
      case 'my-claims': return <RunnerClaimBatches />;
      case 'cash-settlement': return <RunnerCashSettlement />;
      case 'cash-driver': return <RunnerCashDriver />;
      case 'driver-pickups': return <DriverPickups />;
      case 'driver-returns': return <DriverReturns />;
      case 'allocated-stock': return <RunnerAllocatedStock />;
      // New workspace tabs
      case 'workspace': return <WorkspaceSettings />;
      case 'expense-claim': return <RunnerClaimPage />;
      case 'approval-center': return <ApprovalCenter />;
      case 'finance-dashboard': return <FinanceDashboard />;
      case 'reports': return <FinalReportDashboard />;
      case 'monthly-closing': return <MonthlyClosingPage />;
      case 'finance-audit': return <FinanceAuditLogPage />;
      default: return null;
    }
  };

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
            {needsCompanyProvider ? (
              <CompanyProvider>
                {renderTabContent()}
              </CompanyProvider>
            ) : (
              renderTabContent()
            )}
          </div>
        </Suspense>
      </EmbeddedProvider>
    </div>
  );
}
