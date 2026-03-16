import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';

const UsersSettings = lazy(() => import('@/pages/settings/UsersSettings'));
const PendingStockApprovals = lazy(() => import('@/pages/manager/PendingStockApprovals'));
const ManagerOversight = lazy(() => import('@/pages/manager/ManagerOversight'));
const DisputeCenter = lazy(() => import('@/pages/disputes/DisputeCenter'));

const Loading = () => (
  <div className="flex items-center justify-center py-16">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const tabs = [
  { id: 'users', label: 'Users' },
  { id: 'approvals', label: 'Pending Approvals' },
  { id: 'oversight', label: 'Team Oversight' },
  { id: 'disputes', label: 'Dispute Center' },
];

export default function TeamModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'users';

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
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
          <TabsContent value="users" className="mt-4"><UsersSettings embedded /></TabsContent>
          <TabsContent value="approvals" className="mt-4"><PendingStockApprovals embedded /></TabsContent>
          <TabsContent value="oversight" className="mt-4"><ManagerOversight embedded /></TabsContent>
          <TabsContent value="disputes" className="mt-4"><DisputeCenter embedded /></TabsContent>
        </Suspense>
      </Tabs>
    </div>
  );
}
