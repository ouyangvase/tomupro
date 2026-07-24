import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Navigate, useSearchParams } from 'react-router-dom';
import { lazy, Suspense, useEffect, useState } from 'react';
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
const RunnerDeliveryCharges = lazy(() => import('@/pages/runner/RunnerDeliveryCharges'));

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

type AdminWorkspaceSection =
  | 'workspace'
  | 'approval-center'
  | 'finance-dashboard'
  | 'monthly-closing'
  | 'finance-audit'
  | 'delivery-report';

type RunnerWorkspaceSection =
  | 'delivery-report'
  | 'expense-claim'
  | 'workspace';

const adminWorkspaceSections: { id: AdminWorkspaceSection; label: string; description: string }[] = [
  { id: 'workspace', label: 'Settings', description: 'Company setup and finance workflow settings' },
  { id: 'approval-center', label: 'Approvals', description: 'Review pending finance approvals' },
  { id: 'finance-dashboard', label: 'Dashboard', description: 'Finance summary and operating metrics' },
  { id: 'monthly-closing', label: 'Close Month', description: 'Monthly closing controls and status' },
  { id: 'finance-audit', label: 'Audit Log', description: 'Finance audit trail and history' },
  { id: 'delivery-report', label: 'Delivery Report', description: 'Delivery fee and income report' },
];

function isAdminWorkspaceSection(value: string): value is AdminWorkspaceSection {
  return adminWorkspaceSections.some((section) => section.id === value);
}

const runnerWorkspaceSections: { id: RunnerWorkspaceSection; label: string; description: string }[] = [
  { id: 'delivery-report', label: 'My Income', description: 'Delivery income and fee report' },
  { id: 'expense-claim', label: 'Expense Claim', description: 'Submit and track expense claims' },
  { id: 'workspace', label: 'Workspace', description: 'Finance workspace setup and status' },
];

function isRunnerWorkspaceSection(value: string): value is RunnerWorkspaceSection {
  return runnerWorkspaceSections.some((section) => section.id === value);
}

const runnerDriverStockTabs = new Set(['cash-driver', 'cash-settlement', 'driver-pickups', 'driver-returns', 'allocated-stock']);

function AdminFinanceWorkspace({ initialSection }: { initialSection: AdminWorkspaceSection }) {
  const [section, setSection] = useState<AdminWorkspaceSection>(initialSection);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const activeSection = adminWorkspaceSections.find((item) => item.id === section) || adminWorkspaceSections[0];

  const renderSection = () => {
    switch (section) {
      case 'workspace': return <WorkspaceSettings />;
      case 'approval-center': return <ApprovalCenter />;
      case 'finance-dashboard': return <FinanceDashboard />;
      case 'monthly-closing': return <MonthlyClosingPage />;
      case 'finance-audit': return <FinanceAuditLogPage />;
      case 'delivery-report': return <DeliveryFeesReport />;
      default: return <WorkspaceSettings />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Finance Workspace</p>
        <h2 className="mt-2 text-2xl font-black text-foreground">{activeSection.label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{activeSection.description}</p>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {adminWorkspaceSections.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={[
                'shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                section === item.id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/60 bg-background text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {renderSection()}
    </div>
  );
}

function RunnerFinanceWorkspace({ initialSection }: { initialSection: RunnerWorkspaceSection }) {
  const [section, setSection] = useState<RunnerWorkspaceSection>(initialSection);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const activeSection = runnerWorkspaceSections.find((item) => item.id === section) || runnerWorkspaceSections[0];

  const renderSection = () => {
    switch (section) {
      case 'delivery-report': return <DeliveryFeesReport />;
      case 'expense-claim': return <RunnerClaimPage />;
      case 'workspace': return <WorkspaceSettings />;
      default: return <DeliveryFeesReport />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Runner Finance</p>
        <h2 className="mt-2 text-2xl font-black text-foreground">{activeSection.label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{activeSection.description}</p>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {runnerWorkspaceSections.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={[
                'shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                section === item.id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/60 bg-background text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {renderSection()}
    </div>
  );
}

export default function FinanceModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const role = profile?.role;
  const requestedTab = searchParams.get('tab') || '';
  const usesAdminFinanceTabs = role !== 'runner' && role !== 'finance_viewer';
  const adminWorkspaceSection = usesAdminFinanceTabs && isAdminWorkspaceSection(requestedTab) ? requestedTab : 'workspace';
  const runnerWorkspaceSection = role === 'runner' && isRunnerWorkspaceSection(requestedTab) ? requestedTab : 'delivery-report';

  if (role === 'runner' && runnerDriverStockTabs.has(requestedTab)) {
    return <Navigate to="/dispatch?tab=driver-stock" replace />;
  }

  const adminTabs = [
    { id: 'reconciliation', label: 'Reconciliation' },
    { id: 'claims', label: 'Claim Batches' },
    { id: 'claims-history', label: 'Claim History' },
    { id: 'delivery-charges', label: 'Delivery Charges' },
    { id: 'overview', label: 'Overview' },
    { id: 'workspace', label: 'Finance Workspace' },
  ];

  const runnerTabs = [
    { id: 'my-claims', label: 'My Claims' },
    { id: 'claims-history', label: 'Claim History' },
    { id: 'delivery-charges', label: 'Delivery Charges' },
    { id: 'workspace', label: 'Finance Workspace' },
  ];

  const financeViewerTabs = [
    { id: 'reports', label: 'Reports' },
    { id: 'workspace', label: 'Workspace' },
  ];

  const tabs = role === 'finance_viewer' ? financeViewerTabs : role === 'runner' ? runnerTabs : adminTabs;
  const defaultTab = role === 'finance_viewer' ? 'reports' : role === 'runner' ? 'my-claims' : 'reconciliation';
  const normalizedTab =
    usesAdminFinanceTabs && isAdminWorkspaceSection(requestedTab)
      ? 'workspace'
      : role === 'runner' && isRunnerWorkspaceSection(requestedTab)
        ? 'workspace'
        : requestedTab;
  const currentTab = tabs.find(t => t.id === normalizedTab) ? normalizedTab : defaultTab;

  // Check if current tab is a workspace-related tab that needs CompanyProvider
  const workspaceTabs = ['workspace', 'reports'];
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
      // New workspace tabs
      case 'workspace':
        return usesAdminFinanceTabs
          ? <AdminFinanceWorkspace initialSection={adminWorkspaceSection} />
          : role === 'runner'
            ? <RunnerFinanceWorkspace initialSection={runnerWorkspaceSection} />
            : <WorkspaceSettings />;
      case 'reports': return <FinalReportDashboard />;
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
