import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { EmbeddedProvider } from '@/contexts/EmbeddedContext';

const UsersSettings = lazy(() => import('@/pages/settings/UsersSettings'));
const PendingStockApprovals = lazy(() => import('@/pages/manager/PendingStockApprovals'));
const ManagerOversight = lazy(() => import('@/pages/manager/ManagerOversight'));

const Loading = () => (
  <div className="flex items-center justify-center py-16">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const tabs = [
  { id: 'users', label: 'Users' },
  { id: 'approvals', label: 'Pending Approvals' },
  { id: 'oversight', label: 'Team Oversight' },
];

export default function TeamModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'users';

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
            {activeTab === 'approvals' && <PendingStockApprovals />}
            {activeTab === 'oversight' && <ManagerOversight />}
          </div>
        </Suspense>
      </EmbeddedProvider>
    </div>
  );
}
