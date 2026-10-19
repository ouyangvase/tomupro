import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Navigate, useSearchParams } from 'react-router-dom';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMyAssistantScope } from '@/hooks/useRunnerAssistants';
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
const FinanceReconciliationWorkspace = lazy(() => import('@/components/finance/FinanceReconciliationWorkspace'));
const RunnerClaimPage = lazy(() => import('@/components/finance/RunnerClaimPage'));
const ApprovalCenter = lazy(() => import('@/components/finance/ApprovalCenter'));
const FinanceDashboard = lazy(() => import('@/components/finance/FinanceDashboard'));
const FinalReportDashboard = lazy(() => import('@/components/finance/FinalReportDashboard'));
const MonthlyClosingPage = lazy(() => import('@/components/finance/MonthlyClosingPage'));
const FinanceAuditLogPage = lazy(() => import('@/components/finance/FinanceAuditLogPage'));
const RunnerDriverAnalyticsPage = lazy(() => import('@/pages/runner/RunnerDriverAnalyticsPage'));

const Loading = () => (
  <div className="flex items-center justify-center py-16">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

type AdminWorkspaceSection =
  | 'daily'
  | 'settings'
  | 'approval-center'
  | 'finance-dashboard'
  | 'monthly-closing'
  | 'finance-audit'
  | 'delivery-report';

type RunnerWorkspaceSection =
  | 'delivery-report'
  | 'expense-claim'
  | 'daily'
  | 'settings';

const adminWorkspaceSections: { id: AdminWorkspaceSection; label: string; description: string }[] = [
  { id: 'daily', label: 'Daily', description: 'Daily cash and transfer reconciliation' },
  { id: 'settings', label: 'Settings', description: 'Company setup and finance workflow settings' },
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
  { id: 'daily', label: 'Workspace', description: 'Daily cash and transfer reconciliation' },
  { id: 'settings', label: 'Settings', description: 'Finance workspace setup and status' },
];

function isRunnerWorkspaceSection(value: string): value is RunnerWorkspaceSection {
  return runnerWorkspaceSections.some((section) => section.id === value);
}

const runnerDriverStockTabs = new Set(['cash-driver', 'cash-settlement', 'driver-pickups', 'driver-returns', 'allocated-stock']);

function AdminFinanceWorkspace({ initialSection, onSectionChange }: { initialSection: AdminWorkspaceSection; onSectionChange: (section: AdminWorkspaceSection) => void }) {
  const [section, setSection] = useState<AdminWorkspaceSection>(initialSection);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const activeSection = adminWorkspaceSections.find((item) => item.id === section) || adminWorkspaceSections[0];
  const selectSection = (next: AdminWorkspaceSection) => {
    setSection(next);
    onSectionChange(next);
  };

  const renderSection = () => {
    switch (section) {
      case 'daily': return <FinanceReconciliationWorkspace />;
      case 'settings': return <WorkspaceSettings />;
      case 'approval-center': return <ApprovalCenter />;
      case 'finance-dashboard': return <FinanceDashboard />;
      case 'monthly-closing': return <MonthlyClosingPage />;
      case 'finance-audit': return <FinanceAuditLogPage />;
      case 'delivery-report': return <DeliveryFeesReport />;
      default: return <FinanceReconciliationWorkspace />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/50 bg-card p-2.5 shadow-sm sm:p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Finance Workspace</p>
            <h2 className="mt-0.5 text-base font-bold text-foreground sm:text-lg">{activeSection.label}</h2>
          </div>
          <span className="hidden text-xs text-muted-foreground sm:block">{activeSection.description}</span>
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {adminWorkspaceSections.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectSection(item.id)}
              className={[
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors sm:px-4 sm:py-2 sm:text-sm',
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

function RunnerFinanceWorkspace({ initialSection, onSectionChange }: { initialSection: RunnerWorkspaceSection; onSectionChange: (section: RunnerWorkspaceSection) => void }) {
  const [section, setSection] = useState<RunnerWorkspaceSection>(initialSection);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const activeSection = runnerWorkspaceSections.find((item) => item.id === section) || runnerWorkspaceSections[0];
  const selectSection = (next: RunnerWorkspaceSection) => {
    setSection(next);
    onSectionChange(next);
  };

  const renderSection = () => {
    switch (section) {
      case 'delivery-report': return <DeliveryFeesReport />;
      case 'expense-claim': return <RunnerClaimPage />;
      case 'daily': return <FinanceReconciliationWorkspace />;
      case 'settings': return <WorkspaceSettings />;
      default: return <FinanceReconciliationWorkspace />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/50 bg-card p-2.5 shadow-sm sm:p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Runner Finance</p>
            <h2 className="mt-0.5 text-base font-bold text-foreground sm:text-lg">{activeSection.label}</h2>
          </div>
          <span className="hidden text-xs text-muted-foreground sm:block">{activeSection.description}</span>
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {runnerWorkspaceSections.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectSection(item.id)}
              className={[
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors sm:px-4 sm:py-2 sm:text-sm',
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
  const { data: assistantScope, isLoading: assistantScopeLoading } = useMyAssistantScope();
  const role = profile?.role;
  const requestedTab = searchParams.get('tab') || '';
  const requestedView = searchParams.get('view') || '';
  const isRunnerFinanceRole = role === 'runner' || role === 'runner_assistant';
  const usesAdminFinanceTabs = !isRunnerFinanceRole && role !== 'finance_viewer';
  const adminWorkspaceSection = usesAdminFinanceTabs && isAdminWorkspaceSection(requestedView)
    ? requestedView
    : usesAdminFinanceTabs && isAdminWorkspaceSection(requestedTab)
      ? requestedTab
      : 'daily';
  const runnerWorkspaceSection = role === 'runner' && isRunnerWorkspaceSection(requestedView)
    ? requestedView
    : role === 'runner' && isRunnerWorkspaceSection(requestedTab)
      ? requestedTab
      : 'daily';

  if (role === 'runner_assistant' && assistantScopeLoading) {
    return <Loading />;
  }

  if (role === 'runner_assistant' && assistantScope?.analyticsRunnerIds.length === 0) {
    return <Navigate to="/dispatch" replace />;
  }

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
    { id: 'driver-analytics', label: 'Driver Analytics' },
    { id: 'claims-history', label: 'Claim History' },
    { id: 'delivery-charges', label: 'Delivery Charges' },
    { id: 'workspace', label: 'Finance Workspace' },
  ];

  const assistantTabs = [
    { id: 'driver-analytics', label: 'Driver Analytics' },
  ];

  const financeViewerTabs = [
    { id: 'reports', label: 'Reports' },
    { id: 'workspace', label: 'Workspace' },
  ];

  const tabs = role === 'finance_viewer'
    ? financeViewerTabs
    : role === 'runner'
      ? runnerTabs
      : role === 'runner_assistant'
        ? assistantTabs
        : adminTabs;
  const defaultTab = role === 'finance_viewer'
    ? 'reports'
    : role === 'runner'
      ? 'claims-history'
      : role === 'runner_assistant'
        ? 'driver-analytics'
      : 'reconciliation';
  const normalizedTab =
    usesAdminFinanceTabs && isAdminWorkspaceSection(requestedTab)
      ? 'workspace'
      : role === 'runner' && isRunnerWorkspaceSection(requestedTab)
        ? 'workspace'
        : requestedTab;
  const currentTab = tabs.find(t => t.id === normalizedTab) ? normalizedTab : defaultTab;

  const setWorkspaceSection = (section: AdminWorkspaceSection | RunnerWorkspaceSection) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'workspace');
    next.set('view', section);
    setSearchParams(next, { replace: true });
  };

  // Check if current tab is a workspace-related tab that needs CompanyProvider
  const workspaceTabs = ['workspace', 'reports'];
  const needsCompanyProvider = workspaceTabs.includes(currentTab);

  const renderTabContent = () => {
    switch (currentTab) {
      // Existing tabs
      case 'driver-analytics': return <RunnerDriverAnalyticsPage />;
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
          ? <AdminFinanceWorkspace initialSection={adminWorkspaceSection} onSectionChange={setWorkspaceSection} />
          : role === 'runner'
            ? <RunnerFinanceWorkspace initialSection={runnerWorkspaceSection} onSectionChange={setWorkspaceSection} />
            : <FinanceReconciliationWorkspace />;
      case 'reports': return <FinalReportDashboard />;
      default: return null;
    }
  };

  return (
    <div className="space-y-4 pb-16 md:pb-0">
      <Tabs value={currentTab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="h-10 w-max min-w-full justify-start bg-secondary/30">
            {tabs.map(t => (
              <TabsTrigger key={t.id} value={t.id} className="whitespace-nowrap px-3 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground md:px-4 md:text-sm">{t.label}</TabsTrigger>
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
