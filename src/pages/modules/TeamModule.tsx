import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense, useMemo } from 'react';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';
import { useAuth } from '@/contexts/AuthContext';

const UsersSettings = lazy(() => import('@/pages/settings/UsersSettings'));
const PendingStockApprovals = lazy(() => import('@/pages/manager/PendingStockApprovals'));
const ManagerOversight = lazy(() => import('@/pages/manager/ManagerOversight'));
const RunnerAssistantSettings = lazy(() => import('@/pages/settings/RunnerAssistantSettings'));

const Loading = () => (
  <div className="flex items-center justify-center py-16">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const allTabs = [
  { id: 'users', label: 'Users', roles: ['admin'] },
  { id: 'assistants', label: 'Assistants', roles: ['admin'] },
  { id: 'approvals', label: 'Pending Approvals', roles: ['admin'] },
  { id: 'oversight', label: 'Team Oversight', roles: ['admin', 'manager'] },
];

export default function TeamModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const role = profile?.role;

  const tabs = useMemo(() => allTabs.filter(t => role && t.roles.includes(role)), [role]);
  const activeTab = searchParams.get('tab') || (tabs[0]?.id ?? 'oversight');

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
            {activeTab === 'users' && <UsersSettings />}
            {activeTab === 'assistants' && <RunnerAssistantSettings />}
            {activeTab === 'approvals' && <PendingStockApprovals />}
            {activeTab === 'oversight' && <ManagerOversight />}
          </div>
        </Suspense>
      </EmbeddedProvider>
    </div>
  );
}
